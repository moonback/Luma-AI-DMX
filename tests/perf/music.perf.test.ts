import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { analyzeAudio, estimateTempo, trackBeats } from '../../src/core/music/analyze';
import { Spectrum } from '../../src/core/music/dsp';
import { synthSong, type SynthSection } from '../music-synth';

/**
 * Analysis cost by song length. Run alone (`npm run test:perf`). Set MUSIC_DUMP=<file> to write a digest of the
 * analyses, so a refactor can be checked for identical output (diff the dump before / after).
 */
const AM = [57, 53, 48, 55], CH = [48, 55, 57, 53];
const base = { kick: false, snare: false, hats: false, bass: false, chords: AM, pad: 0, bright: false };
const block: SynthSection[] = [
  { ...base, label: 'intro', bars: 8, hats: true, pad: 0.6 },
  { ...base, label: 'verse', bars: 8, kick: true, bass: true, pad: 0.8, voice: 0.5 },
  { ...base, label: 'chorus', bars: 8, kick: true, snare: true, hats: true, bass: true, chords: CH, pad: 1, bright: true, gain: 1.3 },
  { ...base, label: 'break', bars: 4, pad: 0.7, riser: 2 },
];
const song = (reps: number) => synthSong({ bpm: 124, sections: Array.from({ length: reps }, () => block).flat() });
const ms = (f: () => void) => { const t = performance.now(); f(); return performance.now() - t; };

describe('analyse musicale', () => {
  const dump: Record<string, unknown> = {};
  afterAll(() => { if (process.env.MUSIC_DUMP) writeFileSync(process.env.MUSIC_DUMP, JSON.stringify(dump, null, 1)); });

  it.each([1, 3, 6])('%i bloc(s) : coût par étape', async (reps) => {
    const { samples, sr, duration } = song(reps);
    const size = 2 ** Math.round(Math.log2(sr * 0.093));
    const spec = new Spectrum(size, sr);
    const hop = size / 4, n = Math.floor((samples.length - size) / hop) + 1;
    const tFrames = ms(() => { for (let i = 0; i < n; i++) spec.frame(samples, i * hop); });
    const fr = sr / hop;
    const onset = Float32Array.from({ length: n }, (_, i) => Math.abs(Math.sin(i * 0.37)) * (i % 11 === 0 ? 4 : 1));
    let bpm = 0;
    const tTempo = ms(() => { bpm = estimateTempo(onset, fr); });
    const tBeats = ms(() => { trackBeats(onset, (60 * fr) / bpm); });
    const t0 = performance.now();
    const a = await analyzeAudio(samples, sr);
    const total = performance.now() - t0;
    console.info(`[music] ${duration.toFixed(0)} s : total ${total.toFixed(0)} ms (frames ${tFrames.toFixed(0)}, tempo ${tTempo.toFixed(1)}, beats ${tBeats.toFixed(1)}), ${a.sections.length} sections`);
    dump[`${reps}`] = { sha: createHash('sha1').update(JSON.stringify(a)).digest('hex'), a };
    expect(a.bpm).toBeGreaterThan(120);
  }, 120_000);
});
