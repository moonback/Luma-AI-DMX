import type { Fixture, Truss } from '../model/schemas';
import { hangHeight, nearestOnTruss } from './truss';

export interface IntelligentPlacement {
  id: string;
  trussId: string;
  position: { x: number; y: number };
  height: number;
  confidence: number;
  reason: 'support-name' | 'spatial-proximity';
  trussName: string;
}
export interface IntelligentPlacementResult {
  placements: IntelligentPlacement[];
  skipped: { id: string; reason: 'already-linked' | 'floor-or-wall' | 'no-match' | 'ambiguous' }[];
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Suggests fixture-to-truss links conservatively.
 * Explicit support-name evidence wins; otherwise only a unique nearby truss (<= 2 m) is accepted.
 * Existing links and floor/wall fixtures are never changed. This is geometric placement assistance,
 * not a rigging/load calculation or a safety approval.
 */
export function proposeIntelligentPlacements(
  fixtures: readonly Fixture[],
  trusses: readonly Truss[],
  maxDistance = 2,
): IntelligentPlacementResult {
  const placements: IntelligentPlacement[] = [];
  const skipped: IntelligentPlacementResult['skipped'] = [];
  const usable = [...trusses];
  for (const fixture of fixtures) {
    if (fixture.trussId) { skipped.push({ id: fixture.id, reason: 'already-linked' }); continue; }
    const visualMount = fixture.visualRecognition?.mountGuess;
    if (fixture.mount === 'floor' || fixture.mount === 'wall' || visualMount === 'floor' || visualMount === 'wall') {
      skipped.push({ id: fixture.id, reason: 'floor-or-wall' }); continue;
    }
    if (!usable.length) { skipped.push({ id: fixture.id, reason: 'no-match' }); continue; }

    const hint = normalize(fixture.visualRecognition?.supportHint ?? '');
    const named = hint ? usable.filter((truss) => {
      const name = normalize(truss.name);
      return name.length >= 3 && (hint.includes(name) || name.includes(hint));
    }) : [];
    let chosen: Truss | undefined;
    let point: ReturnType<typeof nearestOnTruss> | undefined;
    let confidence = 0.0;
    let reason: IntelligentPlacement['reason'] = 'spatial-proximity';

    if (named.length === 1) {
      chosen = named[0];
      point = nearestOnTruss(chosen, fixture.position.x, fixture.position.y);
      confidence = 0.95;
      reason = 'support-name';
    } else if (named.length > 1) {
      skipped.push({ id: fixture.id, reason: 'ambiguous' }); continue;
    } else {
      const ranked = usable.map((truss) => ({ truss, point: nearestOnTruss(truss, fixture.position.x, fixture.position.y) }))
        .sort((a, b) => a.point.dist - b.point.dist);
      const best = ranked[0]!;
      const second = ranked[1];
      if (best.point.dist > maxDistance) { skipped.push({ id: fixture.id, reason: 'no-match' }); continue; }
      if (second && second.point.dist - best.point.dist < 0.35) { skipped.push({ id: fixture.id, reason: 'ambiguous' }); continue; }
      chosen = best.truss;
      point = best.point;
      confidence = Math.max(0.5, 1 - best.point.dist / maxDistance * 0.5);
    }
    if (!chosen || !point) { skipped.push({ id: fixture.id, reason: 'no-match' }); continue; }
    placements.push({
      id: fixture.id,
      trussId: chosen.id,
      trussName: chosen.name,
      position: { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 },
      height: Math.round(hangHeight(chosen) * 100) / 100,
      confidence,
      reason,
    });
  }
  return { placements, skipped };
}
