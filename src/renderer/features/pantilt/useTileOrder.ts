import { useState } from 'react';

const KEY = 'luma.pantilt.order';

function load(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Ordre d'affichage des tuiles choisi par l'utilisateur, gardé dans ce navigateur (pas dans le projet :
 * le patch et l'ordre d'éventail restent inchangés). Les machines absentes de l'ordre gardé suivent, dans l'ordre du patch.
 */
export function useTileOrder<T extends { fixture: { id: string } }>(fixtures: T[]) {
  const [saved, setSaved] = useState<string[]>(load);
  const rank = new Map(saved.map((id, i) => [id, i]));
  const ordered = [...fixtures].sort((a, b) => (rank.get(a.fixture.id) ?? Infinity) - (rank.get(b.fixture.id) ?? Infinity));

  /** `id` prend la place de `targetId` ; les machines entre les deux se décalent d'un cran. */
  const move = (id: string, targetId: string) => {
    const ids = ordered.map((f) => f.fixture.id);
    const to = ids.indexOf(targetId);
    if (id === targetId || to < 0 || !ids.includes(id)) return;
    ids.splice(ids.indexOf(id), 1);
    ids.splice(to, 0, id);
    setSaved(ids);
    try {
      localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      // stockage indisponible : l'ordre vaut pour cette session seulement
    }
  };
  return { ordered, move };
}
