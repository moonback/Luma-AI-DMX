import type { Project } from '../model/schemas';

/** Live AI effects nobody kept, no longer running and referenced by no cue or timeline (mutates `d`). */
export function pruneTransientEffects(d: Project, running: ReadonlySet<string>): number {
  const used = new Set<string>([
    ...d.cueLists.flatMap((l) => l.cues.flatMap((c) => c.effectIds)),
    ...d.timelines.flatMap((t) => t.events.flatMap((ev) => (ev.kind === 'effect' && ev.refId ? [ev.refId] : []))),
  ]);
  const before = d.effects.length;
  d.effects = d.effects.filter((e) => !e.transient || running.has(e.id) || used.has(e.id));
  return before - d.effects.length;
}
