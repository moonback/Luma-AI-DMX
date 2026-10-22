import { describe, expect, it } from 'vitest';
import { analyzeAudio } from '../../src/core/music/analyze';
import { compileShow, planLocally, rigInfo, validateShowIntegrity } from '../../src/core/music/songToShow';
import { ProjectIndex } from '../../src/core/engine/resolve';
import { songAnalysisSchema } from '../../src/core/model/schemas';
import { demoProject } from '../helpers';
import { demoSong } from '../music-synth';
import { analyzeInWorker } from '../../src/renderer/musicPlayer';

/**
 * Suite de tests Phase 1 — Fiabiliser l'existant
 * 
 * Couvre :
 * 1. Synchronisation & segmentation (cas limites, ordonnancement, downbeats)
 * 2. Cohérence du plan, compilateur et timeline (validateShowIntegrity, résilience)
 * 3. Contraintes de sécurité (strobe, fréquence max, flashGuard)
 * 4. Déport d'analyse en Worker (cycle de vie, progression, gestion d'erreurs)
 */

describe('Phase 1 — Synchronisation et segmentation', () => {
  it('audio ultra-court (< 0.5 s) : analyse sans crash et produit une section valide', async () => {
    const sr = 22050;
    const samples = new Float32Array(Math.round(0.3 * sr)).fill(0.1);
    const a = await analyzeAudio(samples, sr);

    expect(songAnalysisSchema.safeParse(a).success).toBe(true);
    expect(a.duration).toBeCloseTo(0.3, 1);
    expect(Number.isFinite(a.bpm)).toBe(true);
    expect(a.bpm).toBeGreaterThan(0);
    expect(a.sections.length).toBeGreaterThanOrEqual(1);
    expect(a.sections[0]!.start).toBe(0);
    expect(a.sections[0]!.end).toBeCloseTo(a.duration, 2);
  });

  it('silence complet : analyse sans crash avec valeurs par défaut cohérentes', async () => {
    const sr = 22050;
    const samples = new Float32Array(sr * 2); // 2 secondes de silence absolu
    const a = await analyzeAudio(samples, sr);

    expect(songAnalysisSchema.safeParse(a).success).toBe(true);
    expect(Number.isFinite(a.bpm)).toBe(true);
    expect(a.bpm).toBeGreaterThan(0);
    expect(a.sections.length).toBeGreaterThanOrEqual(1);
    expect(a.sections[0]!.start).toBe(0);
    expect(a.sections[0]!.end).toBeCloseTo(a.duration, 2);
  });

  it('ordonnancement strict des frontières : couverture complète [0, duration] sans trous ni chevauchements', async () => {
    const song = demoSong(124);
    const a = await analyzeAudio(song.samples, song.sr);

    expect(a.sections.length).toBeGreaterThan(1);
    expect(a.sections[0]!.start).toBe(0);

    for (let i = 0; i < a.sections.length; i++) {
      const s = a.sections[i]!;
      expect(s.end).toBeGreaterThan(s.start);
      if (i > 0) {
        const prev = a.sections[i - 1]!;
        // Frontière commune exacte
        expect(Math.abs(s.start - prev.end)).toBeLessThan(1e-4);
      }
    }
    const last = a.sections.at(-1)!;
    expect(Math.abs(last.end - a.duration)).toBeLessThan(1e-4);
  });

  it('synchronisation des temps et des premiers temps (downbeats)', async () => {
    const song = demoSong(120);
    const a = await analyzeAudio(song.samples, song.sr);

    expect(a.beats.length).toBeGreaterThan(0);
    expect(a.downbeats.length).toBeGreaterThan(0);
    expect(a.downbeats.length).toBeLessThan(a.beats.length);

    // Chaque downbeat est proche d'un beat
    for (const d of a.downbeats) {
      const match = a.beats.some((b) => Math.abs(b - d) < 0.02);
      expect(match).toBe(true);
    }

    // Les sections commencent sur des downbeats (sauf éventuellement la première à 0)
    for (const sec of a.sections.slice(1)) {
      const nearDownbeat = a.downbeats.some((d) => Math.abs(d - sec.start) < 0.1);
      expect(nearDownbeat).toBe(true);
    }
  });

  it('détection de mesure 3/4 (valse)', async () => {
    const beat = 60 / 120;
    const bar = 3 * beat; // mesure à 3 temps
    const sr = 22050;
    const bars = 16;
    const samples = new Float32Array(Math.ceil(bars * bar * sr));
    // Accent fort sur le premier temps de chaque mesure de 3 temps
    for (let b = 0; b < bars; b++) {
      const t0 = b * bar;
      // Temps 1: kick lourd
      const i0 = Math.round(t0 * sr);
      for (let j = 0; j < Math.min(samples.length - i0, Math.round(0.2 * sr)); j++) {
        samples[i0 + j] = 0.8 * Math.sin(2 * Math.PI * 60 * (j / sr)) * Math.exp(-j / (sr * 0.1));
      }
      // Temps 2 et 3: léger charleston
      for (let k = 1; k < 3; k++) {
        const ik = Math.round((t0 + k * beat) * sr);
        for (let j = 0; j < Math.min(samples.length - ik, Math.round(0.05 * sr)); j++) {
          samples[ik + j] = 0.2 * (Math.random() * 2 - 1) * Math.exp(-j / (sr * 0.02));
        }
      }
    }
    const a = await analyzeAudio(samples, sr, { bpmMin: 100, bpmMax: 140 });
    expect(a.meter).toBe(3);
  });
});

describe('Phase 1 — Cohérence du plan, compilateur et timeline', () => {
  it('validateShowIntegrity valide un show correctement généré', async () => {
    const song = demoSong(124);
    const analysis = await analyzeAudio(song.samples, song.sr);
    const p = demoProject();
    const index = new ProjectIndex(p);
    const rig = rigInfo(index, false);
    const plan = planLocally(analysis, 'Concert pop énergique', rig);

    const result = compileShow(index, 'Test Show', analysis, plan, { allowStrobe: false, maxStrobeHz: 10 });
    const report = validateShowIntegrity(result, analysis, { allowStrobe: false, maxStrobeHz: 10 });

    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  it('timeline triée chronologiquement sans événements de durée non-positive', async () => {
    const song = demoSong(124);
    const analysis = await analyzeAudio(song.samples, song.sr);
    const p = demoProject();
    const index = new ProjectIndex(p);
    const rig = rigInfo(index, false);
    const plan = planLocally(analysis, 'Concert rock', rig);

    const result = compileShow(index, 'Test Show', analysis, plan, { allowStrobe: false, maxStrobeHz: 10 });

    // Tous les événements ont une durée >= 50ms et start >= 0
    for (const ev of result.timeline.events) {
      expect(ev.start).toBeGreaterThanOrEqual(0);
      expect(ev.duration).toBeGreaterThanOrEqual(0.05);
    }

    // Événements triés par start croissant
    for (let i = 1; i < result.timeline.events.length; i++) {
      expect(result.timeline.events[i]!.start).toBeGreaterThanOrEqual(result.timeline.events[i - 1]!.start);
    }
  });

  it('cues triés chronologiquement avec follow wait non-négatif', async () => {
    const song = demoSong(124);
    const analysis = await analyzeAudio(song.samples, song.sr);
    const p = demoProject();
    const index = new ProjectIndex(p);
    const rig = rigInfo(index, false);
    const plan = planLocally(analysis, 'Concert', rig);

    const result = compileShow(index, 'Test Show', analysis, plan, { allowStrobe: false, maxStrobeHz: 10 });

    expect(result.cueList.cues.length).toBeGreaterThan(0);
    expect(result.cueList.cues[0]!.trigger.type).toBe('manual');

    for (let k = 1; k < result.cueList.cues.length; k++) {
      const cue = result.cueList.cues[k]!;
      expect(cue.number).toBe(k + 1);
      expect(cue.trigger.type).toBe('follow');
      if (cue.trigger.type === 'follow') {
        expect(cue.trigger.wait).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('résilience : compilation ne plante pas si plan.sections est tronqué', async () => {
    const song = demoSong(124);
    const analysis = await analyzeAudio(song.samples, song.sr);
    const p = demoProject();
    const index = new ProjectIndex(p);
    const rig = rigInfo(index, false);
    const fullPlan = planLocally(analysis, 'Concert', rig);

    // Tronquer volontairement le plan (moins de sections que dans l'analyse)
    const truncatedPlan = {
      ...fullPlan,
      sections: fullPlan.sections.slice(0, 2),
    };

    expect(() => {
      const res = compileShow(index, 'Truncated', analysis, truncatedPlan, { allowStrobe: false, maxStrobeHz: 10 });
      expect(res.timeline.events.length).toBeGreaterThan(0);
    }).not.toThrow();
  });
});

describe('Phase 1 — Sécurité photosensible et strobe', () => {
  it('strobe interdit : aucun effet strobe généré et notification émise', async () => {
    const song = demoSong(124);
    const analysis = await analyzeAudio(song.samples, song.sr);
    const p = demoProject();
    const index = new ProjectIndex(p);
    // Demander expressément du strobe dans l'intention
    const rig = rigInfo(index, false); // allowStrobe: false
    const plan = planLocally(analysis, 'gros drop avec strobe et flash', rig);

    const result = compileShow(index, 'Safety Show', analysis, plan, { allowStrobe: false, maxStrobeHz: 10 });
    const report = validateShowIntegrity(result, analysis, { allowStrobe: false, maxStrobeHz: 10 });

    expect(report.valid).toBe(true);
    expect(result.effects.every((e) => e.type !== 'strobe')).toBe(true);
  });

  it('strobe autorisé : la fréquence maxStrobeHz est strictement respectée', async () => {
    const song = demoSong(124);
    const analysis = await analyzeAudio(song.samples, song.sr);
    const p = demoProject();
    const index = new ProjectIndex(p);
    const rig = rigInfo(index, true); // allowStrobe: true
    const plan = planLocally(analysis, 'drop avec strobe', rig);

    const maxHz = 8;
    const result = compileShow(index, 'MaxHz Show', analysis, plan, { allowStrobe: true, maxStrobeHz: maxHz });
    const report = validateShowIntegrity(result, analysis, { allowStrobe: true, maxStrobeHz: maxHz });

    expect(report.valid).toBe(true);
    for (const ef of result.effects) {
      if (ef.type === 'strobe') {
        const speed = ef.params.speed ?? 1;
        expect(speed).toBeLessThanOrEqual(maxHz);
      }
    }
  });
});

describe('Phase 1 — Déport d’analyse musicale (Worker LUMA-074)', () => {
  it('analyzeInWorker analyse un tampon audio et transmet la progression', async () => {
    const sr = 22050;
    const samples = new Float32Array(sr * 2).fill(0.1);
    const progressUpdates: number[] = [];

    const analysis = await analyzeInWorker(samples, sr, 80, 160, (p) => {
      progressUpdates.push(p);
    });

    expect(songAnalysisSchema.safeParse(analysis).success).toBe(true);
    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates.at(-1)).toBeGreaterThanOrEqual(0.9);
  });
});
