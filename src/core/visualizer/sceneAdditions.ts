import { screenSchema, type FixtureProfile, type Project, type StageProp, type StageScreen, type Truss } from '../model/schemas';
import { libraryItem } from './library';
import { buildAssembly, type AssemblyId } from './assemblies';
import { newElement, snapPropToTruss } from './sceneEdit';
import { matchProfile } from './sceneFromText';

/**
 * Written request → structured additions to the CURRENT stage ("Ajoute deux line arrays de chaque côté de la scène,
 * une batterie au centre arrière, deux amplis guitare et un grand écran LED derrière les musiciens"). Offline and
 * deterministic: each clause is resolved to a library item (or an assembly, a screen, a fixture profile), a quantity
 * and a stage position; what is ambiguous, unavailable or not understood is reported, never silently invented.
 * Nothing is applied here: the caller previews `lines` / `notices`, then applies `patch` (one undoable step).
 */
type Vis = Project['visualizer'];
type Zone = 'left' | 'right' | 'center' | 'sides' | null;
type Depth = 'front' | 'back' | 'mid' | 'house' | null;

export interface FixtureAddition { profileId: string; mode: string; count: number; label: string; movable: boolean }
export interface AdditionPlan {
  /** Visualizer patch: the current lists plus the new elements (only the lists that change). */
  patch: Partial<Pick<Vis, 'props' | 'screens' | 'trusses'>>;
  /** Fixtures to patch and hang (the caller adds them through the patch commands). */
  fixtures: FixtureAddition[];
  /** Ids of the elements created by `patch`. */
  created: { props: string[]; screens: string[]; trusses: string[] };
  /** One line per understood request (preview). */
  lines: string[];
  /** Ambiguities, substitutions, unavailable equipment and parts not understood. */
  notices: string[];
}

interface Entry { re: RegExp; label: string; item?: string; assembly?: AssemblyId; screen?: 'main' | 'side'; fixture?: string; refine?: (c: string) => { item: string; note?: string } }

/** Most specific first: "ampli basse" before "basse", "écran latéral" before "écran". */
const ENTRIES: Entry[] = [
  { re: /\bline\s*-?\s*arrays?\b|\bgrappes?\b|\bsystemes? de diffusion\b/, label: 'Line array', item: 'line-array-8', refine: (c) => (/\b(?:pose|au sol|stack)/.test(c) ? { item: 'line-array-ground' } : /\b(?:1[2-9]|2\d)\s*(?:modules|boites|elements)/.test(c) ? { item: 'line-array-12' } : { item: 'line-array-8' }) },
  { re: /\bsysteme de facade\b|\bsono complete\b/, label: 'Système de façade', assembly: 'pa-system' },
  { re: /\b(?:caissons?(?: de basses?)?|subs?|subwoofers?|infras?)\b/, label: 'Caisson de basses', item: 'sub' },
  { re: /\bretours?\b|\bwedges?\b/, label: 'Retour de scène', item: 'monitor' },
  { re: /\bamplis?\s*(?:de\s*)?basses?\b|\bamplificateurs?\s*(?:de\s*)?basses?\b/, label: 'Ampli basse', item: 'amp-bass' },
  { re: /\b(?:amplis?|amplificateurs?|stacks?|combos?)\b/, label: 'Ampli guitare', item: 'amp-combo', refine: (c) => (/\bstack/.test(c) ? { item: 'amp-stack' } : /\bguitare/.test(c) || /\bcombo/.test(c) ? { item: 'amp-combo' } : { item: 'amp-combo', note: '« ampli » sans précision compris comme ampli guitare combo.' }) },
  { re: /\benceintes? sur pieds?\b/, label: 'Enceinte sur pied', item: 'pa-stand' },
  { re: /\benceintes?(?: de facade)?\b|\bfacades?\b|\bhaut-?parleurs?\b/, label: 'Enceinte de façade', item: 'speaker', refine: (c) => (/\bcolonnes?\b/.test(c) ? { item: 'speaker-column' } : { item: 'speaker', note: /\bsuspendu|accroch/.test(c) ? '« enceinte suspendue » : utilisez « line array » pour un système accroché.' : undefined }) },
  { re: /\bracks?\b/, label: 'Rack audio', item: 'audio-rack' },
  { re: /\bbatteries?\b|\bkits? de batterie\b|\bfuts\b/, label: 'Batterie', item: 'drums' },
  { re: /\bcymbales?\b/, label: 'Cymbale', item: 'cymbal' },
  { re: /\bbasses?\b(?!\s*frequence)/, label: 'Basse', item: 'guitar-bass' },
  { re: /\bguitares?\b/, label: 'Guitare', item: 'guitar-electric', refine: (c) => (/\b(?:acoustiques?|folk|seches?|classiques?)\b/.test(c) ? { item: 'guitar-acoustic' } : { item: 'guitar-electric' }) },
  { re: /\bpianos? a queue\b|\bgrands? pianos?\b/, label: 'Piano à queue', item: 'grand-piano' },
  { re: /\bpianos? droits?\b/, label: 'Piano droit', item: 'upright-piano' },
  { re: /\bpianos?\b/, label: 'Piano', item: 'stage-piano', refine: (c) => ({ item: 'stage-piano', note: /\bpiano\b/.test(c) && !/\bscene|numerique|electrique/.test(c) ? '« piano » compris comme piano de scène (précisez « à queue » ou « droit »).' : undefined }) },
  { re: /\bclaviers?\b|\bsynthe(?:tiseur)?s?\b|\borgues?\b/, label: 'Clavier', item: 'keyboard' },
  { re: /\bpieds? de micros?\b|\bmicros?\b|\bmicrophones?\b/, label: 'Pied de micro', item: 'mic' },
  { re: /\bpupitres? (?:a|de) partitions?\b|\blutrins?\b/, label: 'Pupitre à partitions', item: 'music-stand' },
  { re: /\bfumee lourde\b/, label: 'Fumée lourde', item: 'low-fog' },
  { re: /\bhazers?\b|\bbrume\b/, label: 'Machine à brume', item: 'hazer' },
  { re: /\bmachines? a fumee\b|\bfumee\b/, label: 'Machine à fumée', item: 'fog' },
  { re: /\betincelles?\b|\bsparkulars?\b/, label: 'Machine à étincelles', item: 'spark' },
  { re: /\bco2\b|\bcryo\b/, label: 'Jet CO2', item: 'co2' },
  { re: /\becrans? lateraux\b|\becrans? lateral\b|\bimag\b/, label: 'Écran latéral', screen: 'side' },
  { re: /\bmurs? (?:d['’ ]?)?(?:led|video)\b|\becrans?\b/, label: 'Écran LED', screen: 'main' },
  { re: /\bportiques?\b/, label: 'Portique', assembly: 'goalpost' },
  { re: /\btoitures?\b|\bground support\b/, label: 'Toiture', assembly: 'roof' },
  { re: /\bgrilles?(?: de rigging)?\b/, label: 'Grille de rigging', assembly: 'grid' },
  { re: /\bmoteurs?(?: de levage)?\b|\bpalans?\b/, label: 'Moteur de levage', item: 'hoist' },
  { re: /\bembases?\b/, label: 'Embase', item: 'truss-base' },
  { re: /\bpraticables?\b|\bestrades?\b|\bpodiums?\b/, label: 'Praticable', item: 'riser-2x1', refine: (c) => (/\bbatterie/.test(c) ? { item: 'drum-riser' } : { item: 'riser-2x1' }) },
  { re: /\bescaliers?\b|\bmarches\b/, label: 'Escalier', item: 'stairs' },
  { re: /\brideaux?\b|\bpendrillons?\b/, label: 'Rideau', item: 'curtain' },
  { re: /\btoiles?\b/, label: 'Toile tendue', item: 'canvas' },
  { re: /\bpanneaux?(?: de fond| decoratifs?)?\b|\bfonds? de scene\b/, label: 'Panneau de fond', item: 'backdrop' },
  { re: /\barches?\b/, label: 'Arche', item: 'arch' },
  { re: /\bcolonnes?\b/, label: 'Colonne', item: 'column' },
  { re: /\bregies? dj\b|\bdj booth\b|\bcabine dj\b|\bdj\b/, label: 'Régie DJ', item: 'dj-booth' },
  { re: /\bconsoles? (?:lumiere|lumieres|light)\b/, label: 'Console lumière', item: 'console-light' },
  { re: /\bconsoles?\b|\bregies? (?:son|facade)\b|\btables? de mixage\b/, label: 'Console son', item: 'console-audio' },
  { re: /\bflight-?cases?\b|\bmalles?\b/, label: 'Flight-case', item: 'flight-case' },
  { re: /\btabourets?\b/, label: 'Tabouret', item: 'stool' },
  { re: /\bchaises?\b|\bsieges?\b/, label: 'Chaise', item: 'chair' },
  { re: /\btables?\b/, label: 'Table', item: 'table' },
  { re: /\bvaubans?\b/, label: 'Barrière Vauban', item: 'barrier-vauban' },
  { re: /\bbarrieres?\b|\bcrash\b/, label: 'Crash barrière', item: 'barrier' },
  { re: /\bpasse-?cables?\b|\bpassages? de cables?\b|\bcables?\b/, label: 'Passage de câbles', item: 'cable' },
  { re: /\bcubes?\b/, label: 'Cube', item: 'box' },
  { re: /\blyres? wash\b|\bwash\b/, label: 'Lyre wash', fixture: 'demo-wash' },
  { re: /\blyres?\b|\bspots?\b|\bbeams?\b|\btetes? mobiles?\b/, label: 'Lyre', fixture: 'demo-spot' },
  { re: /\bpars?\b|\bprojecteurs? led\b/, label: 'PAR LED', fixture: 'demo-par-rgbw' },
  { re: /\bstrob/, label: 'Stroboscope', fixture: 'demo-strobe' },
  { re: /\bbarres? led\b|\bbarres?\b/, label: 'Barre LED', fixture: 'demo-led-bar-4' },
  { re: /\bblinders?\b/, label: 'Blinder', fixture: 'blinder' },
];
/** Recognised but not in the library: reported as unavailable instead of being replaced by something else. */
const UNAVAILABLE: [RegExp, string][] = [
  [/\bharpes?\b/, 'harpe'], [/\bviolons?\b|\bviolon?celles?\b|\bcontrebasses?\b/, 'instruments à cordes frottées'],
  [/\bsaxophones?\b|\btrompettes?\b|\btrombones?\b|\bcuivres?\b/, 'cuivres et vents'], [/\bpercussions?\b|\bcongas?\b|\bbongos?\b/, 'percussions'],
  [/\bpyro(?:technie)?s?\b|\bfeux? d['’ ]?artifice\b|\bflammes?\b/, 'pyrotechnie et flammes'], [/\blasers?\b/, 'lasers'],
  [/\bconfettis?\b|\bserpentins?\b/, 'canons à confettis'], [/\bdrones?\b/, 'drones'], [/\bhologrammes?\b/, 'hologrammes'],
];
const NUMBER_WORDS: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12, quinze: 15, vingt: 20 };
const MAX_PER_REQUEST = 40;
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Quantity written before the equipment noun ("deux line arrays de 12 modules" → 2, not 12). */
function quantity(c: string, label: string, notices: string[]): number {
  const q = /\b(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|douze|quinze|vingt)\b/.exec(c);
  if (/\b(?:paire|couple)s? d/.test(c)) return 2;
  if (/\bquelques\b|\bplusieurs\b|\bdes\b/.test(c) && !q) { notices.push(`Quantité imprécise pour « ${label} » : 2 ajouté(e)s.`); return 2; }
  if (!q) return 1;
  const n = /^\d+$/.test(q[1]!) ? Number(q[1]) : NUMBER_WORDS[q[1]!]!;
  if (n > MAX_PER_REQUEST) { notices.push(`${n} × « ${label} » ramené à ${MAX_PER_REQUEST}.`); return MAX_PER_REQUEST; }
  return Math.max(1, n);
}

function zoneOf(c: string): Zone {
  if (/\bde chaque cote\b|\bdes deux cotes\b|\bpar cote\b|\bsymetrique/.test(c)) return 'sides';
  if (/\bjardin\b|\ba gauche\b|\bgauche\b/.test(c)) return 'left';
  if (/\bcour\b|\ba droite\b|\bdroite\b/.test(c)) return 'right';
  if (/\bcentre\b|\bmilieu\b|\bcentral|\bau centre\b/.test(c)) return 'center';
  return null;
}
function depthOf(c: string): Depth {
  if (/\bregie\b|\bpublic\b|\bsalle\b|\bfoh\b/.test(c) && !/\bregie dj\b/.test(c)) return 'house';
  if (/\barriere\b|\bfond\b|\blointain\b|\bderriere\b|\bau fond\b/.test(c)) return 'back';
  if (/\bavant\b|\bdevant\b|\bnez de scene\b|\bbord\b|\bface\b|\bavant-scene\b/.test(c)) return 'front';
  return null;
}
/** "6 x 3 m" (any order of "x", "sur", "par") → [6, 3]. */
const dims = (c: string): [number, number] | null => {
  const m = /(\d+(?:\.\d+)?)\s*m?\s*(?:x|sur|par)\s*(\d+(?:\.\d+)?)\s*m?\b/.exec(c);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

/** Default stage spot of a library item (x across, y upstage) and its rotation, from the request's zone and depth. */
function spotFor(item: string, kind: string, vis: Vis, zone: Zone, depth: Depth): { x: number; y: number; rotation: number; side: number } {
  const W = vis.stageWidth, D = vis.stageDepth;
  const wing = W / 2 + 0.8;
  const y = depth === 'front' ? 0.8 : depth === 'back' ? D * 0.8 : depth === 'house' ? -Math.max(8, D) : depth === 'mid' ? D * 0.5 : null;
  const x = zone === 'left' ? -W / 4 : zone === 'right' ? W / 4 : zone === 'center' ? 0 : null;
  const base: Record<string, { x: number; y: number; rotation?: number; side?: number }> = {
    'line-array': { x: 0, y: 0.3, side: wing },
    speaker: { x: 0, y: 0, side: W / 2 + 0.5 },
    'pa-stand': { x: 0, y: 0.2, side: W / 2 - 0.4 },
    sub: { x: 0, y: -0.6, side: wing },
    monitor: { x: 0, y: 0.6, rotation: 180 },
    drums: { x: 0, y: D * 0.75 },
    amp: { x: item === 'amp-bass' ? W / 4 : -W / 4, y: D * 0.65, side: W / 4 },
    guitar: { x: item === 'guitar-bass' ? W / 4 + 0.8 : -W / 4 - 0.8, y: D * 0.55, side: W / 4 + 0.8 },
    keyboard: { x: W / 4, y: D * 0.5, side: W / 4 },
    piano: { x: -W / 4, y: D * 0.5, side: W / 4 },
    mic: { x: 0, y: 1.3, side: W / 4 },
    'music-stand': { x: 0, y: 1.8 },
    console: { x: 0, y: -Math.max(8, D) },
    barrier: { x: 0, y: -1.5 },
    cable: { x: 0, y: -0.5 },
    'fog-machine': { x: 0, y: 0.4, side: W / 2 - 0.5 },
    'spark-machine': { x: 0, y: 0.3, side: W / 2 - 0.6 },
    'co2-jet': { x: 0, y: 0.3, side: W / 2 - 0.4 },
    drape: { x: 0, y: D - 0.2 },
    backdrop: { x: 0, y: D - 0.4 },
    hoist: { x: 0, y: D * 0.5 },
  };
  const b = base[kind] ?? { x: 0, y: D * 0.5 };
  return { x: x ?? b.x, y: y ?? b.y, rotation: b.rotation ?? 0, side: b.side ?? W / 4 };
}

/** Splits the request into clauses ("…, …", "… et …", "puis"), keeping "de part et d'autre" and "x et y" sizes. */
function clauses(text: string): string[] {
  const src = fold(text).replace(/(\d),(\d)/g, '$1.$2').replace(/\bde part et d['’ ]?autre\b/g, 'de chaque cote').replace(/\bm2\b|m²/g, ' m2 ');
  return src.split(/[,;.\n]|\bpuis\b|\bainsi que\b|\bet (?=(?:un|une|des|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|\d|l['’ ]|le|la|les|ajoute|place|installe)\b)/).map((c) => c.trim()).filter(Boolean);
}

/** Plans the additions of `text` onto the current stage; ids come from `id` so the function stays pure and testable. */
export function planSceneAdditions(text: string, vis: Vis, id: () => string, profiles: readonly FixtureProfile[] = []): AdditionPlan {
  const props: StageProp[] = [], screens: StageScreen[] = [], trusses: Truss[] = [];
  const fixtures: FixtureAddition[] = [], lines: string[] = [], notices: string[] = [];
  const at = (nx: number, ny: number) => ({ x: r2(Math.max(-100, Math.min(100, nx))), y: r2(Math.max(-100, Math.min(100, ny))) });
  const working = (): Vis => ({ ...vis, props: [...vis.props, ...props], screens: [...vis.screens, ...screens], trusses: [...vis.trusses, ...trusses] });
  for (const c of clauses(text)) {
    const missing = UNAVAILABLE.find(([re]) => re.test(c));
    if (missing) notices.push(`Indisponible dans la bibliothèque : ${missing[1]} (« ${c} »).`);
    const e = ENTRIES.find((x) => x.re.test(c));
    if (!e) { if (!missing && /[a-z]{3}/.test(c) && !/^(?:ajoute|ajouter|place|placer|installe|installer|mets|mettre)$/.test(c)) notices.push(`Non compris : « ${c} ».`); continue; }
    const n = quantity(c.slice(0, e.re.exec(c)!.index), e.label, notices);
    const zone = zoneOf(c), depth = depthOf(c);
    if (e.fixture) {
      const p = profiles.find((x) => x.id === e.fixture) ?? matchProfile(e.label, profiles);
      if (!p) { notices.push(`Indisponible : aucun profil de projecteur pour « ${e.label} ».`); continue; }
      fixtures.push({ profileId: p.id, mode: p.modes[0]!.name, count: n, label: p.name, movable: p.type.startsWith('moving') });
      lines.push(`${n} × ${p.name} (projecteur${p.fictional ? ' de démonstration' : ''}, accroché aux structures)`);
      continue;
    }
    if (e.assembly) {
      for (let i = 0; i < n; i++) {
        const spot = zone === 'left' ? -vis.stageWidth / 4 : zone === 'right' ? vis.stageWidth / 4 : 0;
        const parts = buildAssembly(e.assembly, vis, at(spot + i * 7, depth === 'back' ? vis.stageDepth * 0.8 : vis.stageDepth / 2), id);
        trusses.push(...parts.trusses); props.push(...parts.props);
      }
      lines.push(`${n} × ${e.label} (assemblage de structures et d’accessoires)`);
      continue;
    }
    if (e.screen) {
      const size = dims(c);
      const big = /\bgrand|\bgeant|\benorme|\blarge/.test(c);
      const W = vis.stageWidth;
      for (let i = 0; i < n; i++) {
        const side = e.screen === 'side' || (zone === 'sides' && n > 1);
        const w = size ? size[0] : side ? 4 : big ? Math.min(14, Math.round(W * 0.75)) : Math.min(6, Math.round(W / 2));
        const h = size ? size[1] : r2(w * 9 / 16);
        const s = side ? (i % 2 ? 1 : -1) : 0;
        const x = side ? s * (W / 2 + w / 2 + 0.5) : zone === 'left' ? -W / 4 : zone === 'right' ? W / 4 : (i - (n - 1) / 2) * (w + 0.5);
        const y = side ? 0.5 : depth === 'front' ? 0.5 : vis.stageDepth - 0.3;
        const parsed = screenSchema.safeParse({ id: id(), name: side ? `Écran ${s < 0 ? 'jardin' : 'cour'}` : 'Écran LED', ...at(x, y), elevation: side ? 3 : 0.5, width: w, height: h, rotation: 0, source: 'color', color: '#2563eb', glow: 0.5, cabinet: 0.5 });
        if (parsed.success) screens.push(parsed.data); else { notices.push(`Écran de ${w} × ${h} m hors limites : ignoré.`); break; }
      }
      if (screens.length) lines.push(`${n} × ${e.label} ${screens.at(-1)!.width} × ${screens.at(-1)!.height} m${e.screen === 'side' || zone === 'sides' ? ' (latéraux)' : depth === 'front' ? '' : ' (fond de scène)'}`);
      if (!size && !/\bgrand|\bpetit/.test(c)) notices.push(`Taille d’écran non précisée : ${screens.at(-1)?.width ?? '?'} m de large par défaut.`);
      continue;
    }
    const refined = e.refine?.(c);
    if (refined?.note) notices.push(refined.note);
    const item = libraryItem(refined?.item ?? e.item!);
    if (!item || item.kind !== 'prop') { notices.push(`Indisponible : « ${e.label} ».`); continue; }
    const kind = item.preset.kind!;
    const spot = spotFor(item.id, kind, vis, zone, depth);
    // "deux X de chaque côté": one per side when n = 2 (common PA wording), else n per side; flagged as ambiguous.
    const perSide = zone === 'sides' && (/\bpar cote\b|\bchacun\b/.test(c) || n !== 2) ? n : 0;
    if (zone === 'sides' && n === 2 && !perSide) notices.push(`« ${n} ${e.label.toLowerCase()} de chaque côté » compris comme un par côté (2 au total). Écrivez « 2 par côté » pour en avoir 4.`);
    const total = zone === 'sides' ? (perSide ? n * 2 : Math.max(2, n)) : n;
    const width = item.preset.width ?? 1;
    const placed: StageProp[] = [];
    for (let i = 0; i < total; i++) {
      let x: number;
      const y = spot.y;
      if (zone === 'sides') {
        const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
        x = side * (spot.side + k * (width + 0.2));
      } else x = spot.x + (i - (total - 1) / 2) * (width + 0.3);
      const el = newElement(working(), 'prop', id, at(x, y), { ...item.preset, rotation: spot.rotation }) as StageProp;
      // Flown equipment under an existing truss when one is close.
      const hang = snapPropToTruss(el, vis.trusses);
      props.push(hang ? { ...el, x: hang.x, y: hang.y, elevation: hang.elevation } : el);
      placed.push(props.at(-1)!);
    }
    const where = zone === 'sides' ? 'jardin et cour' : zone === 'left' ? 'jardin' : zone === 'right' ? 'cour' : depth === 'back' ? 'fond de scène' : depth === 'front' ? 'avant-scène' : depth === 'house' ? 'en salle' : 'position par défaut';
    const flown = placed.some((p) => p.elevation > 0.7 && kind === 'line-array') ? `, suspendu à ${placed[0]!.elevation} m` : '';
    lines.push(`${total} × ${item.label} (${where}${flown})`);
  }
  const W = working();
  const over = W.props.length > 256 ? 'décors' : W.screens.length > 16 ? 'écrans' : W.trusses.length > 64 ? 'structures' : '';
  if (over) return { patch: {}, fixtures: [], created: { props: [], screens: [], trusses: [] }, lines: [], notices: [...notices, `Limite de ${over} atteinte : rien n’a été préparé.`] };
  return {
    patch: { ...(props.length ? { props: W.props } : {}), ...(screens.length ? { screens: W.screens } : {}), ...(trusses.length ? { trusses: W.trusses } : {}) },
    fixtures,
    created: { props: props.map((x) => x.id), screens: screens.map((x) => x.id), trusses: trusses.map((x) => x.id) },
    lines,
    notices,
  };
}

/** True when the text asks to ADD equipment to the current stage rather than to describe a whole new stage. */
export const isAdditionRequest = (text: string): boolean =>
  /^\s*(?:ajoute|ajouter|rajoute|rajouter|place|placer|installe|installer|mets|mettre|pose|poser)\b/.test(fold(text)) && !/\bcreer une scene\b|\bnouvelle scene\b/.test(fold(text));
