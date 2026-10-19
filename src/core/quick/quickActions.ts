import { z } from 'zod';
import { hexColorSchema, idSchema, nameSchema } from '../model/schemas';

export const MAX_QUICK_ACTIONS = 200;

/** `category` is a free label; actions without one are grouped together. Array order is the display order. */
const base = { id: idSchema, name: nameSchema, category: z.string().trim().min(1).max(40).optional() };
/** One-click action of the Quick Actions page; effects, scenes, palettes and cue lists are referenced by id. */
export const quickActionSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('color'), color: hexColorSchema }),
  z.object({ ...base, kind: z.literal('effect'), ref: idSchema }),
  z.object({ ...base, kind: z.literal('scene'), ref: idSchema }),
  z.object({ ...base, kind: z.literal('palette'), ref: idSchema }),
  /** `index` omitted = GO (next cue); set = jump to that cue. */
  z.object({ ...base, kind: z.literal('cue'), ref: idSchema, index: z.number().int().min(0).optional() }),
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
