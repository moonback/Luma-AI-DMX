import { describe, expect, it } from 'vitest';
import { moveQuickAction, parseQuickActions, type QuickAction } from '../../src/core/quick/quickActions';

const red: QuickAction = { id: 'a1', name: 'Rouge', kind: 'color', color: '#FF0000' };

describe('moveQuickAction', () => {
  const mk = (id: string, category?: string): QuickAction => ({ id, name: id, kind: 'color', color: '#00FF00', ...(category ? { category } : {}) });
  const list = [mk('a', 'X'), mk('b', 'Y'), mk('c', 'X'), mk('d')];
  const ids = (l: QuickAction[]) => l.map((a) => `${a.id}:${a.category ?? ''}`);

  it('inserts before a target and takes its category', () => {
    expect(ids(moveQuickAction(list, 'd', 'X', 'c'))).toEqual(['a:X', 'b:Y', 'd:X', 'c:X']);
  });

  it('appends at the end of a category, or of the list for a new one / none', () => {
    expect(ids(moveQuickAction(list, 'a', 'X'))).toEqual(['b:Y', 'c:X', 'a:X', 'd:']);
    expect(ids(moveQuickAction(list, 'a', 'Z'))).toEqual(['b:Y', 'c:X', 'd:', 'a:Z']);
    expect(ids(moveQuickAction(list, 'b', undefined))).toEqual(['a:X', 'c:X', 'd:', 'b:']);
  });
});

describe('parseQuickActions', () => {
  it('accepts an array or { actions }, drops invalid items and re-ids duplicates', () => {
    const file = JSON.stringify({ actions: [red, { id: 'a2', name: 'Cue', kind: 'cue', ref: 'l1', index: 2 }, { id: 'a3', name: 'Mauvais', kind: 'color', color: 'rouge' }] });
    const r = parseQuickActions(file, [red], () => 'fresh');
    expect(r.actions.map((a) => a.id)).toEqual(['fresh', 'a2']);
    expect(r.skipped).toBe(1);
    expect(parseQuickActions(JSON.stringify([red]), [], () => 'x').actions).toEqual([red]);
  });

  it('returns nothing for unparsable text', () => {
    expect(parseQuickActions('pas du json', [], () => 'x')).toEqual({ actions: [], skipped: 0 });
  });
});
