import { autoGainStep, TARGET_RMS, type AutoGainState } from '../../src/core/audio/autoGain';
import { applyAudioPreset } from '../../src/core/audio/presets';
import { moveRadius } from '../../src/core/audio/reactive';
import { audioReactionsSchema, DEFAULT_AUDIO_REACTIONS } from '../../src/core/model/schemas';

function settle(inputRms: number, from: AutoGainState = { gain: 1, peak: 0 }, frames = 600): AutoGainState {
  let s = from;
  for (let i = 0; i < frames; i++) s = autoGainStep(s, inputRms);
  return s;
}

describe('gain automatique', () => {
  it('amène une entrée faible et une entrée forte au même niveau', () => {
    expect(0.01 * settle(0.01).gain).toBeCloseTo(TARGET_RMS, 2);
    expect(0.3 * settle(0.3).gain).toBeCloseTo(TARGET_RMS, 2);
  });

  it('n’amplifie pas le silence', () => {
    const loud = settle(0.3);
    expect(settle(0, loud, 3000).gain).toBeCloseTo(loud.gain, 5);
  });

  it('reste borné', () => {
    expect(settle(0.0025).gain).toBeLessThanOrEqual(20);
    expect(settle(5).gain).toBeGreaterThanOrEqual(0.25);
  });
});

describe('préréglages audio', () => {
  const base = { ...DEFAULT_AUDIO_REACTIONS, dropGo: { enabled: true, cueListId: 'cl1', minConfidence: 0.9, kinds: ['drop' as const] } };

  it('active les réactions du préréglage sur les groupes donnés et garde les GO de cues', () => {
    const r = applyAudioPreset(base, 'club', ['g1', 'g2']);
    expect(audioReactionsSchema.safeParse(r).success).toBe(true);
    expect(r.beatFlash.enabled && r.followers.intensityFromBass.enabled && r.bpmFollow.enabled).toBe(true);
    expect(r.beatFlash.targets.groupIds).toEqual(['g1', 'g2']);
    expect(r.dropGo).toEqual(base.dropGo);
    expect(r.energyToColor.lowColor).toBe(base.energyToColor.lowColor);
  });

  it('« off » coupe toutes les réactions continues', () => {
    const r = applyAudioPreset(applyAudioPreset(base, 'club', ['g1']), 'off', ['g1']);
    expect([r.bpmFollow, r.beatFlash, r.levelToIntensity, r.energyToColor, ...Object.values(r.followers)].some((x) => x.enabled)).toBe(false);
    expect(r.dropGo.enabled).toBe(true);
  });
});

describe('mouvement des lyres sur la musique', () => {
  it('donne un cercle bien visible sur une musique à 120 BPM (≈ 2 attaques/s)', () => {
    expect(moveRadius(0.5, 0.4, 0.25)).toBeGreaterThan(0.15);
  });
  it('s’arrête dans le silence et reste dans la plage', () => {
    expect(moveRadius(0.5, 0, 0.5)).toBe(0);
    expect(moveRadius(1, 1, 1)).toBeLessThanOrEqual(0.5);
  });
});
