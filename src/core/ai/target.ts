import { findModule } from '../fixtures/modules';
import type { ResolvedFixture } from '../fixtures/profiles';
import type { ProjectIndex } from '../engine/resolve';
import type { AiTarget } from './actions';
import { normalize } from './local/interpreter';

/** Fixture ids an AI target designates in the project, with the names it could not resolve. */
export function resolveAiTarget(index: ProjectIndex, t: AiTarget): { ids: string[]; problems: string[] } {
  const problems: string[] = [];
  const all = [...index.fixtures.values()];
  const explicit = new Set<string>();
  for (const gname of t.groupNames ?? []) {
    const g = [...index.groups.values()].find((x) => normalize(x.name) === normalize(gname));
    if (!g) problems.push(`Groupe inconnu « ${gname} »`);
    else g.fixtureIds.forEach((id) => explicit.add(id));
  }
  for (const fname of t.fixtureNames ?? []) {
    const f = all.find((x) => normalize(x.fixture.name) === normalize(fname));
    if (!f) problems.push(`Projecteur inconnu « ${fname} »`);
    else explicit.add(f.fixture.id);
  }
  let pool: ResolvedFixture[] = explicit.size ? all.filter((r) => explicit.has(r.fixture.id)) : all;
  const hasSelector = explicit.size > 0 || t.all === true;
  if (t.fixtureTypes?.length) pool = pool.filter((r) => t.fixtureTypes!.includes(r.profile.type));
  if (t.tags?.length) pool = pool.filter((r) => r.fixture.tags.some((tag) => t.tags!.map(normalize).includes(normalize(tag))));
  if (t.module) {
    const before = pool.length;
    pool = pool.filter((r) => findModule(r.profile, t.module!));
    if (before && !pool.length) problems.push(`Aucun projecteur ciblé n’a de module « ${t.module} »`);
  }
  // Unresolved names never widen to the whole rig or to a whole fixture type.
  if (!hasSelector && ((t.groupNames?.length ?? 0) + (t.fixtureNames?.length ?? 0) > 0 || (!t.fixtureTypes?.length && !t.tags?.length && problems.length))) pool = [];
  const exclude = [...(t.exclude?.groupNames ?? []), ...(t.exclude?.fixtureNames ?? [])];
  if (exclude.length) {
    // An exclusion that resolves nothing is reported: the operator meant to protect something.
    const ex = resolveAiTarget(index, { groupNames: t.exclude!.groupNames, fixtureNames: t.exclude!.fixtureNames });
    problems.push(...ex.problems.map((p) => `Exclusion : ${p}`));
    const out = new Set(ex.ids);
    pool = pool.filter((r) => !out.has(r.fixture.id));
  }
  let ids = pool.map((r) => r.fixture.id);
  if (t.limit) ids = ids.slice(0, t.limit);
  return { ids, problems };
}
