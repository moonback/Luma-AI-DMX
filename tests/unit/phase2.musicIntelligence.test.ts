import { describe, it, expect, beforeAll } from 'vitest';
import { analyzeAudio } from '../../src/core/music/analyze';
import { planLocally } from '../../src/core/music/showPlanner';
import { songAnalysisSchema, type SongAnalysis } from '../../src/core/model/schemas';
import { demoSong, edmSong, synthSong } from '../music-synth';

describe('Phase 2 — Intelligence musicale et indices de confiance', () => {
  let pop: SongAnalysis, edm: SongAnalysis, sung: SongAnalysis, waltz: SongAnalysis;

  const base = { kick: false, snare: false, hats: false, bass: false, chords: [57, 53, 48, 55], pad: 0, bright: false };
  const sungSong = synthSong({
    bpm: 120,
    sections: [
      { ...base, label: 'intro', bars: 8, hats: true, pad: 0.6 },
      { ...base, label: 'verse', bars: 8, kick: true, bass: true, pad: 0.8, voice: 1 },
      { ...base, label: 'chorus', bars: 8, kick: true, snare: true, hats: true, bass: true, pad: 1, bright: true, gain: 1.3 },
      { ...base, label: 'verse', bars: 8, kick: true, bass: true, pad: 0.8, voice: 1 },
      { ...base, label: 'outro', bars: 4, pad: 0.5, gain: 0.6 },
    ],
  });

  // Valse 3/4
  const waltzSong = synthSong({
    bpm: 135,
    meter: 3,
    sections: [
      { ...base, label: 'intro', bars: 6, chords: [60, 64, 67], pad: 0.5 },
      { ...base, label: 'verse', bars: 12, kick: true, bass: true, chords: [60, 64, 67], pad: 0.8 },
      { ...base, label: 'chorus', bars: 12, kick: true, snare: true, bass: true, pad: 1, gain: 1.2 },
    ],
  });

  beforeAll(async () => {
    const [p, e] = [demoSong(124), edmSong(128)];
    [pop, edm, sung, waltz] = await Promise.all([
      analyzeAudio(p.samples, p.sr),
      analyzeAudio(e.samples, e.sr),
      analyzeAudio(sungSong.samples, sungSong.sr),
      analyzeAudio(waltzSong.samples, waltzSong.sr),
    ]);
  });

  it('schéma SongAnalysis enrichi : valide strictement les champs de confiance', () => {
    for (const analysis of [pop, edm, sung, waltz]) {
      const parsed = songAnalysisSchema.safeParse(analysis);
      expect(parsed.success).toBe(true);
      expect(analysis.bpmConfidence).toBeGreaterThanOrEqual(0);
      expect(analysis.bpmConfidence).toBeLessThanOrEqual(1);
      expect(analysis.meterConfidence).toBeGreaterThanOrEqual(0);
      expect(analysis.meterConfidence).toBeLessThanOrEqual(1);
    }
  });

  it('confiance de tempo et signature rythmique', () => {
    // Pop à 124 BPM régulier : bpmConfidence élevé
    expect(pop.bpmConfidence).toBeGreaterThan(0.8);
    expect(pop.meter).toBe(4);
    expect(pop.meterConfidence).toBeGreaterThan(0.5);

    // Valse 3/4 détectée
    expect(waltz.meter).toBe(3);
    expect(waltz.meterConfidence).toBeGreaterThan(0.5);
  });

  it('détection vocale corrélée par section', () => {
    // Morceaux instrumentaux : pas de chant
    for (const s of pop.sections) {
      expect(s.hasVocals).toBe(false);
      expect(s.vocalConfidence).toBe(0);
    }
    for (const s of edm.sections) {
      expect(s.hasVocals).toBe(false);
      expect(s.vocalConfidence).toBe(0);
    }

    // Morceau avec chant synthétisé : présent sur les couplets, absent sur l'intro/outro
    const intro = sung.sections[0]!;
    expect(intro.hasVocals).toBe(false);

    const sungSections = sung.sections.filter((s) => s.hasVocals);
    expect(sungSections.length).toBeGreaterThan(0);
    for (const v of sungSections) {
      expect(v.hasVocals).toBe(true);
      expect(v.vocalConfidence).toBeGreaterThan(0.3);
    }
  });

  it('indices de confiance sur les sections et les événements', () => {
    for (const s of pop.sections) {
      expect(s.confidence).toBeGreaterThanOrEqual(0.3);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }

    // Tous les événements ont un indice de confiance
    for (const e of edm.events) {
      expect(e.confidence).toBeDefined();
      expect(e.confidence).toBeGreaterThanOrEqual(0);
      expect(e.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('intégration dans le planificateur : explications enrichies avec chant et certitude', () => {
    const rig = { wash: 4, moving: 4, bars: 2, allowStrobe: true };
    const plan = planLocally(sung, 'concert live', rig);

    const sungVersePlan = plan.sections.find((_, i) => sung.sections[i]?.hasVocals);
    expect(sungVersePlan).toBeDefined();
    expect(sungVersePlan!.why).toContain('chant détecté');
  });
});
