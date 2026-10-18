import type { FixtureProfile, Performer, StageMarker, StageProp, StageScreen, Truss } from '../model/schemas';
import type { SceneLayout } from './templates';

/**
 * Written description → complete stage, offline and deterministic: "une grille de 10 m sur 4 à 3 m, 2 totems de 2 m
 * avec une lyre dessus, 5 ignite300 et 4 mhl1942, un pupitre et 2 pieds de micro sur 5 m² de praticable".
 * Fixture models are looked up by name in the profile library; unknown models fall back to a demo profile.
 */

/** Ready-made descriptions offered on the home page (each one is fully understood, see the unit test). */
export const TEXT_SCENE_EXAMPLES: { label: string; text: string }[] = [
  {
    label: 'Concert',
    text: 'Créer une scène de concert avec un plateau de 12 m de largeur sur 8 m de profondeur. Installer grille de 10 x 6 m à environ 4 m de hauteur. Ajouter 2 totems de 2,5 m, chacun surmonté d’une lyre, un praticable de 3 x 2 m, 2 enceintes de façade, 3 retours de scène et un écran LED de 6 x 3,5 m en fond de scène.',
  },
  {
    label: 'Conférence',
    text: 'Créer une scène de conférence avec un plateau de 8 x 5 m et un pont lumière de 8 m de largeur suspendu à 5 m de hauteur. Installer 6 projecteurs PAR pour éclairer la scène, un pupitre côté jardin, une table pour les intervenants, 2 micros et un écran de projection de 4 x 2,25 m en fond de scène. Prévoir 2 enceintes de diffusion de part et d’autre du plateau.',
  },
  {
    label: 'Club / DJ',
    text: 'Créer une scène DJ avec un plateau de 6 x 4 m et une grille technique de 6 x 4 m suspendue à 4 m de hauteur. Équiper la structure de 4 lyres asservies, 4 strobes et 2 barres LED. Installer un praticable de 2 x 1 m pour surélever la table DJ, ainsi qu’un écran LED de 5 x 3 m en arrière-plan. Prévoir une disposition symétrique des équipements autour du DJ.',
  },
  {
    label: 'Gala / mariage',
    text: 'Créer une scène élégante pour un gala ou un mariage, avec un pont lumière de 8 m de largeur à 4 m de hauteur et 8 projecteurs PAR. Installer 4 totems de 2,5 m répartis de manière symétrique, chacun équipé d’une lyre asservie. Ajouter un pupitre, un micro, un rideau de fond de scène et 2 colonnes décoratives de chaque côté du plateau.',
  },
  {
    label: 'Théâtre',
    text: 'Créer une scène de théâtre avec un plateau de 10 x 8 m et 3 ponts techniques de 10 m de largeur, positionnés à 7 m de hauteur et répartis au-dessus du plateau. Installer 12 projecteurs PAR et 4 lyres asservies pour l’éclairage scénique. Ajouter un rideau de fond de scène, des marches d’accès et 2 emplacements pour les comédiens. Conserver un espace central dégagé pour le jeu et prévoir une implantation adaptée aux changements de décor.',
  },
];

/** Fixtures to patch, hung on the totems or on the other structures. */
export interface TextRig { profileId: string; mode: string; count: number; prefix: string; movable: boolean; target: 'totem' | 'truss' }
export interface TextScene {
  layout: Omit<SceneLayout, 'cyclo' | 'thrust' | 'shape'>;
  rigs: TextRig[];
  /** What was understood, one line per element (shown before applying). */
  lines: string[];
  /** Substitutions and parts that were not understood. */
  notices: string[];
}

const NUMBER_WORDS: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12, quinze: 15, vingt: 20 };
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const alnum = (s: string) => fold(s).replace(/[^a-z0-9]/g, '');
const r2 = (n: number) => Math.round(n * 100) / 100;
const clampN = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** Numbers of a clause, in order ("10m sur 4 sur 3m" → 10, 4, 3). */
const nums = (s: string) => [...s.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
/** Lengths in meters ("3m", "3 m", "3 metres"; not "5 m2"). */
const meters = (s: string) => [...s.matchAll(/(\d+(?:\.\d+)?)\s*(?:m|metres?)\b(?!2)/g)].map((m) => Number(m[1]));
/** Height given as "à 3 m", "hauteur 3 m", "3 m de haut". */
const heightOf = (s: string) => {
  const m = /(?:\ba|hauteur(?:\s*de)?)\s*(\d+(?:\.\d+)?)\s*m\b|(\d+(?:\.\d+)?)\s*m\s*de\s*haut/.exec(s);
  return m ? Number(m[1] ?? m[2]) : undefined;
};

type PropKind = StageProp['kind'];
const PROPS: [RegExp, PropKind, string][] = [
  [/\bpieds?\s*(?:de\s*)?micros?\b|\bmicros?\b/, 'mic', 'Pied de micro'],
  [/\benceintes?\b|\bline\s*arrays?\b|\bsono\b/, 'speaker', 'Enceinte'],
  [/\bretours?\b/, 'monitor', 'Retour'],
  [/\bmarches?\b|\bescaliers?\b/, 'stairs', 'Marches'],
  [/\btables?\b/, 'table', 'Table'],
  [/\brideaux?\b|\bpendrillons?\b|\bfrises?\b/, 'drape', 'Rideau'],
  [/\bcubes?\b|\bcaisses?\b|\bflight/, 'box', 'Cube'],
  [/\bcolonnes?\b/, 'column', 'Colonne'],
];
const PEOPLE: [RegExp, Performer['kind'], string][] = [
  [/\bpupitres?\b|\bpuprites?\b|\blutrins?\b/, 'lectern', 'Pupitre'],
  [/\bbatt(?:erie|eur)s?\b/, 'drums', 'Batterie'],
  [/\bclaviers?\b|\bpianos?\b/, 'keys', 'Claviers'],
  [/\bchanteu(?:r|se)s?\b|\bmusicien(?:ne)?s?\b|\bartistes?\b|\bcomedien(?:ne)?s?\b|\bdanseu(?:r|se)s?\b|\bpersonnes?\b|\binterpretes?\b|\borateurs?\b/, 'standing', 'Artiste'],
];
/** Generic fixture words → built-in demo profiles. */
const GENERIC: [RegExp, string, string][] = [
  [/\bwash/, 'demo-wash', 'Wash'],
  [/\blyres?\b|\bspots?\b|\bbeams?\b|\btetes? mobiles?\b/, 'demo-spot', 'Lyre'],
  [/\bpars?\b/, 'demo-par-rgbw', 'PAR'],
  [/\bstrob/, 'demo-strobe', 'Strobe'],
  [/\bbarres?\b/, 'demo-led-bar-4', 'Barre LED'],
];
const STOP = new Set(['de', 'des', 'du', 'la', 'le', 'les', 'sur', 'au', 'aux', 'en', 'avec', 'dessus', 'dessu', 'pose', 'posee', 'posees', 'poses', 'poser', 'projecteurs', 'projecteur', 'modeles', 'modele']);

/** Best library profile for a model name ("ignite300" → "Ignite300LED"): real profiles before demo ones, shortest name first. */
export function matchProfile(query: string, profiles: readonly FixtureProfile[]): FixtureProfile | undefined {
  const q = alnum(query);
  if (q.length < 3) return undefined;
  const best = (hits: FixtureProfile[]) => hits.sort((a, b) => Number(a.fictional) - Number(b.fictional) || a.name.length - b.name.length)[0];
  const exact = best(profiles.filter((p) => {
    const n = alnum(p.name);
    return n.includes(q) || alnum(`${p.manufacturer}${p.name}`).includes(q) || (n.length >= 4 && q.includes(n));
  }));
  // Typos ("ingite300"): the start of the name within 1 edit (2 from 6 characters), digits must match exactly.
  return exact ?? (q.length >= 4 ? best(profiles.filter((p) => {
    const n = alnum(p.name).slice(0, q.length);
    return n.replace(/\D/g, '') === q.replace(/\D/g, '') && editDistance(n, q) <= (q.length >= 6 ? 2 : 1);
  })) : undefined);
}

/** Levenshtein distance (short strings only). */
export function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length]!;
}

/** Parses the description; ids come from `id` so the function stays pure and testable. */
export function sceneFromText(text: string, profiles: readonly FixtureProfile[], id: () => string): TextScene {
  const lines: string[] = [], notices: string[] = [];
  const src = fold(text).replace(/m²/g, 'm2').replace(/(\d),(\d)/g, '$1.$2').replace(/(\d)\s*x\s*(\d)/g, '$1 sur $2')
    .replace(/\b(?:environ|approximativement)\s+/g, '').replace(/\bde part et d['’]\s*autre\b/g, 'de chaque cote')
    // "chacun surmonté d'une lyre": the fixture goes on every totem.
    .replace(/\bchacune?s?\s+(?:surmonte|equipe|muni|dote|coiffe)e?s?\s+d(?:e\s+|['’]\s*)/g, ' chacun@ ')
    // "équiper la structure de 4 lyres" = 4 lyres on the structures; "un praticable pour surélever la table" = also a table.
    .replace(/\bequipe[rz]\s+(?:la|le|les)\s+\w+\s+(?:de|d['’])\s*/g, ', ').replace(/\bpour surelever\b/g, ',')
    // A participle continues the clause it qualifies ("3 ponts de 10 m, positionnés à 7 m et répartis …").
    .replace(/(?:,|\bet\b)\s*(?=(?:positionne|suspendu|accroche|situe|reparti)e?s?\b)/g, ' ')
    .replace(/\b(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|douze|quinze|vingt)\b/g, (w) => String(NUMBER_WORDS[w]))
    // A model name ends its clause ("4 mhl1942 pupitre" = 4 mhl1942, pupitre), unless a preposition follows.
    .replace(/\b([a-z]+\d+[a-z0-9]*)\s+(?!(?:sur|de|du|des|en|au|aux|a|avec|dessus?|pose\w*|m|m2|cm)\b)(?=[a-z]{3,})/g, '$1, ');
  // Clauses; "avec …" and "… dessus" refer to the previous structure.
  const parts = src.split(/(\bavec\b|\bchacun@)|[,;\n]|\.(?!\d)|\bet\b|\bpuis\b|\bplus\b|\bainsi qu['’e]?|\bajout\w*|\bcre\w*|\bmet(?:s|tre|tez)?\b|\bplace[rsz]?\b|\binstalle[rz]?\b|\bprevo(?:ir|yez)\b|\bconserve[rz]?\b/);
  const clauses: { c: string; attached: boolean; each: boolean }[] = [];
  let pending: string | null = null;
  for (const p of parts) {
    if (p === undefined) continue;
    if (p === 'avec' || p === 'chacun@') { pending = p; continue; }
    const c = p.trim();
    if (c) { clauses.push({ c, attached: !!pending || /\bdessus?\b/.test(c), each: pending === 'chacun@' }); pending = null; }
  }

  let stage: [number, number] | null = null;
  let grid: { w: number; d: number; h: number; hung: boolean } | null = null;
  const lineTrusses: { length: number; h: number }[] = [];
  const totems: number[] = [];
  let riser: { w: number; d: number; h: number } | null = null;
  const props: { kind: PropKind; name: string; count: number }[] = [];
  const people: { kind: Performer['kind']; name: string; count: number }[] = [];
  const screens: { w: number; h: number; count: number }[] = [];
  const rigs: TextRig[] = [];
  let last: 'totem' | 'truss' | null = null;

  let layoutNote = false;
  for (const { c, attached, each } of clauses) {
    const lead = /^(\d+)\s+(?=[a-z])/.exec(c);
    const count = clampN(lead ? Number(lead[1]) : 1, 1, 64);
    const rest = lead ? c.slice(lead[0].length) : c;
    const dims = /\d+(?:\.\d+)?\s*(?:m\b|sur\b)/.test(rest);
    // "une scène de concert", "une scène élégante pour un gala": the title of the description.
    if (/^scenes?\b/.test(rest) && !dims) continue;
    // Placement wishes ("une disposition symétrique", "un espace central dégagé") are what the automatic layout does.
    if (/^(?:disposition|implantation|espace|repartition)\b/.test(rest)) {
      if (!layoutNote) lines.push('Disposition automatique : symétrique, centre du plateau dégagé');
      layoutNote = true;
      continue;
    }
    if (/^(?:\w+\s+)?(?:scenes?|plateaux?)\b/.test(rest) && dims && nums(rest).length >= 2 && !/\b(grill|totem|pont)/.test(rest)) {
      const [w, d] = nums(rest) as [number, number];
      stage = [clampN(w, 2, 200), clampN(d, 2, 200)];
      lines.push(`Plateau ${stage[0]} × ${stage[1]} m`);
      continue;
    }
    if (/\bgrill?e?s?\b|\bcadres?\b/.test(rest)) {
      const n = nums(rest);
      const w = clampN(n[0] ?? 10, 1, 60), d = clampN(n[1] ?? w, 1, 60), h = clampN(heightOf(rest) ?? n[2] ?? 6, 0.5, 30);
      grid = { w, d, h, hung: /suspend|plafond|moteur/.test(rest) };
      lines.push(`Grille ${w} × ${d} m à ${h} m ${grid.hung ? '(suspendue)' : '(sur pieds)'}`);
      last = 'truss';
      continue;
    }
    if (/\btotems?\b/.test(rest)) {
      const h = clampN(meters(rest)[0] ?? 2.5, 0.5, 30);
      for (let i = 0; i < count; i++) totems.push(h);
      lines.push(`${count} totem(s) de ${h} m`);
      last = 'totem';
      continue;
    }
    if (/\b(ponts?|truss|structures?|poutres?|perches?)\b/.test(rest)) {
      const m = meters(rest);
      const length = clampN(m[0] ?? 0, 0, 60), h = clampN(heightOf(rest) ?? m[1] ?? 6, 0.5, 30);
      for (let i = 0; i < count; i++) lineTrusses.push({ length, h });
      lines.push(`${count} pont(s)${length ? ` de ${length} m` : ''} à ${h} m`);
      last = 'truss';
      continue;
    }
    // A riser may share its clause with what stands on it ("2 pieds micro sur 5 m2 de praticable").
    const riserM = /(?:(\d+(?:\.\d+)?)\s*m2\s*(?:de\s*)?)?\b(praticables?|estrades?|podiums?)\b/.exec(rest);
    if (riserM) {
      const area = riserM[1] ? Number(riserM[1]) : undefined;
      const dims = nums(rest.slice(riserM.index + riserM[0].length));
      const cm = /(\d+)\s*cm\b/.exec(rest);
      const h = clampN(cm ? Number(cm[1]) / 100 : 0.4, 0.05, 3);
      let w: number, d: number;
      if (area) { w = clampN(Math.round(Math.sqrt(area * 2) * 2) / 2, 0.5, 40); d = clampN(r2(area / w), 0.5, 40); }
      else { w = clampN(dims[0] ?? 2, 0.5, 40); d = clampN(dims[1] ?? 1, 0.5, 40); }
      riser = riser ? { w: Math.max(riser.w, w), d: r2(riser.d + d), h } : { w, d, h };
      lines.push(`Praticable ${w} × ${d} m (${r2(w * d)} m²), hauteur ${Math.round(h * 100)} cm`);
    }
    const body = riserM ? rest.slice(0, riserM.index) : rest;
    const n = riserM && !lead && riserM.index === 0 ? 0 : count;
    const prop = PROPS.find(([re]) => re.test(body));
    if (prop && n) {
      props.push({ kind: prop[1], name: prop[2], count: n });
      lines.push(`${n} × ${prop[2].toLowerCase()}`);
      continue;
    }
    const person = PEOPLE.find(([re]) => re.test(body));
    if (person && n) {
      people.push({ kind: person[1], name: person[2], count: n });
      lines.push(`${n} × ${person[2].toLowerCase()}`);
      continue;
    }
    if (/\becrans?\b|\bmurs?\s*(?:d['e ]\s*)?led\b/.test(body)) {
      const d = nums(body);
      screens.push({ w: clampN(d[0] ?? 4, 0.2, 60), h: clampN(d[1] ?? (d[0] ? r2((d[0] * 9) / 16) : 2.25), 0.2, 30), count });
      lines.push(`${count} écran(s) LED`);
      continue;
    }
    if (riserM) continue;
    // Fixtures: a model of the library ("ignite300", "robe megapointe"), else a generic word ("lyre", "par").
    const target: TextRig['target'] = attached && last === 'totem' ? 'totem' : 'truss';
    const words = body.split(/\s+/).filter((w) => w && !STOP.has(w));
    const generic = GENERIC.find(([re]) => re.test(body));
    const model = generic ? undefined : matchProfile(words.join(''), profiles) ?? words.map((w) => matchProfile(w, profiles)).find(Boolean);
    const unknown = model || generic ? undefined : words.find((w) => /[a-z]/.test(w) && /\d/.test(w));
    const profile = model ?? profiles.find((p) => p.id === (generic?.[1] ?? (unknown ? 'demo-spot' : '')));
    if (!profile) { if (words.length) notices.push(`Non compris : « ${c} »`); continue; }
    const total = target === 'totem' && (each || !lead) ? Math.max(1, totems.length) * (each ? count : 1) : count;
    if (unknown) notices.push(`Modèle « ${unknown} » introuvable dans la bibliothèque : remplacé par ${profile.name} (à changer dans Fixtures)`);
    rigs.push({ profileId: profile.id, mode: profile.modes[0]!.name, count: total, prefix: (model?.name ?? generic?.[2] ?? unknown!.toUpperCase()).slice(0, 40), movable: profile.type.startsWith('moving'), target });
    lines.push(`${total} × ${profile.manufacturer} ${profile.name}${target === 'totem' ? ' sur les totems' : ''}`);
  }

  // Layout: grid centred on the stage, totems beside it, the riser just upstage of centre.
  const W = stage?.[0] ?? Math.max(8, (grid?.w ?? 0) + 2, ...lineTrusses.map((t) => t.length + 2), (riser?.w ?? 0) + 2);
  const D = stage?.[1] ?? Math.max(6, (grid?.d ?? 0) + 2, (riser?.d ?? 0) + 3);
  const cy = r2(D / 2);
  const trusses: Truss[] = [];
  const truss = (name: string, x: number, y: number, height: number, length: number, extra: Partial<Truss> = {}) =>
    trusses.push({ id: id(), name, shape: 'line', x: r2(x), y: r2(y), height, length, rotation: 0, support: 'towers', ...extra });
  if (grid) {
    const ends = grid.hung ? 'hung' : 'towers', sides = grid.hung ? 'hung' : 'none';
    truss('Grille face', 0, cy - grid.d / 2, grid.h, grid.w, { support: ends });
    truss('Grille contre', 0, cy + grid.d / 2, grid.h, grid.w, { support: ends });
    truss('Grille jardin', -grid.w / 2, cy, grid.h, grid.d, { rotation: 90, support: sides });
    truss('Grille cour', grid.w / 2, cy, grid.h, grid.d, { rotation: 90, support: sides });
  }
  lineTrusses.forEach((t, i) => truss(`Pont ${i + 1}`, 0, (D * (i + 1)) / (lineTrusses.length + 1), t.h, t.length || W - 1, { support: 'hung' }));
  const side = Math.max(grid ? grid.w / 2 + 1 : 0, W / 2 - 0.8);
  const pairs = Math.ceil(totems.length / 2);
  totems.forEach((h, i) => {
    const j = Math.floor(i / 2);
    const y = pairs > 1 ? D * (0.25 + (0.5 * j) / (pairs - 1)) : cy;
    truss(`Totem ${i % 2 ? 'cour' : 'jardin'}${pairs > 1 ? ` ${j + 1}` : ''}`, i % 2 ? side : -side, y, h, 0.5, { shape: 'totem', support: 'none' });
  });

  const outProps: StageProp[] = [];
  const addProp = (name: string, kind: PropKind, x: number, y: number, w: number, d: number, h: number, elevation = 0) =>
    outProps.push({ id: id(), name, kind, x: r2(x), y: r2(y), width: w, depth: d, height: h, elevation, rotation: 0, color: '#15171c' });
  const ry = r2(Math.min(D - 1, cy + 0.5));
  if (riser) addProp('Praticable', 'riser', 0, ry, riser.w, riser.d, riser.h);
  const spread = (n: number, width: number, i: number) => (n === 1 ? 0 : -width / 2 + (width * i) / (n - 1));
  // Lecterns and mic stands stand on the riser when there is one (performers climb onto it on their own).
  const front = riser ? { y: ry - riser.d / 4, width: Math.max(0, riser.w / 2 - 0.4), elev: riser.h } : { y: 1.5, width: W / 2, elev: 0 };
  const markers: StageMarker[] = [], performers: Performer[] = [];
  for (const p of people) {
    const lectern = p.kind === 'lectern';
    for (let i = 0; i < p.count; i++) {
      const x = lectern && riser ? -riser.w / 4 + spread(p.count, 1, i) : spread(p.count, W / 2, i);
      const y = lectern ? front.y : D * 0.4;
      const m: StageMarker = { id: id(), name: p.count > 1 ? `${p.name} ${i + 1}` : p.name, x: r2(x), y: r2(y), height: r2(1.4 + (lectern ? front.elev : 0)) };
      markers.push(m);
      performers.push({ id: id(), name: m.name, kind: p.kind, x: m.x, y: m.y, rotation: 0, markerId: m.id });
    }
  }
  for (const p of props) {
    for (let i = 0; i < p.count; i++) {
      const name = p.count > 1 ? `${p.name} ${i + 1}` : p.name;
      if (p.kind === 'mic') addProp(name, 'mic', (riser ? riser.w / 8 : 0) + spread(p.count, front.width, i), front.y, 0.3, 0.3, 1.6, front.elev);
      else if (p.kind === 'speaker') addProp(name, 'speaker', (i % 2 ? 1 : -1) * (W / 2 - 0.5), 0.6 + Math.floor(i / 2) * 0.8, 0.6, 0.6, 1.2);
      else if (p.kind === 'monitor') addProp(name, 'monitor', spread(p.count, W / 2, i), 1, 0.6, 0.45, 0.35);
      else if (p.kind === 'stairs') addProp(name, 'stairs', riser ? spread(p.count, Math.max(0, riser.w - 1.2), i) : spread(p.count, W / 2, i), riser ? ry - riser.d / 2 - 0.4 : 0.4, 1.2, 0.8, riser?.h ?? 0.6);
      else if (p.kind === 'drape') addProp(name, 'drape', 0, D - 0.1 - i * 0.3, W, 0.1, 4);
      else if (p.kind === 'table') addProp(name, 'table', spread(p.count, W / 2, i), D * 0.35, 1.8, 0.8, 0.75);
      else addProp(name, p.kind, spread(p.count, W - 2, i), D * 0.7, 0.5, 0.5, p.kind === 'column' ? 2.5 : 0.5);
    }
  }
  const outScreens: StageScreen[] = screens.flatMap((s) => Array.from({ length: s.count }, (_, i) => ({
    id: id(), name: s.count > 1 ? `Écran ${i + 1}` : 'Écran', x: r2(spread(s.count, Math.max(0, W - s.w - 1), i)), y: r2(D - 0.3),
    elevation: 1.5, width: s.w, height: s.h, rotation: 0, source: 'color' as const, color: '#1e3a8a', image: null, glow: 0.5,
  })));
  if (rigs.some((r) => r.target === 'totem') && !totems.length) notices.push('Projecteurs « dessus » sans totem : accrochés aux structures');
  if (rigs.length && !trusses.length) notices.push('Aucune structure décrite : projecteurs placés au-dessus du plateau, sans accroche');

  return { layout: { stageWidth: r2(W), stageDepth: r2(D), markers, trusses, performers, screens: outScreens, props: outProps }, rigs, lines, notices };
}
