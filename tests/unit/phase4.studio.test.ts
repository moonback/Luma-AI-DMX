import { describe, it, expect, vi } from 'vitest';
import { musicPlayer } from '../../src/renderer/musicPlayer';
import { evaluateArtisticQuality } from '../../src/core/music/artisticQuality';
import { planLocally, ARTISTIC_STRATEGIES } from '../../src/core/music/showPlanner';
import type { SongAnalysis, ShowPlan } from '../../src/core/model/schemas';

describe('Phase 4 — Studio Song-to-Show & Forme d’onde', () => {
  const mockAnalysis: SongAnalysis = {
    version: 1,
    duration: 120,
    bpm: 128,
    tempoStable: true,
    bpmConfidence: 0.94,
    meter: 4,
    meterConfidence: 0.92,
    key: { tonic: 0, mode: 'major', confidence: 0.88 },
    downbeats: [0, 1.875, 3.75, 5.625, 7.5],
    beats: [0, 0.468, 0.937, 1.406, 1.875],
    sections: [
      { start: 0, end: 30, label: 'intro', cluster: 0, energy: 0.2, brightness: 0.3, density: 0.3, bassShare: 0.2 },
      { start: 30, end: 60, label: 'verse', cluster: 1, energy: 0.4, brightness: 0.5, density: 0.5, bassShare: 0.4, hasVocals: true, vocalConfidence: 0.8 },
      { start: 60, end: 90, label: 'chorus', cluster: 2, energy: 0.9, brightness: 0.8, density: 0.85, bassShare: 0.7 },
      { start: 90, end: 120, label: 'outro', cluster: 0, energy: 0.3, brightness: 0.3, density: 0.4, bassShare: 0.2 },
    ],
    events: [
      { t: 59, duration: 1, kind: 'riser', confidence: 0.8 },
      { t: 60, duration: 0.2, kind: 'impact', confidence: 0.9 },
    ],
    tempoChanges: [],
  };

  const rig = {
    wash: 4,
    moving: 4,
    bars: 2,
    allowStrobe: true,
  };

  it('génère la forme d’onde audio normalisée via musicPlayer', () => {
    // 1. Sans buffer chargé, getWaveform retourne null proprement
    expect(musicPlayer.getWaveform('unknown-hash')).toBeNull();

    // 2. Mock d'un AudioBuffer simulé
    const mockChannelData = new Float32Array(44100 * 2); // 2 secondes
    for (let i = 0; i < mockChannelData.length; i++) {
      mockChannelData[i] = Math.sin((i / 44100) * 440 * 2 * Math.PI) * 0.8;
    }

    const mockBuffer = {
      duration: 2,
      length: mockChannelData.length,
      sampleRate: 44100,
      numberOfChannels: 1,
      getChannelData: vi.fn(() => mockChannelData),
    } as unknown as AudioBuffer;

    // Injecter dans les buffers privés via (musicPlayer as any)
    (musicPlayer as unknown as { buffers: Map<string, AudioBuffer> }).buffers.set('test-hash', mockBuffer);

    const waveform = musicPlayer.getWaveform('test-hash', 50);
    expect(waveform).not.toBeNull();
    expect(waveform).toHaveLength(50);
    for (const amp of waveform!) {
      expect(amp).toBeGreaterThanOrEqual(0);
      expect(amp).toBeLessThanOrEqual(1);
    }
  });

  it('fournit des données de comparaison de variantes A/B avec détection des différences', () => {
    const planA: ShowPlan = planLocally(mockAnalysis, 'ambiance équilibrée', rig, 0); // Variante Balanced
    const planB: ShowPlan = planLocally(mockAnalysis, 'ambiance cinématographique', rig, 1); // Variante Cinematic

    expect(planA.variant).toBe(0);
    expect(planB.variant).toBe(1);
    expect(ARTISTIC_STRATEGIES[planA.variant % 5]?.name).toBe('balanced');
    expect(ARTISTIC_STRATEGIES[planB.variant % 5]?.name).toBe('cinematic');

    // Détection des différences par section
    const diffIndices = planA.sections.map((secA, i) => {
      const secB = planB.sections[i];
      if (!secB) return i;
      const isDiff =
        secA.energy !== secB.energy ||
        secA.movement !== secB.movement ||
        secA.effect !== secB.effect ||
        secA.palette.join(',') !== secB.palette.join(',');
      return isDiff ? i : -1;
    }).filter((i) => i >= 0);

    expect(diffIndices.length).toBeGreaterThan(0);
  });

  it('calcule le badge de qualité artistique et son audit pour le studio', () => {
    const plan = planLocally(mockAnalysis, 'concert pop dynamique', rig, 0);
    const report = evaluateArtisticQuality(plan, mockAnalysis);

    expect(report.score).toBeGreaterThan(60);
    expect(report.metrics.contrast).toBeGreaterThan(50);
    expect(report.metrics.variety).toBeGreaterThanOrEqual(0);
    expect(report.metrics.narrative).toBeGreaterThan(50);
    expect(report.metrics.vocalClarity).toBeGreaterThan(50);
  });
});
