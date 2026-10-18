import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * Minimal ZIP container support for GDTF / MVR files: read stored or deflated entries, write deflated ones.
 * No encryption, no ZIP64, no multi-disk archives (never used by these formats).
 */
export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Refuse archives that would inflate past this (zip bombs). */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

export class ZipError extends Error {}

/** Lists the archive's file names and lazily inflates the one asked for. */
export function readZip(buf: Uint8Array): { names: string[]; read(name: string): Uint8Array | null } {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65_535); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('Archive ZIP invalide (répertoire central introuvable)');
  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  const entries = new Map<string, { method: number; size: number; packed: number; offset: number }>();
  for (let i = 0; i < count; i++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) throw new ZipError('Archive ZIP invalide (entrée centrale corrompue)');
    const method = b.readUInt16LE(p + 10);
    const packed = b.readUInt32LE(p + 20);
    const size = b.readUInt32LE(p + 24);
    const nameLen = b.readUInt16LE(p + 28), extraLen = b.readUInt16LE(p + 30), commentLen = b.readUInt16LE(p + 32);
    const offset = b.readUInt32LE(p + 42);
    const name = b.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    entries.set(name, { method, size, packed, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      if (e.size > MAX_ENTRY_BYTES) throw new ZipError(`« ${name} » est trop volumineux (${Math.round(e.size / 1e6)} Mo)`);
      if (b.readUInt32LE(e.offset) !== 0x04034b50) throw new ZipError(`« ${name} » : en-tête local corrompu`);
      const start = e.offset + 30 + b.readUInt16LE(e.offset + 26) + b.readUInt16LE(e.offset + 28);
      const raw = b.subarray(start, start + e.packed);
      if (e.method === 0) return new Uint8Array(raw);
      if (e.method === 8) return new Uint8Array(inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES }));
      throw new ZipError(`« ${name} » : compression ${e.method} non prise en charge`);
    },
  };
}

/** Builds a ZIP archive (deflate) from in-memory entries. */
export function writeZip(entries: ZipEntry[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.from(e.data.buffer, e.data.byteOffset, e.data.byteLength);
    const packed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    centrals.push(central, name);
    offset += 30 + name.length + packed.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}
