import { z } from 'zod';
import { hexColorSchema, idSchema, nameSchema } from '../model/schemas';

export const MAX_QUICK_ACTIONS = 200;

/** `category` is a free label; actions without one are grouped together. Array order is the display order. */
const base = { id: idSchema, name: nameSchema, category: z.string().trim().min(1).max(40).optional() };
/**
 * Per-action machine targeting (overrides the global selection when set).
 * - `groupIds`: resolved to fixture IDs at trigger time via the project's groups.
 * - `fixtureIds`: explicit fixture IDs.
 * Both are optional; when absent the action falls back to the global selection.
 * Only meaningful for color/palette actions (effects, cues and scenes carry their own targeting).
 */
const targeting = {
  groupIds: z.array(idSchema).max(64).optional(),
  fixtureIds: z.array(idSchema).max(1024).optional(),
};

/** One-click action of the Quick Actions page; effects, scenes, palettes and cue lists are referenced by id. */
export const quickActionSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, ...targeting, kind: z.literal('color'), color: hexColorSchema }),
  z.object({ ...base, ...targeting, kind: z.literal('effect'), ref: idSchema }),
  z.object({ ...base, ...targeting, kind: z.literal('scene'), ref: idSchema }),
  z.object({ ...base, ...targeting, kind: z.literal('palette'), ref: idSchema }),
  /** `index` omitted = GO (next cue); set = jump to that cue. */
  z.object({ ...base, ...targeting, kind: z.literal('cue'), ref: idSchema, index: z.number().int().min(0).optional() }),
]);
export type QuickAction = z.infer<typeof quickActionSchema>;

/** Moves an action into `category`, before `beforeId` or else at the end of that category. */
export function moveQuickAction(actions: readonly QuickAction[], id: string, category: string | undefined, beforeId?: string): QuickAction[] {
  const a = actions.find((x) => x.id === id);
  if (!a || id === beforeId) return [...actions];
  const { category: _old, ...rest } = a;
  const moved = (category ? { ...rest, category } : rest) as QuickAction;
  const others = actions.filter((x) => x.id !== id);
  let i = beforeId ? others.findIndex((x) => x.id === beforeId) : -1;
  if (i < 0) i = others.map((x) => x.category).lastIndexOf(category) + 1 || others.length;
  return [...others.slice(0, i), moved, ...others.slice(i)];
}

/**
 * Moves all actions of `category` before all actions of `beforeCategory`.
 * If `beforeCategory` is undefined, appends the category at the end.
 */
export function moveCategoryBefore(actions: readonly QuickAction[], category: string, beforeCategory: string | undefined): QuickAction[] {
  const catKey = (a: QuickAction) => a.category ?? '';
  const categories = [...new Set(actions.map(catKey))];
  if (category === (beforeCategory ?? '') || !categories.includes(category)) return [...actions];
  // Build ordered list of categories
  const others = categories.filter((c) => c !== category);
  let insertIdx = beforeCategory !== undefined ? others.indexOf(beforeCategory) : others.length;
  if (insertIdx < 0) insertIdx = others.length;
  const orderedCats = [...others.slice(0, insertIdx), category, ...others.slice(insertIdx)];
  // Re-emit actions in that category order
  return orderedCats.flatMap((c) => actions.filter((a) => catKey(a) === c));
}

/** Renames every action of `oldCategory` to `newCategory` (trim; empty → undefined = uncategorized). */
export function renameCategory(actions: readonly QuickAction[], oldCategory: string, newCategory: string): QuickAction[] {
  const trimmed = newCategory.trim().slice(0, 40);
  return actions.map((a) => {
    if ((a.category ?? '') !== oldCategory) return a;
    if (!trimmed) { const { category: _c, ...rest } = a; return rest as QuickAction; }
    return { ...a, category: trimmed };
  });
}

/** Parses an import file (an array, or `{ actions: [...] }`): keeps valid actions, gives fresh ids to duplicates. */
export function parseQuickActions(text: string, existing: readonly QuickAction[], newId: () => string): { actions: QuickAction[]; skipped: number } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { actions: [], skipped: 0 }; }
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { actions?: unknown })?.actions) ? (raw as { actions: unknown[] }).actions : [];
  const seen = new Set(existing.map((a) => a.id));
  const actions: QuickAction[] = [];
  for (const item of list.slice(0, MAX_QUICK_ACTIONS)) {
    const r = quickActionSchema.safeParse(item);
    if (!r.success || existing.length + actions.length >= MAX_QUICK_ACTIONS) continue;
    const a = seen.has(r.data.id) ? { ...r.data, id: newId() } : r.data;
    seen.add(a.id);
    actions.push(a);
  }
  return { actions, skipped: list.length - actions.length };
}
