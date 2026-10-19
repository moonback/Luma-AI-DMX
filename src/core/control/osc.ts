import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';

/** Open Sound Control 1.0: messages and bundles over UDP. Supported argument types: i, f, s, T, F. */
export type OscArg = number | string | boolean;
export interface OscMessage {
  address: string;
  args: OscArg[];
}

const pad4 = (n: number) => (n + 3) & ~3;

function readString(buf: Buffer, at: number): [string, number] {
  const end = buf.indexOf(0, at);
  if (end < 0) throw new Error('chaîne OSC non terminée');
  return [buf.toString('utf8', at, end), pad4(end + 1)];
}

/** Parses one UDP packet (message or bundle, recursively). Throws on malformed data. */
export function parseOsc(buf: Buffer): OscMessage[] {
  if (buf.toString('ascii', 0, 8) === '#bundle\0') {
    const out: OscMessage[] = [];
    for (let at = 16; at + 4 <= buf.length;) {
      const size = buf.readInt32BE(at);
      if (size <= 0 || at + 4 + size > buf.length) throw new Error('élément de bundle OSC invalide');
      out.push(...parseOsc(buf.subarray(at + 4, at + 4 + size)));
      at += 4 + size;
    }
    return out;
  }
  const [address, afterAddress] = readString(buf, 0);
  if (!address.startsWith('/')) throw new Error('adresse OSC invalide');
  if (afterAddress >= buf.length) return [{ address, args: [] }];
  const [tags, afterTags] = readString(buf, afterAddress);
  let at = afterTags;
  const args: OscArg[] = [];
  for (const t of tags.slice(1)) {
    if (t === 'i') { args.push(buf.readInt32BE(at)); at += 4; }
    else if (t === 'f') { args.push(buf.readFloatBE(at)); at += 4; }
    else if (t === 's') { let s: string; [s, at] = readString(buf, at); args.push(s); }
    else if (t === 'T' || t === 'F') args.push(t === 'T');
    else throw new Error(`type OSC non pris en charge « ${t} »`);
  }
  return [{ address, args }];
}

export function encodeOsc(address: string, args: OscArg[] = []): Buffer {
  const str = (s: string) => { const b = Buffer.alloc(pad4(Buffer.byteLength(s) + 1)); b.write(s); return b; };
  const parts = [str(address)];
  let tags = ',';
  for (const a of args) {
    if (typeof a === 'boolean') tags += a ? 'T' : 'F';
    else if (typeof a === 'string') { tags += 's'; parts.push(str(a)); }
    else if (Number.isInteger(a)) { tags += 'i'; const b = Buffer.alloc(4); b.writeInt32BE(a); parts.push(b); }
    else { tags += 'f'; const b = Buffer.alloc(4); b.writeFloatBE(a); parts.push(b); }
  }
  parts.splice(1, 0, str(tags));
  return Buffer.concat(parts);
}

/** Packets accepted per sender and second (bursts up to twice that); the rest is dropped and counted. */
export const OSC_RATE_PER_S = 200;
/** Malformed packets of one sender are reported once, then summed up at most every this many ms. */
export const OSC_ERROR_REPORT_MS = 10_000;

/** UDP OSC receiver; replies `/luma/ack <address> <ok>` to the sender of each handled message (unless `ack` is off). */
export class OscServer extends EventEmitter<{ message: [OscMessage, (ok: boolean) => void]; error: [Error] }> {
  private socket: dgram.Socket | null = null;
  /** Off: nothing is sent back, so spoofed senders cannot use the console as a reflector. */
  ack = true;
  /** Packets dropped by the per-sender rate limit since the start. */
  dropped = 0;
  /** Senders allowed on the network (null: any); 127.0.0.1 always is. Refused packets are counted, never parsed. */
  allow: ((ip: string) => boolean) | null = null;
  refused = 0;
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  private readonly malformed = new Map<string, { count: number; at: number }>();

  constructor(private readonly now: () => number = Date.now) {
    super();
  }

  private take(ip: string): boolean {
    const t = this.now();
    if (this.buckets.size >= 4096 && !this.buckets.has(ip)) this.buckets.clear();
    const b = this.buckets.get(ip) ?? { tokens: OSC_RATE_PER_S * 2, at: t };
    b.tokens = Math.min(OSC_RATE_PER_S * 2, b.tokens + ((t - b.at) / 1000) * OSC_RATE_PER_S);
    b.at = t;
    this.buckets.set(ip, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  private reportMalformed(ip: string, reason: string): void {
    const t = this.now();
    const m = this.malformed.get(ip);
    if (!m) {
      if (this.malformed.size >= 4096) this.malformed.clear();
      this.malformed.set(ip, { count: 0, at: t });
      this.emit('error', new Error(`Paquet OSC ignoré (${ip}) : ${reason}`));
      return;
    }
    m.count++;
    if (t - m.at >= OSC_ERROR_REPORT_MS) {
      this.emit('error', new Error(`${m.count} paquet(s) OSC invalides de ${ip} ignorés en ${Math.round((t - m.at) / 1000)} s (dernier : ${reason})`));
      m.count = 0;
      m.at = t;
    }
  }

  async start(port: number, address: string): Promise<void> {
    await this.stop();
    const s = dgram.createSocket('udp4');
    s.on('message', (buf, rinfo) => {
      if (this.allow && rinfo.address !== '127.0.0.1' && !this.allow(rinfo.address)) {
        this.refused++;
        return;
      }
      if (!this.take(rinfo.address)) {
        this.dropped++;
        return;
      }
      let msgs: OscMessage[];
      try {
        msgs = parseOsc(buf);
      } catch (err) {
        this.reportMalformed(rinfo.address, (err as Error).message);
        return;
      }
      for (const m of msgs) this.emit('message', m, (ok) => { if (this.ack) s.send(encodeOsc('/luma/ack', [m.address, ok]), rinfo.port, rinfo.address); });
    });
    s.on('error', (err) => this.emit('error', err));
    await new Promise<void>((resolve, reject) => {
      s.once('error', reject);
      s.bind(port, address, () => { s.off('error', reject); resolve(); });
    });
    this.socket = s;
  }

  async stop(): Promise<void> {
    const s = this.socket;
    this.socket = null;
    if (s) await new Promise<void>((r) => s.close(() => r()));
  }

  get port(): number | null {
    return this.socket?.address().port ?? null;
  }

  /** Sends one message from the listening socket (state feedback); nothing when the server is stopped. */
  send(address: string, args: OscArg[], host: string, port: number): void {
    this.socket?.send(encodeOsc(address, args), port, host);
  }
}

const ipNum = (ip: string) => ip.split('.').reduce((n, p) => n * 256 + Number(p), 0);

/** Matcher for a list of IPv4 addresses or CIDR ranges (« 192.168.1.0/24 »). */
export function allowList(entries: readonly string[]): (ip: string) => boolean {
  const ranges = entries.map((e) => {
    const [addr, bits = '32'] = e.split('/');
    const n = Math.min(32, Math.max(0, Number(bits)));
    const mask = n === 0 ? 0 : (0xffffffff << (32 - n)) >>> 0;
    return { net: (ipNum(addr!) & mask) >>> 0, mask };
  });
  return (ip) => {
    const v = ipNum(ip.replace(/^::ffff:/u, ''));
    return ranges.some((r) => ((v & r.mask) >>> 0) === r.net);
  };
}
