import type { DemoSpec } from './catalog';
import { row, chair, lineArray, sub, desk, barriers, fog, screen } from './decor';
import { C } from './palette';

/**
 * Ten large-format, fictional production rigs. Each project is a complete, deterministic DMX demo:
 * two audience trusses (fixtures physically above the public), stage trusses, patch, looks, effects and cues.
 */
interface MegaPreset {
  id: string; name: string; venue: string; show: string; category: string; description: string;
  bpm: number; colors: [string, string, string]; audience: string; stageLook: string; finale: string;
}
const PRESETS: MegaPreset[] = [
  { id: 'arena-tour', name: 'NEON ODYSSEY — tournée arena', venue: 'Arena Horizon (18 000 places)', show: 'Neon Odyssey — World Tour', category: 'Grande production', description: 'Scène monumentale, ponts lumière croisés, lignes de projecteurs au-dessus du public et mur LED panoramique.', bpm: 128, colors: [C.cyan, C.magenta, C.violet], audience: 'Halo public', stageLook: 'Néon', finale: 'Supernova' },
  { id: 'festival-mainstage', name: 'MAINSTAGE — festival open air', venue: 'Parc des Horizons (25 000 festivaliers)', show: 'Festival Horizons — Mainstage', category: 'Festival', description: 'Mainstage plein air avec tours latérales, tours delay, ponts de face et couverture lumineuse du public.', bpm: 132, colors: [C.blue, C.cyan, C.white], audience: 'Public en lumière', stageLook: 'Festival', finale: 'Headliner' },
  { id: 'wedding-palace', name: 'ROYAL NIGHT — mariage prestige', venue: 'Domaine des Ormes (350 invités)', show: 'Réception Royal Night', category: 'Mariage', description: 'Piste de danse centrale, structures aluminium en carré, lyres suspendues au-dessus des invités et éclairage architectural.', bpm: 104, colors: [C.gold, C.warm, C.pink], audience: 'Ambiance invités', stageLook: 'Élégance', finale: 'Ouverture de bal' },
  { id: 'club-megastructure', name: 'HYPERCLUB — structure immersive', venue: 'Warehouse 09 (1 500 personnes)', show: 'Hyperclub — All Night Long', category: 'Club', description: 'Grille de ponts croisés, barres pixel, strobes latéraux et projecteurs suspendus au-dessus de la foule.', bpm: 138, colors: [C.violet, C.magenta, C.cyan], audience: 'Immersion foule', stageLook: 'Tunnel', finale: 'Peak time' },
  { id: 'sports-opening', name: 'OPENING CEREMONY — cérémonie sportive', venue: 'Stade métropolitain (32 000 places)', show: 'Cérémonie d’ouverture', category: 'Sport & cérémonie', description: 'Terrain central, tours de poursuite, couronne lumière et couverture des tribunes proches.', bpm: 120, colors: [C.white, C.gold, C.blue], audience: 'Tribunes éclairées', stageLook: 'Cérémonie', finale: 'Entrée des équipes' },
  { id: 'tv-awards', name: 'LIVE AWARDS — plateau TV', venue: 'Studio Nova (plateau 1 200 m²)', show: 'Live Awards — prime time', category: 'Télévision', description: 'Plateau multi-zones, arches LED, ponts de face et contre, éclairage du public et zones caméra.', bpm: 116, colors: [C.blue, C.pink, C.white], audience: 'Public plateau', stageLook: 'On air', finale: 'Remise des prix' },
  { id: 'symphonic-show', name: 'ORCHESTRA 360 — symphonique immersif', venue: 'Palais des Arts (2 800 places)', show: 'Orchestra 360', category: 'Concert', description: 'Orchestre central, anneaux lumière, éclairage doux des spectateurs et tableaux cinématiques.', bpm: 92, colors: [C.warm, C.gold, C.violet], audience: 'Salle immersive', stageLook: 'Cinématique', finale: 'Apothéose' },
  { id: 'electro-dome', name: 'DOME EXPERIENCE — show électronique', venue: 'Dôme Polaris (9 000 personnes)', show: 'Polaris — Electronic Experience', category: 'Musique électronique', description: 'Dôme immersif, ponts radiaux simulés, lignes de wash au-dessus de la foule et murs LED.', bpm: 140, colors: [C.cyan, C.blue, C.magenta], audience: 'Dôme vivant', stageLook: 'Électro', finale: 'Drop massif' },
  { id: 'fashion-gala', name: 'COUTURE — défilé grand format', venue: 'Grand Palais des Créateurs (2 000 invités)', show: 'Couture — collection de saison', category: 'Mode', description: 'Podium central traversant la salle, ponts de face, lignes latérales et éclairage public élégant.', bpm: 110, colors: [C.white, C.warm, C.gold], audience: 'Salle couture', stageLook: 'Catwalk', finale: 'Final créateurs' },
  { id: 'wedding-festival', name: 'SUMMER CELEBRATION — réception XXL', venue: 'Domaine des Lumières (800 invités)', show: 'Summer Celebration', category: 'Événementiel', description: 'Grande réception extérieure, piste de danse, portiques lumière, projecteurs au-dessus des invités et scène DJ.', bpm: 124, colors: [C.orange, C.pink, C.violet], audience: 'Dancefloor public', stageLook: 'Sunset', finale: 'All together' },
];

function makeMegaDemo(p: MegaPreset): DemoSpec {
  const [a, b, c] = p.colors;
  const rigs: DemoSpec['rigs'] = [
    { prefix: 'SPOT', label: 'Lyres spot — pont avant', profile: 'demo-spot', mode: '13ch étendu', count: 8, universe: 1, y: 2, height: 9, span: 0.9, color: '#8B5CF6' },
    { prefix: 'WASH', label: 'Lyres wash — pont arrière', profile: 'demo-wash', mode: '13ch', count: 8, universe: 1, y: 13, height: 9, span: 0.9, color: '#F59E0B' },
    { prefix: 'PAR', label: 'PAR LED — fond de scène', profile: 'demo-par-rgbw', mode: '6ch DRGBW+Strobe', count: 12, universe: 1, y: 16.5, height: 0.4, span: 0.9, color: '#22D3EE' },
    { prefix: 'BAR', label: 'Barres LED pixel', profile: 'demo-led-bar-4', mode: '14ch pixels', count: 6, universe: 1, y: 17, height: 0.3, span: 0.9, color: '#F472B6' },
    { prefix: 'BLIND', label: 'Blinders — face public', profile: 'demo-par-rgb', mode: '5ch DRGB+Strobe', count: 4, universe: 1, y: 0.5, height: 9, span: 0.75, color: '#FDE68A' },
    { prefix: 'STR', label: 'Strobes — ponts latéraux', profile: 'demo-strobe', mode: '2ch', count: 4, universe: 1, y: 8, height: 9, span: 0.8, color: '#FACC15' },
    { prefix: 'AUD_FRONT', label: 'Wash suspendus — gradins avant', profile: 'demo-wash', mode: '13ch', count: 6, universe: 2, y: -11, height: 8, span: 0.9, color: '#34D399' },
    { prefix: 'AUD_REAR', label: 'Wash suspendus — gradins arrière', profile: 'demo-wash', mode: '13ch', count: 6, universe: 2, y: -15, height: 8, span: 0.9, rotation: 180, color: '#60A5FA' },
  ];
  const decor: DemoSpec['decor'] = [
    { name: 'Plateau principal 20 × 12 m', kind: 'riser' as const, x: 0, y: 10, width: 20, depth: 12, height: 1 },
    { name: 'Mur LED panoramique', kind: 'backdrop' as const, x: 0, y: 17.7, width: 18, depth: 0.1, height: 6, color: '#101827', params: { style: 'panel' } },
    lineArray('Line array jardin', -10.8, 1, 8, 12, 1.5),
    lineArray('Line array cour', 10.8, 1, 8, 12, 1.5),
    sub('Sub jardin', -9.5, 0.2, 0, '2x18'),
    sub('Sub cour', 9.5, 0.2, 0, '2x18'),
    desk('Régie lumière FOH', 'light', 0, -11),
    desk('Régie son FOH', 'audio', -2, -11),
    fog('Hazer jardin', -7, 16, 'haze'),
    fog('Hazer cour', 7, 16, 'haze'),
    ...barriers(8, -9, 9, -1.5),
    ...row(8, -8.5, 8.5, (x, i) => chair(`Public avant ${i + 1}`, x, -2.8, 0, '#30343B')),
    ...row(8, -8.5, 8.5, (x, i) => chair(`Public arrière ${i + 1}`, x, -6.2, 0, '#30343B')),
    ...row(4, -7.5, 7.5, (x, i) => chair(`Rang latéral ${i + 1}`, x, -9, 0, '#30343B')),
  ];
  const looks: DemoSpec['looks'] = [
    { name: 'Accueil', parts: [{ rigs: ['AUD_FRONT', 'AUD_REAR'], colors: [a], level: 0.25 }, { rigs: ['WASH'], colors: [C.warm], level: 0.2 }, { rigs: ['PAR'], colors: [b], level: 0.25 }] },
    { name: 'Ouverture', parts: [{ rigs: ['SPOT'], colors: [C.white], level: 0.8, tilt: 0.55 }, { rigs: ['AUD_FRONT', 'AUD_REAR'], colors: [a, b], level: 0.45 }, { rigs: ['BAR'], colors: [a], level: 0.5 }] },
    { name: p.stageLook, parts: [{ rigs: ['WASH'], colors: [a, b], level: 0.75 }, { rigs: ['PAR'], colors: [b, c], level: 0.8 }, { rigs: ['SPOT'], colors: [C.white, c], level: 0.8, tilt: 0.68 }, { rigs: ['AUD_FRONT', 'AUD_REAR'], colors: [a, b], level: 0.55 }, { rigs: ['BAR'], colors: [c], level: 0.7 }] },
    { name: 'Montée', parts: [{ rigs: ['WASH', 'SPOT'], colors: [c], level: 0.9, tilt: 0.72 }, { rigs: ['AUD_FRONT', 'AUD_REAR'], colors: [b], level: 0.65 }, { rigs: ['BLIND'], colors: [C.white], level: 0.5 }] },
    { name: p.finale, parts: [{ rigs: ['SPOT', 'WASH'], colors: [C.white, c], level: 1, tilt: 0.7 }, { rigs: ['PAR', 'BAR'], colors: [a, C.white, c], level: 1 }, { rigs: ['BLIND'], colors: [C.white], level: 1 }, { rigs: ['AUD_FRONT', 'AUD_REAR'], colors: [a, b, c], level: 0.9 }] },
    { name: 'Sortie public', parts: [{ rigs: ['AUD_FRONT', 'AUD_REAR'], colors: [C.warm], level: 0.65 }, { rigs: ['WASH'], colors: [C.warm], level: 0.3 }] },
  ];
  const effects: DemoSpec['effects'] = [
    { name: 'Chase pixel', type: 'chase', rigs: ['BAR', 'PAR'], params: { bpmSync: true, beatsPerCycle: 2, phaseSpread: 1, barSync: true }, blend: 'scale' },
    { name: 'Ballet de lyres', type: 'panTilt', rigs: ['SPOT', 'WASH'], params: { bpmSync: true, beatsPerCycle: 8, amplitude: 0.45, phaseSpread: 0.6, shape: 'figure8', barSync: true } },
    { name: 'Respiration public', type: 'pulse', rigs: ['AUD_FRONT', 'AUD_REAR'], params: { bpmSync: true, beatsPerCycle: 4, offset: 0.55, amplitude: 0.35, phaseSpread: 0.5 }, blend: 'scale' },
    { name: 'Strobe final', type: 'strobe', rigs: ['STR'], params: { speed: 4 } },
  ];
  const cueLists: DemoSpec['cueLists'] = [{
    name: 'Conduite principale',
    cues: [
      { name: 'Accueil invités', look: 'Accueil', fade: 8, effects: ['Respiration public'] },
      { name: 'Ouverture show', look: 'Ouverture', fade: 4, effects: ['Ballet de lyres'] },
      { name: p.stageLook, look: p.stageLook, fade: 2, effects: ['Chase pixel', 'Ballet de lyres'] },
      { name: 'Montée en puissance', look: 'Montée', fade: 6, effects: ['Ballet de lyres'] },
      { name: p.finale, look: p.finale, fade: 0.5, effects: ['Chase pixel', 'Ballet de lyres', 'Strobe final'] },
      { name: 'Sortie public', look: 'Sortie public', fade: 10 },
    ],
  }];
  return {
    id: p.id, name: p.name, venue: p.venue, show: p.show, category: p.category,
    description: p.description,
    highlights: ['Structures aluminium multi-ponts et projecteurs suspendus', 'Moteurs de levage, chaînes, accroches et clamps visibles', 'Gradins 8 rangées avec spectateurs 3D assis et debout', 'Deux lignes de wash croisées au-dessus des gradins, 2 univers DMX et 6 cues'],
    bpm: p.bpm, stage: [22, 19], rigs, decor,
    screens: [screen('Mur LED principal', 0, 17.6, 18, 6, 1.2, '#111827')],
    looks, effects, cueLists,
    timeline: { name: 'Ouverture grand format', duration: 72, events: [
      { at: 0, dur: 24, look: 'Accueil', fade: 8 },
      { at: 0, dur: 24, effect: 'Respiration public' },
      { at: 24, dur: 24, look: 'Ouverture', fade: 5 },
      { at: 24, dur: 24, effect: 'Ballet de lyres' },
      { at: 48, dur: 24, look: p.finale, fade: 1 },
      { at: 48, dur: 24, effect: 'Chase pixel' },
      { at: 60, dur: 8, effect: 'Strobe final' },
    ] },
    notes: 'Installation fictive de démonstration. Les deux structures AUD_FRONT et AUD_REAR portent des wash suspendus au-dessus des rangées de public. Vérifier les accroches, charges admissibles, dégagements et angles de faisceau avant toute transposition en salle réelle. Sorties physiques désarmées par défaut.',
  };
}

export const MEGA_DEMOS: DemoSpec[] = PRESETS.map(makeMegaDemo);
