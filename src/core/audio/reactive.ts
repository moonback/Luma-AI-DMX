import type { AudioConfig, FixtureValues } from '../model/schemas';
import { colorToAttributes } from '../fixtures/color';
import type { Engine } from '../engine/Engine';
import type { ProjectIndex } from '../engine/resolve';
import { hexToRgb, lerp, mulberry32 } from '../util/math';
import type { AudioFeatures } from './analyzer';
import type { Prediction } from '../music/dropPredictor';

export interface AudioStatus {
  active: boolean;
  source: 'none' | 'live' | 'simulated' | 'track';
  level: number;
  energy: number;
  bpm: number | null;
  bpmConfidence: number;
  lastOnsetAt: number | null;
  lastEnergyRiseAt: number | null;
  tempoLocked: boolean;
  barPosition: number | null;
  prediction: Prediction | null;
  /** Predicted-drop GO armed (one shot) and, when scheduled, ms until it fires. */
  dropArmed: boolean;
  dropFiresInMs: number | null;
}

const STALE_MS = 1000;

/**
 * Movement radius (fraction of the pan/tilt range) of the onset follower. Typical music has 2–4 onsets/s, i.e. a
 * density of 0.25–0.5: it is stretched so that it already gives a clearly visible circle, and any playing music
 * keeps a base movement; silence (no energy) stops it.
 */
export function moveRadius(amount: number, energy: number, onsetDensity: number): number {
  return amount * 0.5 * Math.min(1, energy * 4) * (0.4 + 0.6 * Math.min(1, onsetDensity * 3));
}

export type ChaseDirection = 'forward' | 'backward' | 'bounce' | 'random';

/** Next step of a chase over `n` groups. `sign` is the bounce direction (+1/-1); `rnd` is a 0..1 source. */
export function nextChaseStep(idx: number, sign: 1 | -1, n: number, dir: ChaseDirection, rnd: () => number): { idx: number; sign: 1 | -1 } {
  if (n <= 1) return { idx: 0, sign };
  switch (dir) {
    case 'forward': return { idx: (idx + 1) % n, sign };
    case 'backward': return { idx: idx <= 0 ? n - 1 : idx - 1, sign };
    case 'random': {
      const j = Math.floor(rnd() * (n - 1)); // never the same group twice in a row
      return { idx: j >= idx && idx >= 0 ? j + 1 : j, sign };
    }
    case 'bounce': {
      let s = sign;
      let next = idx + s;
      if (next >= n || next < 0) { s = (s === 1 ? -1 : 1); next = idx + s; }
      return { idx: Math.max(0, Math.min(n - 1, next)), sign: s };
    }
  }
}

/**
 * Applies the user-enabled audio reactions to the engine. Every reaction is opt-in and individually disabled
 * by default; with no fresh features (source stopped) all audio contributions are released.
 */
export class AudioReactive {
  private features: AudioFeatures | null = null;
  private receivedAt = 0;
  private flash = 0;
  private source: AudioStatus['source'] = 'none';
  private lastOnsetAt: number | null = null;
  private lastRiseAt: number | null = null;
  private dropArmed = false;
  private dropAt: number | null = null;
  private movePhase = 0;
  private chaseIdx = -1;
  private chaseSign: 1 | -1 = 1;
  private chaseEnv = new Map<string, number>();
  private chaseRng = mulberry32(0x1a2b3c);
  private paletteIdx = -1;
  private paletteRgb: { r: number; g: number; b: number } | null = null;
  /** Called when the armed drop GO fires (for logging). */
  onDropFired: ((cueListId: string) => void) | null = null;
  /** Called when fresh features stop arriving without `release()` (window throttled, device lost…). */
  onStale: ((source: AudioStatus['source']) => void) | null = null;
  private fresh = false;

  constructor(
    private readonly engine: Engine,
    private readonly getIndex: () => ProjectIndex,
    private readonly getConfig: () => AudioConfig,
    private readonly priority: () => number,
    private readonly now: () => number = Date.now,
  ) {
    engine.onBeforeTick((dt) => this.update(dt));
  }

  push(f: AudioFeatures, source: 'live' | 'simulated' | 'track'): void {
    this.features = f;
    this.receivedAt = this.now();
    this.source = source;
    const r = this.getConfig().reactions;
    if (f.onset) {
      this.lastOnsetAt = this.receivedAt;
      this.engine.onBeat();
      if (r.beatFlash.enabled) this.flash = 1;
    }
    if (f.beat && f.barPosition === 0) this.engine.onDownbeat();
    if (f.energyRise) this.lastRiseAt = this.receivedAt;
    // Song to Show playback: the generated timeline drives the light, the Audio Reactive reactions stay out of it.
    // The beat clock and band levels above are still fed (timeline effects synced to the music use them).
    if (source === 'track') {
      this.flash = 0;
      this.dropAt = null;
      return;
    }
    const ch = r.beatChase;
    const pal = r.beatPalette;
    if (pal.enabled && f.beat && (pal.every === 'beat' || f.barPosition === 0)) this.paletteIdx = (this.paletteIdx + 1) % pal.colors.length;
    if (ch.enabled && ch.groupIds.length && f.beat && (ch.every === 'beat' || f.barPosition === 0)) {
      const step = nextChaseStep(this.chaseIdx, this.chaseSign, ch.groupIds.length, ch.direction, this.chaseRng);
      this.chaseIdx = step.idx;
      this.chaseSign = step.sign;
      this.chaseEnv.set(ch.groupIds[step.idx]!, 1);
    }
    this.scheduleDrop(f);
    if (f.energyRise && r.energyRiseGo.enabled && r.energyRiseGo.cueListId) this.engine.cueGo(r.energyRiseGo.cueListId);
    if (r.bpmFollow.enabled && f.bpm && f.bpmConfidence >= r.bpmFollow.minConfidence) {
      this.engine.bpm = f.bpm;
      this.engine.bpmSource = 'audio';
    }
  }

  /** The source was stopped on purpose: drop the last features so their expiry is not reported as an interruption. */
  release(): void {
    this.features = null;
    this.fresh = false;
  }

  armDrop(on: boolean): void {
    this.dropArmed = on;
    if (!on) this.dropAt = null;
  }

  /** Converts the prediction's time (renderer clock) to this clock and keeps the latest estimate. */
  private scheduleDrop(f: AudioFeatures): void {
    const cfg = this.getConfig().reactions.dropGo;
    const p = f.prediction;
    if (!this.dropArmed || !cfg.enabled || !cfg.cueListId) return;
    if (p && cfg.kinds.includes(p.kind) && p.confidence >= cfg.minConfidence) this.dropAt = this.receivedAt + (p.at - f.t) * 1000;
    else if (this.dropAt !== null && this.dropAt - this.receivedAt > 600) this.dropAt = null; // prediction withdrawn well before the time
  }

  private update(dtMs: number): void {
    const cfgDrop = this.getConfig().reactions.dropGo;
    if (this.dropArmed && this.dropAt !== null && this.now() >= this.dropAt && cfgDrop.cueListId && this.source !== 'track') {
      this.engine.cueGo(cfgDrop.cueListId);
      this.dropArmed = false; // one shot: re-arm explicitly for the next drop
      this.dropAt = null;
      this.onDropFired?.(cfgDrop.cueListId);
    }
    const fresh = !!this.features && this.now() - this.receivedAt < STALE_MS;
    if (this.fresh && !fresh) this.onStale?.(this.source);
    this.fresh = fresh;
    this.engine.audioBands = fresh ? { bass: this.features!.bass, brightness: this.features!.brightness } : null;
    if (!fresh) {
      this.engine.setExternal('audio', null);
      if (this.engine.bpmSource === 'audio') this.engine.bpmSource = 'manual';
      this.source = this.features ? this.source : 'none';
      return;
    }
    if (this.source === 'track') {
      // Song to Show: no audio layer at all (see push()); a BPM taken from a previous live source goes back to manual.
      this.engine.setExternal('audio', null);
      if (this.engine.bpmSource === 'audio') this.engine.bpmSource = 'manual';
      this.chaseEnv.clear();
      this.chaseIdx = -1;
      this.paletteIdx = -1;
      this.paletteRgb = null;
      return;
    }
    const f = this.features!;
    const cfg = this.getConfig().reactions;
    const index = this.getIndex();
    const prio = this.priority();
    const layer: FixtureValues = {};
    const scale: FixtureValues = {};
    if (cfg.beatFlash.enabled) {
      this.flash *= Math.exp(-dtMs / 1000 / cfg.beatFlash.decay);
      for (const rf of index.resolveTargets(cfg.beatFlash.targets)) (layer[rf.fixture.id] ??= {}).dimmer = this.flash;
    }
    if (cfg.beatChase.enabled && cfg.beatChase.groupIds.length) {
      const k = Math.exp(-dtMs / 1000 / cfg.beatChase.decay);
      for (const gid of cfg.beatChase.groupIds) {
        const env = (this.chaseEnv.get(gid) ?? 0) * k;
        this.chaseEnv.set(gid, env);
        for (const rf of index.resolveTargets({ fixtureIds: [], groupIds: [gid] })) (layer[rf.fixture.id] ??= {}).dimmer = env;
      }
    } else if (this.chaseEnv.size) {
      this.chaseEnv.clear();
      this.chaseIdx = -1;
    }
    if (cfg.energyToColor.enabled) {
      const lo = hexToRgb(cfg.energyToColor.lowColor), hi = hexToRgb(cfg.energyToColor.highColor);
      const e = Math.min(1, f.energy * 1.5);
      const rgb = { r: lerp(lo.r, hi.r, e), g: lerp(lo.g, hi.g, e), b: lerp(lo.b, hi.b, e) };
      for (const rf of index.resolveTargets(cfg.energyToColor.targets)) Object.assign((layer[rf.fixture.id] ??= {}), colorToAttributes(rf, rgb));
    }
    if (cfg.levelToIntensity.enabled) {
      const k = cfg.levelToIntensity.floor + (1 - cfg.levelToIntensity.floor) * Math.min(1, f.energy * 1.5);
      for (const rf of index.resolveTargets(cfg.levelToIntensity.targets)) scale[rf.fixture.id] = { dimmer: k };
    }
    const fl = cfg.followers;
    if (fl.intensityFromBass.enabled) {
      const k = 1 - fl.intensityFromBass.amount + fl.intensityFromBass.amount * Math.min(1, f.bass * 1.4);
      for (const rf of index.resolveTargets(fl.intensityFromBass.targets)) scale[rf.fixture.id] = { dimmer: (scale[rf.fixture.id]?.dimmer ?? 1) * k };
    }
    // Mid / high band intensity followers: the band means are low on real music, hence the larger gain.
    for (const [cfgBand, level, gain] of [[fl.intensityFromMid, f.mid ?? 0, 2], [fl.intensityFromHigh, f.high ?? 0, 3]] as const) {
      if (!cfgBand.enabled) continue;
      const k = 1 - cfgBand.amount + cfgBand.amount * Math.min(1, level * gain);
      for (const rf of index.resolveTargets(cfgBand.targets)) scale[rf.fixture.id] = { dimmer: (scale[rf.fixture.id]?.dimmer ?? 1) * k };
    }
    if (fl.colorFromBrightness.enabled) {
      const lo = hexToRgb(fl.colorFromBrightness.darkColor), hi = hexToRgb(fl.colorFromBrightness.brightColor);
      const b = Math.min(1, f.brightness * 2);
      const rgb = { r: lerp(lo.r, hi.r, b), g: lerp(lo.g, hi.g, b), b: lerp(lo.b, hi.b, b) };
      for (const rf of index.resolveTargets(fl.colorFromBrightness.targets)) Object.assign((layer[rf.fixture.id] ??= {}), colorToAttributes(rf, rgb));
    }
    if (fl.moveFromOnsets.enabled) {
      // One circle per bar; the radius follows the onset density (busy music = wide movement).
      this.movePhase += (dtMs / 1000) * (this.engine.bpm / 60 / 4) * Math.PI * 2;
      const r = moveRadius(fl.moveFromOnsets.amount, f.energy, f.onsetDensity);
      for (const rf of index.resolveTargets(fl.moveFromOnsets.targets)) {
        if (!rf.attributes.includes('pan') && !rf.attributes.includes('tilt')) continue;
        Object.assign((layer[rf.fixture.id] ??= {}), { pan: 0.5 + r * Math.cos(this.movePhase), tilt: 0.5 + r * Math.sin(this.movePhase) });
      }
    }
    // Intensity reactions drive the dimmer themselves: a fixture with nothing else lit turns on with the sound
    // (a pure scale would leave it dark). The strongest audio contribution wins over the flash/chase value.
    for (const [id, s] of Object.entries(scale)) {
      const v = s.dimmer;
      if (v !== undefined) (layer[id] ??= {}).dimmer = Math.max(layer[id]?.dimmer ?? 0, v);
      delete scale[id];
    }
    const pal = cfg.beatPalette;
    if (pal.enabled && this.paletteIdx >= 0) {
      const to = hexToRgb(pal.colors[this.paletteIdx % pal.colors.length]!);
      const cur = this.paletteRgb ?? to;
      const a = pal.fade > 0 ? 1 - Math.exp(-dtMs / 1000 / pal.fade) : 1;
      const rgb = (this.paletteRgb = { r: lerp(cur.r, to.r, a), g: lerp(cur.g, to.g, a), b: lerp(cur.b, to.b, a) });
      for (const rf of index.resolveTargets(pal.targets)) Object.assign((layer[rf.fixture.id] ??= {}), colorToAttributes(rf, rgb));
    } else {
      this.paletteRgb = null;
      if (!pal.enabled) this.paletteIdx = -1;
    }
    this.engine.setExternal('audio', {
      layer: Object.keys(layer).length ? { id: 'audio', label: 'Audio', kind: 'audio', priority: prio, order: 0, values: layer } : undefined,
      effects: Object.keys(scale).length ? [{ id: 'audio-level', label: 'Audio · niveau', priority: prio, order: 0, blend: 'scale', values: scale }] : [],
    });
  }

  status(): AudioStatus {
    const f = this.features;
    const active = !!f && this.now() - this.receivedAt < STALE_MS;
    return {
      active,
      source: active ? this.source : 'none',
      level: active ? f!.level : 0,
      energy: active ? f!.energy : 0,
      bpm: active ? f!.bpm : null,
      bpmConfidence: active ? f!.bpmConfidence : 0,
      lastOnsetAt: this.lastOnsetAt,
      lastEnergyRiseAt: this.lastRiseAt,
      tempoLocked: active ? f!.tempoLocked : false,
      barPosition: active ? f!.barPosition : null,
      prediction: active ? f!.prediction : null,
      dropArmed: this.dropArmed,
      dropFiresInMs: this.dropAt === null ? null : Math.max(0, this.dropAt - this.now()),
    };
  }
}
