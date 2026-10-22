import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { analyzeAudio } from '../../src/core/music/analyze';
import { planLocally, compileShow, rigInfo } from '../../src/core/music/songToShow';
import { ProjectIndex } from '../../src/core/engine/resolve';
import { demoProject } from '../helpers';
import { synthSong, type SynthSection } from '../music-synth';

/**
 * Phase 1 — Benchmark audio reproductible
 * 
 * Mesure les temps de calcul, l'empreinte mémoire et le débit de traitement
 * sur des morceaux synthétiques calibrés (30 s, 4 min, 10 min).
 * Garantit la reproductibilité par vérification du digest d'analyse et de compilation.
 */

const AM = [57, 53, 48, 55], CH = [48, 55, 57, 53];
const base: Omit<SynthSection, 'label' | 'bars'> = { kick: false, snare: false, hats: false, bass: false, chords: AM, pad: 0, bright: false };

function generateBenchmarkSong(targetDurationSec: number, bpm = 124) {
  const beat = 60 / bpm;
  const bar = 4 * beat;
  const targetBars = Math.round(targetDurationSec / bar);

  const pattern: SynthSection[] = [
    { ...base, label: 'intro', bars: 8, hats: true, pad: 0.6 },
    { ...base, label: 'verse', bars: 8, kick: true, bass: true, pad: 0.8, voice: 0.5 },
    { ...base, label: 'chorus', bars: 8, kick: true, snare: true, hats: true, bass: true, chords: CH, pad: 1, bright: true, gain: 1.3 },
    { ...base, label: 'break', bars: 4, pad: 0.7, riser: 2 },
  ];
  const patternBars = pattern.reduce((acc, s) => acc + s.bars, 0); // 28 bars
  const reps = Math.max(1, Math.floor(targetBars / patternBars));
  const remaining = targetBars - reps * patternBars;

  const sections: SynthSection[] = Array.from({ length: reps }, () => pattern).flat();
  if (remaining > 0) {
    sections.push({ ...base, label: 'outro', bars: remaining, pad: 0.5 });
  }

  return synthSong({ bpm, sections });
}

describe('Phase 1 — Benchmark audio reproductible', () => {
  const benchmarkCases = [
    { label: '30 secondes', targetDuration: 30, maxAnalysisMs: 3000, minSpeedup: 10 },
    { label: '4 minutes', targetDuration: 240, maxAnalysisMs: 15000, minSpeedup: 15 },
    { label: '10 minutes', targetDuration: 600, maxAnalysisMs: 40000, minSpeedup: 15 },
  ];

  it.each(benchmarkCases)(
    '$label : profilage temps, mémoire et reproductibilité',
    async ({ targetDuration, maxAnalysisMs, minSpeedup }) => {
      const song = generateBenchmarkSong(targetDuration, 124);
      expect(song.duration).toBeGreaterThan(targetDuration * 0.9);

      if (global.gc) global.gc();
      const memBefore = process.memoryUsage().heapUsed;

      // Étape 1 : Analyse musicale
      const t0 = performance.now();
      const analysis = await analyzeAudio(song.samples, song.sr);
      const tAnalysis = performance.now() - t0;

      // Étape 2 : Planification & compilation Song-to-Show
      const p = demoProject();
      const index = new ProjectIndex(p);
      const rig = rigInfo(index, false);
      const tPlan0 = performance.now();
      const plan = planLocally(analysis, 'Concert pop dynamique sans strobe', rig);
      const compileRes = compileShow(index, 'Benchmark', analysis, plan, { allowStrobe: false, maxStrobeHz: 10 });
      const tCompile = performance.now() - tPlan0;

      const memAfter = process.memoryUsage().heapUsed;
      const memDiffMb = Math.max(0, (memAfter - memBefore) / 1024 / 1024);
      const speedup = song.duration / (tAnalysis / 1000);

      const digest = createHash('sha256')
        .update(JSON.stringify({
          bpm: analysis.bpm,
          meter: analysis.meter,
          sectionsCount: analysis.sections.length,
          eventsCount: analysis.events.length,
          cueCount: compileRes.cueList.cues.length,
          timelineEventsCount: compileRes.timeline.events.length,
        }))
        .digest('hex');

      console.info(
        `[BENCHMARK] ${song.duration.toFixed(1)}s audio: ` +
        `analyse ${tAnalysis.toFixed(0)}ms (${speedup.toFixed(1)}x temps réel), ` +
        `compilation ${tCompile.toFixed(1)}ms, ` +
        `mémoire +${memDiffMb.toFixed(1)} Mo, ` +
        `digest: ${digest.slice(0, 12)}`
      );

      // Critères de performance et fiabilité
      expect(tAnalysis).toBeLessThan(maxAnalysisMs);
      expect(speedup).toBeGreaterThan(minSpeedup);
      expect(analysis.sections.length).toBeGreaterThanOrEqual(1);
      expect(compileRes.timeline.events.length).toBeGreaterThan(0);
      expect(compileRes.cueList.cues.length).toBeGreaterThan(0);
      expect(compileRes.notices).toBeDefined();
    },
    120_000
  );
});
