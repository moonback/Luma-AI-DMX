import { describe, expect, it } from 'vitest';
import { percentile, RollingPercentileWindow } from '../../src/core/engine/metrics';

describe('runtime metric percentiles', () => {
  it('returns null for an empty sample window', () => {
    expect(percentile([], 95)).toBeNull();
  });

  it('uses nearest-rank interpolation on sorted values', () => {
    expect(percentile([5, 1, 4, 2, 3], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
  });

  it('clamps percentile input and ignores non-finite samples', () => {
    expect(percentile([1, 2, Number.NaN, 3, Number.POSITIVE_INFINITY], 200)).toBe(3);
    expect(percentile([1, 2, 3], -10)).toBe(1);
    expect(percentile([Number.NaN], 95)).toBeNull();
  });

  it('interpolates between adjacent samples', () => {
    expect(percentile([0, 10], 95)).toBeCloseTo(9.5);
  });
});

describe('rolling percentile window', () => {
  it('keeps only the newest samples and remains bounded', () => {
    const window = new RollingPercentileWindow(3);
    [1, 2, 3, 4].forEach((sample) => window.push(sample));
    expect(window.count).toBe(3);
    expect(window.percentile(50)).toBe(3);
    expect(window.percentile(100)).toBe(4);
  });

  it('ignores non-finite samples and rejects invalid capacities', () => {
    const window = new RollingPercentileWindow(2);
    window.push(Number.NaN);
    window.push(4);
    expect(window.count).toBe(1);
    expect(window.percentile(50)).toBe(4);
    expect(() => new RollingPercentileWindow(0)).toThrow(RangeError);
  });
});
