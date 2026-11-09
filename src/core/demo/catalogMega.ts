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


const VISUAL_VARIANTS: Record<string, { stage: [number, number]; y: number[]; height: number[]; count: number[]; span: number[]; extra: DemoSpec['decor'] }> = {
 'arena-tour': { stage:[30,20], y:[3,16,19,8,-15,-22], height:[13,12,2,10,10,10], count:[12,12,16,10,6,6], span:[.94,.88,.9,.8,.9,.9], extra:[{name:'Portique touring monumental',kind:'arch',x:0,y:18,width:25,depth:.3,height:10,color:'#263449',params:{style:'square',thickness:.3,leds:true}},{name:'Podium latéral jardin',kind:'riser',x:-12,y:4,width:3,depth:3,height:1.2},{name:'Podium latéral cour',kind:'riser',x:12,y:4,width:3,depth:3,height:1.2}] },
 'festival-mainstage': { stage:[26,16], y:[3,-1,14,8,-11,-15], height:[11,12,9,11,8,8], count:[8,10,12,8,6,6], span:[.72,.95,.9,.85,.9,.9], extra:[{name:'Backwall festival',kind:'backdrop',x:0,y:15,width:22,depth:.1,height:7,color:'#172033'},{name:'Tour delay jardin',kind:'line-array',x:-12,y:-7,width:1.1,depth:.5,height:2.2,elevation:4,params:{modules:6,splay:3,bumper:true,flown:true}},{name:'Tour delay cour',kind:'line-array',x:12,y:-7,width:1.1,depth:.5,height:2.2,elevation:4,params:{modules:6,splay:3,bumper:true,flown:true}}] },
 'wedding-palace': { stage:[20,18], y:[0,8,16,8,-11,-15], height:[5,6,.4,6,8,8], count:[4,8,16,4,6,6], span:[.7,.75,.95,.45,.9,.9], extra:[{name:'Arche florale',kind:'arch',x:0,y:13,width:6,depth:.3,height:4,color:'#E8DCC8',params:{style:'round',thickness:.3,leds:true}},{name:'Table invités jardin',kind:'table',x:-6,y:9,width:2.2,depth:2.2,height:.75,color:'#F4EBDD'},{name:'Table invités cour',kind:'table',x:6,y:9,width:2.2,depth:2.2,height:.75,color:'#F4EBDD'}] },
 'club-megastructure': { stage:[18,14], y:[4,1,7,0,-11,-15], height:[8,5,8,3,8,8], count:[10,8,8,10,6,6], span:[.85,.9,.9,.9,.9,.9], extra:[{name:'Tunnel LED immersif',kind:'arch',x:0,y:5,width:14,depth:.3,height:6,color:'#4C1D95',params:{style:'square',thickness:.3,leds:true}},{name:'Hazer tunnel jardin',kind:'fog-machine',x:-6,y:5,width:.6,depth:.3,height:.25,params:{style:'haze'}},{name:'Hazer tunnel cour',kind:'fog-machine',x:6,y:5,width:.6,depth:.3,height:.25,params:{style:'haze'}}] },
 'sports-opening': { stage:[32,24], y:[2,11,20,4,-11,-15], height:[16,14,12,.3,8,8], count:[8,16,16,8,6,6], span:[.95,.95,.9,.85,.9,.9], extra:[{name:'Écran géant stade',kind:'backdrop',x:0,y:22,width:18,depth:.1,height:9,color:'#14213D'},{name:'Podium poursuite jardin',kind:'riser',x:-13,y:2,width:2.5,depth:2.5,height:1.5},{name:'Podium poursuite cour',kind:'riser',x:13,y:2,width:2.5,depth:2.5,height:1.5}] },
 'tv-awards': { stage:[22,14], y:[3,12,-1,8,-11,-15], height:[7,8,6,5,8,8], count:[6,8,10,8,6,6], span:[.85,.9,.9,.75,.9,.9], extra:[{name:'Arche caméra jardin',kind:'arch',x:-6,y:8,width:5,depth:.3,height:5,color:'#263A63',params:{style:'square',thickness:.3,leds:true}},{name:'Arche caméra cour',kind:'arch',x:6,y:8,width:5,depth:.3,height:5,color:'#263A63',params:{style:'square',thickness:.3,leds:true}},{name:'Cyclorama studio',kind:'backdrop',x:0,y:13,width:18,depth:.1,height:6,color:'#172554'}] },
 'symphonic-show': { stage:[24,18], y:[4,14,9,17,-11,-15], height:[9,10,8,.3,8,8], count:[8,12,10,2,6,6], span:[.8,.9,.85,.8,.9,.9], extra:[{name:'Piano à queue soliste',kind:'piano',x:-5,y:6,width:1.55,depth:2.1,height:1,color:'#0B0B0E',params:{style:'grand',open:true}},{name:'Pupitre orchestre jardin',kind:'music-stand',x:-7,y:9,width:.5,depth:.4,height:1.2},{name:'Pupitre orchestre centre',kind:'music-stand',x:0,y:9,width:.5,depth:.4,height:1.2},{name:'Pupitre orchestre cour',kind:'music-stand',x:7,y:9,width:.5,depth:.4,height:1.2}] },
 'electro-dome': { stage:[28,22], y:[5,16,19,10,-11,-15], height:[14,12,11,10,8,8], count:[12,12,6,12,6,6], span:[.9,.9,.9,.8,.9,.9], extra:[{name:'Portique radial simulé',kind:'arch',x:0,y:12,width:20,depth:.3,height:10,color:'#164E63',params:{style:'round',thickness:.3,leds:true}},{name:'Écran LED courbe',kind:'backdrop',x:0,y:18,width:22,depth:.1,height:7,color:'#082F49'}] },
 'fashion-gala': { stage:[18,26], y:[-1,8,23,17,-11,-15], height:[8,7,6,.3,8,8], count:[10,8,8,2,6,6], span:[.45,.9,.9,.8,.9,.9], extra:[{name:'Podium catwalk longitudinal',kind:'riser',x:0,y:7,width:3.5,depth:22,height:.8},{name:'Fond photo créateurs',kind:'backdrop',x:0,y:24,width:12,depth:.1,height:5,color:'#111111'},{name:'Premier rang couture jardin',kind:'chair',x:-5,y:-3,width:.45,depth:.5,height:.9,color:'#171717'},{name:'Premier rang couture cour',kind:'chair',x:5,y:-3,width:.45,depth:.5,height:.9,color:'#171717'}] },
 'wedding-festival': { stage:[24,20], y:[2,11,17,5,-11,-15], height:[8,7,5,3,8,8], count:[6,8,12,6,6,6], span:[.85,.8,.9,.7,.9,.9], extra:[{name:'Scène DJ extérieure',kind:'dj-booth',x:0,y:15,width:3.5,depth:.8,height:1.05,color:'#111318',params:{decks:true,led:true}},{name:'Portique guinguette',kind:'arch',x:0,y:12,width:14,depth:.3,height:6,color:'#7C2D12',params:{style:'round',thickness:.3,leds:true}},{name:'Table mange-debout jardin',kind:'table',x:-8,y:-5,width:1,depth:1,height:1.1,color:'#6B4226'},{name:'Table mange-debout cour',kind:'table',x:8,y:-5,width:1,depth:1,height:1.1,color:'#6B4226'}] },
};


function layoutWidth(id: string): number { return VISUAL_VARIANTS[id]!.stage[0] * (id === 'fashion-gala' ? 0.66 : 0.72); }
function layoutHeight(id: string): number { return id === 'wedding-palace' ? 3 : id === 'tv-awards' ? 6 : id === 'sports-opening' ? 9 : 5.5; }
function layoutDepth(id: string): number { return VISUAL_VARIANTS[id]!.stage[1] - (id === 'fashion-gala' ? 1 : 1.5); }

function makeMegaDemo(p: MegaPreset): DemoSpec {
  const [a, b, c] = p.colors;
  const variant = VISUAL_VARIANTS[p.id];
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
  const variedRigs = rigs.map((r, i) => ({ ...r, y: variant.y[i] ?? r.y, height: variant.height[i] ?? r.height, count: variant.count[i] ?? r.count, span: variant.span[i] ?? r.span, ...(p.id === 'fashion-gala' && r.prefix === 'SPOT' ? { alongDepth: true } : {}) }));
  const variedDecor = [...decor.filter((item) => !['Plateau principal 20 × 12 m', 'Mur LED panoramique'].includes(item.name)), ...variant.extra];
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
    bpm: p.bpm, stage: variant.stage, rigs: variedRigs, decor: variedDecor,
    screens: [screen(
      p.id === 'fashion-gala' ? 'Écran fond runway' : p.id === 'tv-awards' ? 'Écran plateau broadcast' : p.id === 'wedding-palace' ? 'Écran discret réception' : 'Mur vidéo principal',
      0, layoutDepth(p.id), layoutWidth(p.id), layoutHeight(p.id), 1.2, '#111827',
    )],
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
