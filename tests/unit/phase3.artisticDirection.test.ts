import { describe, it, expect } from 'vitest';
import { planLocally, ARTISTIC_STRATEGIES } from '../../src/core/music/showPlanner';
import { evaluateArtisticQuality } from '../../src/core/music/artisticQuality';
import { compileShow } from '../../src/core/music/songToShow';
import { validateShowIntegrity } from '../../src/core/music/showIntegrity';
import type { SongAnalysis, ShowPlan } from '../../src/core/model/schemas';
import { ProjectIndex } from '../../src/core/engine/resolve';
import { demoProject } from '../helpers';

describe('Phase 3 — Direction artistique professionnelle et variantes thématiques', () => {
  const mockAnalysis: SongAnalysis = {
    version: 1,
    duration: 180,
    bpm: 124,
    tempoStable: true,
    bpmConfidence: 0.95,
    meter: 4,
    meterConfidence: 0.9,
    key: { tonic: 0, mode: 'major', confidence: 0.85 },
    downbeats: [0, 1.935, 3.87, 5.805, 7.74, 9.675, 11.61, 13.545, 15.48, 17.415],
    beats: [0, 0.484, 0.968, 1.452, 1.935, 2.419, 2.903, 3.387],
    sections: [
      { start: 0, end: 30, label: 'intro', cluster: 0, energy: 0.2, brightness: 0.3, density: 0.3, bassShare: 0.2, confidence: 0.9 },
      { start: 30, end: 60, label: 'verse', cluster: 1, energy: 0.4, brightness: 0.5, density: 0.5, bassShare: 0.4, hasVocals: true, vocalConfidence: 0.85, confidence: 0.92 },
      { start: 60, end: 75, label: 'prechorus', cluster: 2, energy: 0.65, brightness: 0.6, density: 0.7, bassShare: 0.5, confidence: 0.88 },
      { start: 75, end: 110, label: 'chorus', cluster: 3, energy: 0.9, brightness: 0.8, density: 0.9, bassShare: 0.7, confidence: 0.95 },
      { start: 110, end: 140, label: 'verse', cluster: 1, energy: 0.45, brightness: 0.5, density: 0.5, bassShare: 0.4, hasVocals: true, vocalConfidence: 0.82, confidence: 0.9 },
      { start: 140, end: 170, label: 'chorus', cluster: 3, energy: 0.95, brightness: 0.85, density: 0.95, bassShare: 0.75, confidence: 0.96 },
      { start: 170, end: 180, label: 'outro', cluster: 0, energy: 0.25, brightness: 0.3, density: 0.4, bassShare: 0.2, confidence: 0.91 },
    ],
    events: [
      { t: 74, duration: 1, kind: 'riser', confidence: 0.8 },
      { t: 75, duration: 0.2, kind: 'impact', confidence: 0.9 },
      { t: 139, duration: 1, kind: 'riser', confidence: 0.85 },
      { t: 140, duration: 0.2, kind: 'impact', confidence: 0.92 },
    ],
    tempoChanges: [],
  };

  const rig = {
    wash: 6,
    moving: 4,
    bars: 2,
    allowStrobe: true,
    groups: [{ id: 'g1', name: 'Face' }, { id: 'g2', name: 'Contre' }],
    markers: [{ id: 'm1', name: 'Chanteur' }],
  };

  it('propose 5 variantes artistiques formelles et distinctes', () => {
    expect(Object.keys(ARTISTIC_STRATEGIES)).toHaveLength(5);
    expect(ARTISTIC_STRATEGIES[0]?.name).toBe('balanced');
    expect(ARTISTIC_STRATEGIES[1]?.name).toBe('cinematic');
    expect(ARTISTIC_STRATEGIES[2]?.name).toBe('rhythmic');
    expect(ARTISTIC_STRATEGIES[3]?.name).toBe('choreographic');
    expect(ARTISTIC_STRATEGIES[4]?.name).toBe('minimalist');
  });

  it('génère des choix stylistiques conformes à chaque stratégie', () => {
    const balanced = planLocally(mockAnalysis, '', rig, 0);
    const cinematic = planLocally(mockAnalysis, '', rig, 1);
    const rhythmic = planLocally(mockAnalysis, '', rig, 2);
    const choreographic = planLocally(mockAnalysis, '', rig, 3);
    const minimalist = planLocally(mockAnalysis, '', rig, 4);

    // 1. Variantes ont des plans valides
    for (const plan of [balanced, cinematic, rhythmic, choreographic, minimalist]) {
      expect(plan.sections).toHaveLength(mockAnalysis.sections.length);
    }

    // 2. Cinématique : favorise mouvements amples/lents ('slow', 'sweep') et gobos
    const cineMovements = cinematic.sections.map((s) => s.movement);
    expect(cineMovements.some((m) => m === 'slow' || m === 'sweep')).toBe(true);
    expect(cinematic.sections.some((s) => s.beam === 'gobo' || s.beam === 'prism')).toBe(true);

    // 3. Rythmique : active systématiquement les accents sur les sections énergiques
    const rhythmAccents = rhythmic.sections.filter((s) => s.energy >= 3).map((s) => s.accents);
    expect(rhythmAccents.every((a) => a === true)).toBe(true);

    // 4. Chorégraphique : priorise les figures géométriques de lyres (fan, figure8, circle, ballyhoo)
    const choreoMovements = choreographic.sections.map((s) => s.movement);
    expect(choreoMovements.some((m) => ['fan', 'figure8', 'circle', 'ballyhoo'].includes(m))).toBe(true);

    // 5. Minimaliste : restreint les mouvements (none / pan / slow) et privilégie les wash
    const minMovements = minimalist.sections.map((s) => s.movement);
    expect(minMovements.every((m) => ['none', 'slow', 'pan'].includes(m))).toBe(true);
    // Les effets restent légers (pulse ou dimmerWave ou none)
    const minEffects = minimalist.sections.map((s) => s.effect);
    expect(minEffects.every((e) => ['none', 'pulse', 'dimmerWave'].includes(e))).toBe(true);
  });

  it('évalue la qualité artistique avec des scores explicites (audit qualité Phase 3)', () => {
    const plan = planLocally(mockAnalysis, '', rig, 0);
    const report = evaluateArtisticQuality(plan, mockAnalysis);

    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.metrics.contrast).toBeGreaterThanOrEqual(0);
    expect(report.metrics.variety).toBeGreaterThanOrEqual(0);
    expect(report.metrics.narrative).toBeGreaterThanOrEqual(0);
    expect(report.metrics.vocalClarity).toBeGreaterThanOrEqual(0);

    // Avec un morceau ayant intro calme (1) et refrains dynamiques (4-5), le contraste est élevé
    expect(report.metrics.contrast).toBeGreaterThan(60);
    expect(report.notices.length).toBeGreaterThan(0);
  });

  it('détecte la monotonie et le manque de contraste dynamique', () => {
    // Show monotone : même effet sur toutes les sections, énergie constante
    const monotonousPlan: ShowPlan = {
      intent: 'test',
      provider: 'local',
      model: null,
      variant: 0,
      summary: 'Test monotone',
      sections: mockAnalysis.sections.map((_, i) => ({
        index: i,
        energy: 3,
        palette: ['#FF0000', '#0000FF'],
        layers: { wash: true, moving: false, bars: false },
        movement: 'none' as const,
        beam: 'open' as const,
        extras: [],
        locked: false,
        why: 'test',
        note: '',
        tempoMul: 1,
        effect: 'strobe' as const,
        effectBeats: 4,
        accents: false,
        blind: false,
        groups: [],
        focus: null,
      })),
    };

    const report = evaluateArtisticQuality(monotonousPlan, mockAnalysis);
    expect(report.metrics.contrast).toBeLessThanOrEqual(50);
    expect(report.notices.some((n) => n.includes('Manque de contraste dynamique'))).toBe(true);
    expect(report.notices.some((n) => n.includes('consécutives'))).toBe(true);
  });

  it('valide l’intégrité et la qualité sur un show complet compilé', () => {
    const index = new ProjectIndex(demoProject());
    const plan = planLocally(mockAnalysis, '', rig, 1); // Variante cinématographique
    const compiled = compileShow(index, 'Test Track', mockAnalysis, plan);

    // Contrôle d'intégrité technique
    const integrity = validateShowIntegrity(compiled, mockAnalysis);
    expect(integrity.valid).toBe(true);
    expect(integrity.errors).toHaveLength(0);

    // Contrôle qualité artistique
    const quality = evaluateArtisticQuality(plan, mockAnalysis);
    expect(quality.score).toBeGreaterThanOrEqual(70);
  });
});
