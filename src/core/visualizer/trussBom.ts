import type { Truss } from '../model/schemas';

export interface BomLine { length: number; count: number }

/** Pieces counted by length (m), longest first: the cutting list of the riggers. A totem counts by its height. */
export function trussBom(trusses: readonly Truss[]): BomLine[] {
  const counts = new Map<number, number>();
  for (const t of trusses) {
    const length = Math.round((t.shape === 'totem' ? t.height : t.length) * 100) / 100;
    counts.set(length, (counts.get(length) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[0] - a[0]).map(([length, count]) => ({ length, count }));
}
