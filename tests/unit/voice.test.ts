import { describe, expect, it } from 'vitest';
import { floatToPcm16Base64, pcm16Base64ToFloat } from '../../src/renderer/voice/pcm';
import { summarize } from '../../src/renderer/voice/tools';
import type { AiProposal } from '../../src/core/ai/actions';

describe('voice PCM', () => {
  it('round-trips samples within 16-bit precision and clamps overshoot', () => {
    const out = pcm16Base64ToFloat(floatToPcm16Base64(new Float32Array([0, 0.5, -0.5, 1.5, -1.5])));
    expect([...out].map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 0.5, -0.5, 1, -1]);
  });

  it('handles chunks larger than the fromCharCode spread limit', () => {
    expect(pcm16Base64ToFloat(floatToPcm16Base64(new Float32Array(100_000).fill(0.25))).length).toBe(100_000);
  });
});

describe('voice proposal summary', () => {
  it('counts only the actions that can be applied', () => {
    const p = {
      understanding: 'Ambiance rouge', notices: ['n'],
      actions: [{ summary: 'Rouge', status: 'ok', messages: [] }, { summary: 'Gobo', status: 'rejected', messages: ['inconnu'] }],
    } as unknown as AiProposal;
    expect(summarize(p)).toMatchObject({ appliable: 1, actions: [{ status: 'ok' }, { status: 'rejected', problems: ['inconnu'] }] });
  });
});
