import type { DemoSpec } from './catalog';
import { C } from './palette';

// ---------------------------------------------------------------------------
// Stadium concert — « Vortex Arena » (grande production, 2 univers, 72 appareils, 5 trusses)
// ---------------------------------------------------------------------------
export const stadiumConcert: DemoSpec = {
  id: 'stadium-concert',
  name: 'Vortex Arena — grande tournée',
  venue: 'Vortex Arena (aréna couverte, 18 000 places)',
  show: '« Signal » — tournée mondiale, date Paris (fictif)',
  category: 'Concert',
  description:
    "Grande production arena : cinq trusses (downstage, mid-1, mid-2, upstage, arche), lyres spot et wash, PAR au sol, barres LED upstage, blinders et strobes. Deux univers. Conduite d'un set de 12 cues et timeline d'ouverture de 90 s.",
  highlights: [
    '72 projecteurs sur 2 univers et 5 trusses',
    'Arche frontale avec lyres en arc-en-ciel',
    'Timeline « Ouverture » de 90 s avec montée progressive',
    'Blinders public, sidelight et wash full-stage pour le rappel',
    'Tous les effets synchronisés au BPM',
  ],
  bpm: 132,
  stage: [22, 16],

  rigs: [
    // ── Univers 1 ──────────────────────────────────────────────────────────
    // Lyres spot — truss downstage (hauteur 9 m)
    {
      prefix: 'SPOT_DS',
      label: 'Lyres spot downstage',
      profile: 'demo-spot',
      mode: '13ch étendu',
      count: 10,
      universe: 1,
      y: 2.5,
      height: 9,
      span: 0.92,
      color: '#8B5CF6',
    },
    // Lyres wash — truss mid-1 (hauteur 9 m)
    {
      prefix: 'WASH_M1',
      label: 'Wash mid-1',
      profile: 'demo-wash',
      mode: '13ch',
      count: 8,
      universe: 1,
      y: 6,
      height: 9,
      span: 0.9,
      color: '#F59E0B',
    },
    // PAR RGBW — sol upstage (sur sol, hauteur 0.4 m)
    {
      prefix: 'PAR_UP',
      label: 'PAR upstage',
      profile: 'demo-par-rgbw',
      mode: '6ch DRGBW+Strobe',
      count: 14,
      universe: 1,
      y: 15.5,
      height: 0.4,
      span: 0.95,
      color: '#22D3EE',
    },
    // Blinders public — truss downstage frontale (hauteur 9 m, span réduit)
    {
      prefix: 'BLIND',
      label: 'Blinders public',
      profile: 'demo-par-rgb',
      mode: '5ch DRGB+Strobe',
      count: 6,
      universe: 1,
      y: 0.4,
      height: 9,
      span: 0.7,
      color: '#FDE68A',
    },

    // ── Univers 2 ──────────────────────────────────────────────────────────
    // Lyres spot — truss upstage (hauteur 9 m)
    {
      prefix: 'SPOT_UP',
      label: 'Lyres spot upstage',
      profile: 'demo-spot',
      mode: '13ch étendu',
      count: 10,
      universe: 2,
      y: 14,
      height: 9,
      span: 0.92,
      color: '#A78BFA',
    },
    // Lyres wash — truss mid-2 (hauteur 9 m)
    {
      prefix: 'WASH_M2',
      label: 'Wash mid-2',
      profile: 'demo-wash',
      mode: '13ch',
      count: 8,
      universe: 2,
      y: 10,
      height: 9,
      span: 0.9,
      color: '#FB923C',
    },
    // Barres LED — truss upstage (sol, hauteur 0.3 m)
    {
      prefix: 'BAR',
      label: 'Barres LED upstage',
      profile: 'demo-led-bar-4',
      mode: '14ch pixels',
      count: 8,
      universe: 2,
      y: 15.8,
      height: 0.3,
      span: 0.95,
      color: '#F472B6',
    },
    // Strobes — truss mid-1 et mid-2 (flancs, span réduit)
    {
      prefix: 'STR',
      label: 'Strobes flancs',
      profile: 'demo-strobe',
      mode: '2ch',
      count: 8,
      universe: 2,
      y: 8,
      height: 9,
      span: 0.85,
      color: '#FACC15',
    },
  ],

  decor: [
    // Scène principale
    { name: 'Scène principale', kind: 'riser', x: 0, y: 10, width: 20, depth: 12, height: 1.2 },
    // Plateau batterie surélevé
    { name: 'Praticable batterie', kind: 'riser', x: 0, y: 13.5, width: 4, depth: 3, height: 1.8 },
    // Praticable claviers jardin
    { name: 'Praticable claviers jardin', kind: 'riser', x: -7, y: 12, width: 3, depth: 2, height: 0.8 },
    // Praticable guitares cour
    { name: 'Praticable guitares cour', kind: 'riser', x: 7, y: 12, width: 3, depth: 2, height: 0.8 },
    // Micro chant centre
    { name: 'Micro chant', kind: 'mic', x: 0, y: 3, width: 0.3, depth: 0.3, height: 1.6 },
    // Micro guitare jardin
    { name: 'Micro guitare jardin', kind: 'mic', x: -5.5, y: 4, width: 0.3, depth: 0.3, height: 1.6 },
    // Micro guitare cour
    { name: 'Micro guitare cour', kind: 'mic', x: 5.5, y: 4, width: 0.3, depth: 0.3, height: 1.6 },
    // Micro basse cour
    { name: 'Micro basse cour', kind: 'mic', x: 8, y: 10, width: 0.3, depth: 0.3, height: 1.6 },
    // Retour chant
    { name: 'Retour chant', kind: 'monitor', x: 0, y: 1.8, width: 0.7, depth: 0.5, height: 0.4, rotation: 180 },
    // Retour guitare jardin
    { name: 'Retour guitare jardin', kind: 'monitor', x: -4, y: 4, width: 0.6, depth: 0.45, height: 0.35, rotation: 200 },
    // Retour guitare cour
    { name: 'Retour guitare cour', kind: 'monitor', x: 4, y: 4, width: 0.6, depth: 0.45, height: 0.35, rotation: 160 },
    // Sub-basses jardin
    { name: 'Sub-basses jardin', kind: 'speaker', x: -9.5, y: 0.6, width: 1.2, depth: 1.2, height: 1.4, color: '#111111' },
    // Sub-basses cour
    { name: 'Sub-basses cour', kind: 'speaker', x: 9.5, y: 0.6, width: 1.2, depth: 1.2, height: 1.4, color: '#111111' },
    // Delay tower jardin
    { name: 'Delay tower jardin', kind: 'speaker', x: -10, y: 5, width: 0.8, depth: 0.8, height: 2.4, color: '#1A1A1A' },
    // Delay tower cour
    { name: 'Delay tower cour', kind: 'speaker', x: 10, y: 5, width: 0.8, depth: 0.8, height: 2.4, color: '#1A1A1A' },
    // Mur d'amplis guitare jardin
    { name: "Mur d'amplis jardin", kind: 'box', x: -9, y: 14, width: 2.5, depth: 1, height: 2.4, color: '#0A0A0A' },
    // Mur d'amplis guitare cour
    { name: "Mur d'amplis cour", kind: 'box', x: 9, y: 14, width: 2.5, depth: 1, height: 2.4, color: '#0A0A0A' },
    // Grand écran LED arrière
    { name: 'Écran LED upstage', kind: 'box', x: 0, y: 15.8, width: 18, depth: 0.2, height: 8, color: '#050505' },
    // Rideau de fond (wing)
    { name: 'Rideau jardin', kind: 'drape', x: -10.5, y: 8, width: 0.2, depth: 8, height: 9, color: '#1A1A1A', rotation: 90 },
    { name: 'Rideau cour', kind: 'drape', x: 10.5, y: 8, width: 0.2, depth: 8, height: 9, color: '#1A1A1A', rotation: 90 },
  ],

  looks: [
    // 1. Salle allumée / avant show
    {
      name: 'Salle',
      parts: [
        { rigs: ['WASH_M1'], colors: [C.warm], level: 0.25 },
        { rigs: ['WASH_M2'], colors: [C.warm], level: 0.2 },
      ],
    },
    // 2. Intro — faisceau unique, scène dans le noir
    {
      name: 'Intro',
      parts: [
        { rigs: ['SPOT_DS'], colors: [C.white], level: 0.7, tilt: 0.25 },
        { rigs: ['SPOT_UP'], colors: [C.blue], level: 0.5, tilt: 0.3 },
        { rigs: ['BAR'], colors: [C.navy], level: 0.3 },
      ],
    },
    // 3. Couplet — chaud, sobre
    {
      name: 'Couplet',
      parts: [
        { rigs: ['WASH_M1'], colors: [C.amber], level: 0.55 },
        { rigs: ['WASH_M2'], colors: [C.warm], level: 0.4 },
        { rigs: ['PAR_UP'], colors: [C.amber, C.orange], level: 0.45 },
        { rigs: ['SPOT_DS'], colors: [C.warm], level: 0.5, tilt: 0.65 },
        { rigs: ['BAR'], colors: [C.amber], level: 0.25 },
      ],
    },
    // 4. Pré-refrain — tension, couleurs froides
    {
      name: 'Pré-refrain',
      parts: [
        { rigs: ['WASH_M1'], colors: [C.blue], level: 0.6 },
        { rigs: ['WASH_M2'], colors: [C.violet], level: 0.5 },
        { rigs: ['SPOT_DS'], colors: [C.white], level: 0.7, tilt: 0.4 },
        { rigs: ['SPOT_UP'], colors: [C.cyan], level: 0.6, tilt: 0.4 },
        { rigs: ['PAR_UP'], colors: [C.blue, C.cyan], level: 0.6 },
      ],
    },
    // 5. Refrain — explosion de lumière, full stage
    {
      name: 'Refrain',
      parts: [
        { rigs: ['WASH_M1', 'WASH_M2'], colors: [C.white], level: 1 },
        { rigs: ['SPOT_DS'], colors: [C.white], level: 1, tilt: 0.72 },
        { rigs: ['SPOT_UP'], colors: [C.cyan, C.magenta], level: 1, tilt: 0.68 },
        { rigs: ['PAR_UP'], colors: [C.cyan, C.white, C.magenta], level: 1 },
        { rigs: ['BAR'], colors: [C.cyan, C.magenta], level: 0.9 },
      ],
    },
    // 6. Pont — atmosphère violette, spots très bas
    {
      name: 'Pont',
      parts: [
        { rigs: ['WASH_M1'], colors: [C.violet], level: 0.35 },
        { rigs: ['WASH_M2'], colors: [C.navy], level: 0.3 },
        { rigs: ['SPOT_DS'], colors: [C.violet], level: 0.55, tilt: 0.5, pan: 0.4 },
        { rigs: ['BAR'], colors: [C.violet], level: 0.5 },
        { rigs: ['PAR_UP'], colors: [C.navy], level: 0.2 },
      ],
    },
    // 7. Solo — une seule lyre centre, noir autour
    {
      name: 'Solo',
      parts: [
        { rigs: ['WASH_M1'], colors: [C.navy], level: 0.1 },
        { rigs: ['SPOT_DS'], colors: [C.white], level: 1, pan: 0.5, tilt: 0.8 },
        { rigs: ['BAR'], colors: [C.warm], level: 0.15 },
      ],
    },
    // 8. Grand final — tout à fond, or et blanc
    {
      name: 'Grand final',
      parts: [
        { rigs: ['WASH_M1', 'WASH_M2'], colors: [C.gold, C.white], level: 1 },
        { rigs: ['SPOT_DS', 'SPOT_UP'], colors: [C.gold, C.white], level: 1, tilt: 0.65 },
        { rigs: ['PAR_UP'], colors: [C.gold, C.white, C.orange], level: 1 },
        { rigs: ['BAR'], colors: [C.gold], level: 1 },
        { rigs: ['BLIND'], colors: [C.white], level: 1 },
      ],
    },
    // 9. Salut / rappel — chaud, artistique
    {
      name: 'Salut',
      parts: [
        { rigs: ['WASH_M1'], colors: [C.warm], level: 0.85 },
        { rigs: ['WASH_M2'], colors: [C.amber], level: 0.7 },
        { rigs: ['SPOT_DS'], colors: [C.warm], level: 0.7, tilt: 0.6 },
        { rigs: ['PAR_UP'], colors: [C.amber, C.warm], level: 0.6 },
        { rigs: ['BAR'], colors: [C.gold], level: 0.5 },
      ],
    },
  ],

  effects: [
    // Chase PAR upstage synchro BPM, toutes les 2 temps
    {
      name: 'Chase upstage',
      type: 'chase',
      rigs: ['PAR_UP'],
      params: { bpmSync: true, beatsPerCycle: 2, phaseSpread: 1, barSync: true },
      blend: 'scale',
    },
    // Arc-en-ciel barres upstage, 8 temps par cycle
    {
      name: 'Arc-en-ciel barres',
      type: 'rainbow',
      rigs: ['BAR'],
      params: { bpmSync: true, beatsPerCycle: 8, phaseSpread: 1 },
    },
    // Balayage spots downstage en figure-8
    {
      name: 'Balayage DS',
      type: 'panTilt',
      rigs: ['SPOT_DS'],
      params: { bpmSync: true, beatsPerCycle: 16, amplitude: 0.55, phaseSpread: 0.5, shape: 'figure8', barSync: true },
    },
    // Balayage spots upstage en pan
    {
      name: 'Balayage UP',
      type: 'panTilt',
      rigs: ['SPOT_UP'],
      params: { bpmSync: true, beatsPerCycle: 8, amplitude: 0.5, phaseSpread: 0.6, shape: 'pan', barSync: true },
    },
    // Strobe flancs pour les drop
    {
      name: 'Strobe flancs',
      type: 'strobe',
      rigs: ['STR'],
      params: { speed: 4 },
    },
    // Pulse wash full-stage
    {
      name: 'Pulse wash',
      type: 'pulse',
      rigs: ['WASH_M1', 'WASH_M2'],
      params: { bpmSync: true, beatsPerCycle: 1, offset: 0.7, amplitude: 0.55 },
      blend: 'scale',
    },
  ],

  cueLists: [
    {
      name: 'Set « Signal »',
      cues: [
        { name: '1 — Salle allumée', look: 'Salle', fade: 5 },
        { name: '2 — Extinction salle', look: null, fade: 8, description: 'Noir complet, public en attente' },
        { name: '3 — Intro', look: 'Intro', fade: 3, effects: ['Balayage DS'] },
        { name: '4 — Couplet 1', look: 'Couplet', fade: 2, effects: ['Arc-en-ciel barres'] },
        { name: '5 — Pré-refrain', look: 'Pré-refrain', fade: 1 },
        { name: '6 — Refrain 1', look: 'Refrain', fade: 0, effects: ['Chase upstage', 'Balayage DS', 'Balayage UP'] },
        { name: '7 — Couplet 2', look: 'Couplet', fade: 1, effects: ['Arc-en-ciel barres'] },
        { name: '8 — Pont', look: 'Pont', fade: 3, effects: ['Balayage UP'] },
        { name: '9 — Solo', look: 'Solo', fade: 2 },
        { name: '10 — Refrain final', look: 'Refrain', fade: 0, effects: ['Chase upstage', 'Balayage DS', 'Balayage UP', 'Strobe flancs', 'Pulse wash'] },
        { name: '11 — Grand final', look: 'Grand final', fade: 0.5, effects: ['Chase upstage', 'Balayage DS', 'Strobe flancs'], follow: 12, description: 'Enchaîne automatiquement sur le salut après 12 s' },
        { name: '12 — Salut / rappel', look: 'Salut', fade: 3 },
      ],
    },
  ],

  timeline: {
    name: 'Ouverture',
    duration: 90,
    events: [
      // Phase 1 : intro progressive (0–30 s)
      { at: 0, dur: 30, look: 'Intro', fade: 6 },
      { at: 0, dur: 30, effect: 'Balayage DS' },
      // Phase 2 : montée (30–55 s)
      { at: 30, dur: 25, look: 'Pré-refrain', fade: 4 },
      { at: 30, dur: 25, effect: 'Balayage UP' },
      // Phase 3 : explosion premier refrain (55–90 s)
      { at: 55, dur: 35, look: 'Refrain', fade: 0 },
      { at: 55, dur: 35, effect: 'Chase upstage' },
      { at: 55, dur: 35, effect: 'Balayage DS' },
      { at: 55, dur: 35, effect: 'Arc-en-ciel barres' },
      { at: 75, dur: 15, effect: 'Strobe flancs' },
    ],
  },

  notes:
    'Démo : 2 univers (72 projecteurs au total). Ouvrez la vue 3D pour voir les 5 trusses. Le strobe reste soumis au limiteur de sécurité. Tempo audio conseillé : 125–140 (électro / pop-rock). La timeline « Ouverture » illustre la montée progressive avant le premier refrain.',
};