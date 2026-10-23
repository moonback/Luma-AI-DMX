import { useSyncExternalStore } from 'react';

/** Favourite and recently used library items of this workstation (a per-user convenience, not project data). */
interface LibraryPrefs { fav: string[]; recent: string[] }

const KEY = 'luma.library';
const MAX_RECENT = 8;
const listeners = new Set<() => void>();

function load(): LibraryPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<LibraryPrefs>;
    const ids = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string').slice(0, 64) : []);
    return { fav: ids(raw.fav), recent: ids(raw.recent).slice(0, MAX_RECENT) };
  } catch {
    return { fav: [], recent: [] };
  }
}
let state = load();

function save(next: LibraryPrefs): void {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* kept for this session only */ }
  for (const fn of listeners) fn();
}

export const useLibraryPrefs = (): LibraryPrefs => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => state);
export const toggleFavorite = (id: string) => save({ ...state, fav: state.fav.includes(id) ? state.fav.filter((x) => x !== id) : [...state.fav, id] });
/** Most recent first, without duplicates. */
export const markRecent = (id: string) => { if (state.recent[0] !== id) save({ ...state, recent: [id, ...state.recent.filter((x) => x !== id)].slice(0, MAX_RECENT) }); };
