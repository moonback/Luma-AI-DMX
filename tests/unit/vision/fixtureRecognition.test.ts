import { describe, expect, it } from 'vitest';
import { parseFixtureRecognition, type RecognitionCandidate } from '../../../src/core/ai/fixtureRecognition';

const candidates: RecognitionCandidate[] = [{
  fixtureId: 'fixture-spot-1',
  name: 'Lyre jardin 1',
  manufacturer: 'Robe',
  model: 'Pointe',
  type: 'moving-head-spot',
  universe: 1,
  address: 101,
}];

const observation = {
  imageIndex: 0,
  label: 'Lyre spot',
  observedType: 'moving-head-spot' as const,
  manufacturerGuess: 'Robe',
  modelGuess: 'Pointe',
  mountGuess: 'hanging' as const,
  supportHint: 'Pont avant',
  bbox: { x: 0.2, y: 0.1, width: 0.3, height: 0.4 },
  suggestedFixtureId: 'fixture-spot-1',
  matchConfidence: 0.91,
  evidence: 'Étiquette et forme du corps cohérentes avec le profil.',
};

describe('parseFixtureRecognition', () => {
  it('keeps only allowed patch IDs and normalized image boxes', () => {
    const result = parseFixtureRecognition({ summary: 'Deux appareils visibles.', observations: [observation] }, candidates, 1);
    expect(result.observations[0]).toMatchObject({
      suggestedFixtureId: 'fixture-spot-1',
      matchConfidence: 0.91,
      bbox: { x: 0.2, y: 0.1, width: 0.3, height: 0.4 },
    });
  });

  it('rejects invented fixture IDs and low-confidence matches', () => {
    const invented = { ...observation, suggestedFixtureId: 'not-in-patch', matchConfidence: 0.99 };
    const weak = { ...observation, matchConfidence: 0.4 };
    const result = parseFixtureRecognition({ summary: '', observations: [invented, weak] }, candidates, 1);
    expect(result.observations).toHaveLength(2);
    expect(result.observations.every((item) => item.suggestedFixtureId === null)).toBe(true);
  });

  it('drops invalid image indexes and boxes outside the image', () => {
    const result = parseFixtureRecognition({
      summary: '',
      observations: [
        { ...observation, imageIndex: 2 },
        { ...observation, bbox: { x: 1, y: 1, width: 0.2, height: 0.2 } },
      ],
    }, candidates, 1);
    expect(result.observations).toHaveLength(0);
    expect(result.dropped).toBe(2);
  });

  it('clips partially out-of-frame boxes to normalized bounds', () => {
    const result = parseFixtureRecognition({
      summary: '',
      observations: [{ ...observation, bbox: { x: 0.8, y: 0.7, width: 0.6, height: 0.6 } }],
    }, candidates, 1);
    expect(result.observations[0]!.bbox).toEqual({ x: 0.8, y: 0.7, width: 0.19999999999999996, height: 0.30000000000000004 });
  });
});
