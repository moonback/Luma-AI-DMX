import { AudioAnalyzer, simulateFrames } from '../../src/core/audio/analyzer';
import { defaultSettings, settingsSchema } from '../../src/core/settings/settings';

const opts = { sensitivity: 1, smoothing: 0.6, onsetThreshold: 1.5, riseRatio: 1.8 };

/** 120 BPM kicks with an accented downbeat every 4 beats, so the bar position is meaningful. */
const frames = simulateFrames({ bpm: 120, seconds: 12, hats: true }).map((f) => ({ ...f, bass: f.bass * (Math.floor(f.t / 0.5) % 4 === 0 ? 1 : 0.4) }));

/** Beat times (and bar positions) after the tracker has locked. */
function beats(latencyS: number) {
  const a = new AudioAnalyzer(opts);
  a.latency = latencyS;
  return frames
    .map((f) => a.push(f))
    .filter((f) => f.beat && f.t > 6)
    .map((f) => ({ t: f.t, bar: f.barPosition }));
}

describe('compensation de latence audio', () => {
  it('migre les anciens réglages sans latence vers 0 ms', () => {
    expect(defaultSettings().audio.latencyMs).toBe(0);
    expect(settingsSchema.parse({ audio: { deviceId: 'carte-son' } }).audio).toEqual({ deviceId: 'carte-son', latencyMs: 0 });
    expect(settingsSchema.safeParse({ audio: { deviceId: null, latencyMs: 400 } }).success).toBe(false);
  });

  it('annonce chaque beat 100 ms plus tôt, une fois par beat, avec la même position dans la mesure', () => {
    const ref = beats(0);
    const early = beats(0.1);
    expect(ref.length).toBeGreaterThan(8);
    expect(new Set(ref.map((b) => b.bar)).size).toBe(4);
    // Each reference beat has exactly one early twin ≈ 100 ms before it (± one 16.7 ms frame).
    const paired = ref.slice(1).map((b) => early.filter((e) => Math.abs(b.t - e.t - 0.1) <= 1 / 60 + 1e-6));
    for (const twins of paired) expect(twins).toHaveLength(1);
    // Same bar position, except where the tracker re-picks the downbeat on the beat itself (it does so without latency too).
    const same = paired.filter((twins, i) => twins[0]!.bar === ref[i + 1]!.bar).length;
    expect(same / paired.length).toBeGreaterThanOrEqual(0.8);
  });

  it('reste plafonnée sous une période de beat', () => {
    const late = beats(5);
    const gaps = late.slice(1).map((b, i) => b.t - late[i]!.t);
    expect(Math.min(...gaps)).toBeGreaterThan(0.4); // no double beats at 120 BPM (period 0.5 s)
  });
});
