import type { Truss } from '../model/schemas';
import { END_SNAP, trussEnds, type P2 } from './truss';

/** A drawn segment longer than this is cut into straight pieces of about this length (m). */
export const PIECE_LENGTH = 2;
/** Shorter segments are dropped: the schema refuses pieces under 0.5 m. */
const MIN_SEGMENT = 0.5;

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Groups pieces by `groupId`; pieces without a group are left out. */
export function groupTrusses(trusses: readonly Truss[]): Map<string, Truss[]> {
  const groups = new Map<string, Truss[]>();
  for (const t of trusses) {
    if (!t.groupId) continue;
    groups.set(t.groupId, [...(groups.get(t.groupId) ?? []), t]);
  }
  return groups;
}

/** The point itself, or the closest end of an existing truss within `END_SNAP`. */
export function snapPoint(p: P2, trusses: readonly Truss[]): P2 {
  let best = p, bestDist = END_SNAP;
  for (const t of trusses) {
    for (const e of trussEnds(t)) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d <= bestDist) { bestDist = d; best = e; }
    }
  }
  return best;
}

/**
 * Straight pieces along a drawn polyline: each segment is cut into pieces of about PIECE_LENGTH, centred on their
 * span, all with the same height and `groupId`. Segments shorter than 0.5 m are skipped.
 */
export function chainFromPoints(points: readonly P2[], height: number, id: () => string, groupId: string, name: string): Truss[] {
  const out: Truss[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d < MIN_SEGMENT) continue;
    const n = Math.max(1, Math.round(d / PIECE_LENGTH));
    const rotation = round3((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      out.push({
        id: id(), name, shape: 'line', x: round3(a.x + (b.x - a.x) * u), y: round3(a.y + (b.y - a.y) * u),
        height, length: round3(d / n), rotation, support: 'towers', groupId,
      });
    }
  }
  return out;
}
