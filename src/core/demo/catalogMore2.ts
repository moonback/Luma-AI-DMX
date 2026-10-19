import type { DemoSpec } from './catalog';
import { C } from './palette';

/** Last five demos of the second batch (see `catalogMore.ts`). */

const karaoke: DemoSpec = {
  id: 'karaoke', name: 'Le Micro d’Or — bar karaoké', venue: 'Le Micro d’Or (bar, 150 places)', show: 'Soirée karaoké du jeudi (fictif)', category: 'Club',
  description: 'Bar karaoké : petit kit de PAR 3 canaux, deux lyres, barres LED et un strobe, liste en boucle par style de chanson.',
  highlights: ['Kit compact sur un seul univers', 'Un look par style : ballade, disco, duo', 'Liste en boucle pour toute la soirée'],
  bpm: 120, stage: [6, 4],
  rigs: [
    { prefix: 'PAR', label: 'PAR', profile: 'demo-par-rgb', mode: '3ch RGB', count: 6, y: 1.5, height: 3, color: '#F472B6' },
    { prefix: 'LYRE', label: 'Lyres', profile: 'demo-spot', mode: '13ch étendu', count: 2, y: 2.5, height: 3.2, span: 0.6, color: '#8B5CF6' },
    { prefix: 'BAR', label: 'Barres fond', profile: 'demo-led-bar-4', mode: '14ch pixels', count: 2, y: 3.8, height: 0.2, span: 0.6, color: '#22D3EE' },
    { prefix: 'STR', label: 'Strobe', profile: 'demo-strobe', mode: '2ch', count: 1, y: 2, height: 3, color: '#FACC15' },
  ],
  decor: [
    { name: 'Petite scène', kind: 'riser', x: 0, y: 2.5, width: 4, depth: 2.5, height: 0.3 },
    { name: 'Écran des paroles', kind: 'box', x: 0, y: 0.3, width: 1.2, depth: 0.1, height: 0.8, elevation: 1, color: '#0F172A' },
    { name: 'Micro 1', kind: 'mic', x: -0.6, y: 2, width: 0.3, depth: 0.3, height: 1.6, elevation: 0.3 },
    { name: 'Micro 2', kind: 'mic', x: 0.6, y: 2, width: 0.3, depth: 0.3, height: 1.6, elevation: 0.3 },
    { name: 'Comptoir', kind: 'table', x: -2.5, y: 0.5, width: 1, depth: 0.6, height: 1.1, color: '#78350F' },
    { name: 'Enceinte jardin', kind: 'speaker', x: -2.7, y: 3.5, width: 0.5, depth: 0.5, height: 0.9 },
    { name: 'Enceinte cour', kind: 'speaker', x: 2.7, y: 3.5, width: 0.5, depth: 0.5, height: 0.9 },
  ],
  looks: [
    { name: 'Ambiance bar', parts: [{ rigs: ['PAR'], colors: [C.amber, C.pink], level: 0.5 }, { rigs: ['BAR'], colors: [C.violet], level: 0.4 }] },
    { name: 'Ballade', parts: [{ rigs: ['PAR'], colors: [C.blue, C.violet], level: 0.4 }, { rigs: ['LYRE'], colors: [C.warm], level: 0.9, tilt: 0.7 }] },
    { name: 'Tube disco', parts: [{ rigs: ['PAR'], colors: [C.magenta, C.cyan, C.gold], level: 0.9 }, { rigs: ['LYRE'], colors: [C.white], level: 0.9, tilt: 0.5 }, { rigs: ['BAR'], colors: [C.magenta, C.cyan], level: 0.8 }] },
    { name: 'Duo', parts: [{ rigs: ['PAR'], colors: [C.pink], level: 0.5 }, { rigs: ['LYRE'], colors: [C.warm], level: 1, tilt: 0.72 }] },
    { name: 'Applaudissements', parts: [{ rigs: ['PAR', 'BAR'], colors: [C.gold, C.white], level: 1 }] },
    { name: 'Fermeture', parts: [{ rigs: ['PAR'], colors: [C.warm], level: 0.8 }] },
  ],
  effects: [
    { name: 'Arc-en-ciel disco', type: 'rainbow', rigs: ['PAR'], params: { bpmSync: true, beatsPerCycle: 4, phaseSpread: 1 } },
    { name: 'Lyres disco', type: 'randomMove', rigs: ['LYRE'], params: { bpmSync: true, beatsPerCycle: 4, amplitude: 0.5 } },
    { name: 'Chase barres', type: 'chase', rigs: ['BAR'], params: { bpmSync: true, beatsPerCycle: 2, phaseSpread: 1 }, blend: 'scale' },
    { name: 'Flash bravo', type: 'strobe', rigs: ['STR'], params: { speed: 4 } },
  ],
  cueLists: [{ name: 'Soirée karaoké', loop: true, cues: [
    { name: 'Ambiance bar', look: 'Ambiance bar', fade: 4 },
    { name: 'Ballade', look: 'Ballade', fade: 3 },
    { name: 'Tube disco', look: 'Tube disco', fade: 1, effects: ['Arc-en-ciel disco', 'Lyres disco', 'Chase barres'] },
    { name: 'Duo', look: 'Duo', fade: 2 },
    { name: 'Bravo !', look: 'Applaudissements', fade: 0, follow: 4, effects: ['Flash bravo'], description: 'Retour seul à l’ambiance bar après 4 s' },
  ] }],
  notes: 'Démo : liste en boucle — après les applaudissements, GO revient à l’ambiance bar. Look « Fermeture » pour l’heure de fermeture.',
};

const christmas: DemoSpec = {
  id: 'illuminations-noel', name: 'Valbourg — illuminations de Noël', venue: 'Place du Marché de Valbourg (extérieur)', show: 'Lancement des illuminations (fictif)', category: 'Événementiel',
  description: 'Mise en lumière urbaine : façade de la mairie en uplight, sapin géant, arche de barres LED et compte à rebours.',
  highlights: ['Plateau de 20 × 16 m (la place entière)', 'Timeline « Compte à rebours » de 30 s', 'Neige simulée par des lyres en mouvement lent'],
  bpm: 100, stage: [20, 16],
  rigs: [
    { prefix: 'FACADE', label: 'Façade mairie', profile: 'demo-par-rgbw', mode: '6ch DRGBW+Strobe', count: 12, y: 15.5, height: 0.5, color: '#FBBF24' },
    { prefix: 'SAPIN', label: 'Lyres sapin', profile: 'demo-spot', mode: '13ch étendu', count: 4, y: 8, height: 6, span: 0.4, color: '#22C55E' },
    { prefix: 'ARCHE', label: 'Arche d’entrée', profile: 'demo-led-bar-4', mode: '14ch pixels', count: 6, y: 1, height: 4, span: 0.4, color: '#F472B6' },
    { prefix: 'WASH', label: 'Wash scène', profile: 'demo-wash', mode: '13ch', count: 4, y: 3, height: 5, span: 0.4, color: '#60A5FA' },
  ],
  decor: [
    { name: 'Sapin géant', kind: 'column', x: 0, y: 9, width: 3, depth: 3, height: 10, color: '#14532D' },
    { name: 'Chalet 1', kind: 'box', x: -7, y: 5, width: 3, depth: 2, height: 2.5, color: '#78350F' },
    { name: 'Chalet 2', kind: 'box', x: -7, y: 10, width: 3, depth: 2, height: 2.5, color: '#78350F' },
    { name: 'Chalet 3', kind: 'box', x: 7, y: 5, width: 3, depth: 2, height: 2.5, color: '#78350F' },
    { name: 'Chalet 4', kind: 'box', x: 7, y: 10, width: 3, depth: 2, height: 2.5, color: '#78350F' },
    { name: 'Scène du maire', kind: 'riser', x: 0, y: 3, width: 4, depth: 2, height: 0.6 },
    { name: 'Façade de la mairie', kind: 'drape', x: 0, y: 15.9, width: 20, depth: 0.1, height: 12, color: '#D6D3D1' },
  ],
  looks: [
    { name: 'Jour de marché', parts: [{ rigs: ['WASH'], colors: [C.warm], level: 0.5, tilt: 0.6 }, { rigs: ['ARCHE'], colors: [C.warm], level: 0.3 }] },
    { name: 'Tombée de la nuit', parts: [{ rigs: ['FACADE'], colors: [C.blue], level: 0.4 }, { rigs: ['ARCHE'], colors: [C.navy], level: 0.3 }] },
    { name: 'Illumination', parts: [{ rigs: ['FACADE'], colors: [C.gold, C.red], level: 0.9 }, { rigs: ['SAPIN'], colors: [C.gold], level: 1, tilt: 0.4 }, { rigs: ['ARCHE'], colors: [C.gold, C.red], level: 0.9 }] },
    { name: 'Neige', parts: [{ rigs: ['FACADE'], colors: [C.cyan, C.white], level: 0.7 }, { rigs: ['SAPIN'], colors: [C.white], level: 0.8, tilt: 0.4 }, { rigs: ['ARCHE'], colors: [C.white], level: 0.6 }] },
    { name: 'Discours', parts: [{ rigs: ['WASH'], colors: [C.white], level: 0.9, tilt: 0.65 }, { rigs: ['FACADE'], colors: [C.blue], level: 0.3 }] },
    { name: 'Fin de soirée', parts: [{ rigs: ['FACADE'], colors: [C.amber], level: 0.5 }, { rigs: ['SAPIN'], colors: [C.green], level: 0.4, tilt: 0.4 }] },
  ],
  effects: [
    { name: 'Cycle façade', type: 'colorCycle', rigs: ['FACADE'], params: { speed: 0.03, colors: [C.gold, C.red, C.green], phaseSpread: 0.5 } },
    { name: 'Flocons', type: 'randomMove', rigs: ['SAPIN'], params: { speed: 0.05, amplitude: 0.3 } },
    { name: 'Vague arche', type: 'dimmerWave', rigs: ['ARCHE'], params: { bpmSync: true, beatsPerCycle: 8, phaseSpread: 1, offset: 0.6, amplitude: 0.8 }, blend: 'scale' },
    { name: 'Scintillement', type: 'pulse', rigs: ['FACADE'], params: { speed: 2, offset: 0.7, amplitude: 0.3, phaseSpread: 1 }, blend: 'scale' },
  ],
  cueLists: [{ name: 'Inauguration', cues: [
    { name: 'Marché de jour', look: 'Jour de marché', fade: 5 },
    { name: 'Tombée de la nuit', look: 'Tombée de la nuit', fade: 20 },
    { name: 'Discours du maire', look: 'Discours', fade: 3 },
    { name: 'Allumage !', look: 'Illumination', fade: 2, effects: ['Vague arche', 'Scintillement'] },
    { name: 'Neige', look: 'Neige', fade: 6, effects: ['Flocons'] },
    { name: 'Ambiance marché', look: 'Illumination', fade: 6, effects: ['Cycle façade', 'Vague arche'] },
    { name: 'Fin de soirée', look: 'Fin de soirée', fade: 10 },
  ] }],
  timeline: { name: 'Compte à rebours', duration: 30, events: [
    { at: 0, dur: 10, look: 'Discours', fade: 2 },
    { at: 10, dur: 10, look: 'Tombée de la nuit', fade: 8 },
    { at: 20, dur: 10, look: 'Illumination', fade: 0.5 }, { at: 20, dur: 10, effect: 'Scintillement' }, { at: 20, dur: 10, effect: 'Vague arche' },
  ] },
  notes: 'Démo : installation extérieure — vérifier l’indice IP des projecteurs et la distance de la façade.',
};

const esport: DemoSpec = {
  id: 'finale-esport', name: 'Arena Nexus — finale e-sport', venue: 'Arena Nexus (3 000 places)', show: 'Nexus Cup — grande finale (fictif)', category: 'Corporate',
  description: 'Tournoi e-sport : couleurs des deux équipes, barres LED sur les postes de jeu, lumière stable pendant les manches.',
  highlights: ['Entrées d’équipes bleue et rouge', 'Lumière fixe pendant le jeu (aucun flash)', 'Timeline « Entrée des équipes » de 50 s'],
  bpm: 130, stage: [16, 8],
  rigs: [
    { prefix: 'FACE', label: 'Face caméra', profile: 'demo-par-rgbw', mode: '6ch DRGBW+Strobe', count: 8, y: -3, height: 7, color: '#F8FAFC' },
    { prefix: 'SPOT', label: 'Lyres', profile: 'demo-spot', mode: '13ch étendu', count: 8, y: 7, height: 8, color: '#8B5CF6' },
    { prefix: 'WASH', label: 'Wash', profile: 'demo-wash', mode: '13ch', count: 6, y: 3, height: 8, color: '#38BDF8' },
    { prefix: 'BAR', label: 'Postes de jeu', profile: 'demo-led-bar-4', mode: '14ch pixels', count: 10, y: 3, height: 0.8, span: 0.8, color: '#3B82F6' },
    { prefix: 'STR', label: 'Strobes', profile: 'demo-strobe', mode: '2ch', count: 4, y: 7.5, height: 8, span: 0.8, color: '#FACC15' },
  ],
  decor: [
    { name: 'Bureau équipe bleue', kind: 'table', x: -4.5, y: 3, width: 5, depth: 1, height: 0.8, color: '#1E3A8A' },
    { name: 'Bureau équipe rouge', kind: 'table', x: 4.5, y: 3, width: 5, depth: 1, height: 0.8, color: '#7F1D1D' },
    { name: 'Estrade commentateurs', kind: 'riser', x: 0, y: 6, width: 3, depth: 1.5, height: 0.5 },
    { name: 'Écran géant', kind: 'drape', x: 0, y: 7.9, width: 14, depth: 0.1, height: 6, color: '#020617' },
    { name: 'Enceinte jardin', kind: 'speaker', x: -7.5, y: 0.5, width: 0.8, depth: 0.8, height: 2 },
    { name: 'Enceinte cour', kind: 'speaker', x: 7.5, y: 0.5, width: 0.8, depth: 0.8, height: 2 },
  ],
  looks: [
    { name: 'Avant-match', parts: [{ rigs: ['WASH'], colors: [C.violet, C.cyan], level: 0.5 }, { rigs: ['BAR'], colors: [C.violet], level: 0.4 }] },
    { name: 'Entrée équipe bleue', parts: [{ rigs: ['SPOT'], colors: [C.blue], level: 1, pan: 0.3, tilt: 0.7 }, { rigs: ['WASH', 'BAR'], colors: [C.blue], level: 0.8 }] },
    { name: 'Entrée équipe rouge', parts: [{ rigs: ['SPOT'], colors: [C.red], level: 1, pan: 0.7, tilt: 0.7 }, { rigs: ['WASH', 'BAR'], colors: [C.red], level: 0.8 }] },
    { name: 'Manche en cours', parts: [{ rigs: ['FACE'], colors: [C.white], level: 0.8 }, { rigs: ['BAR'], colors: [C.blue, C.red], level: 0.6 }, { rigs: ['WASH'], colors: [C.navy], level: 0.3 }] },
    { name: 'Moment décisif', parts: [{ rigs: ['FACE'], colors: [C.white], level: 0.6 }, { rigs: ['WASH'], colors: [C.violet], level: 0.6 }, { rigs: ['SPOT'], colors: [C.white], level: 0.7, tilt: 0.3 }] },
    { name: 'Victoire', parts: [{ rigs: ['WASH', 'BAR'], colors: [C.gold, C.white], level: 1 }, { rigs: ['SPOT'], colors: [C.gold], level: 1, tilt: 0.6 }, { rigs: ['FACE'], colors: [C.white], level: 0.9 }] },
  ],
  effects: [
    { name: 'Balayage entrée', type: 'panTilt', rigs: ['SPOT'], params: { bpmSync: true, beatsPerCycle: 8, amplitude: 0.4, phaseSpread: 0.5, shape: 'figure8', barSync: true } },
    { name: 'Chase postes', type: 'chase', rigs: ['BAR'], params: { bpmSync: true, beatsPerCycle: 2, phaseSpread: 1 }, blend: 'scale' },
    { name: 'Battement décisif', type: 'pulse', rigs: ['WASH'], params: { bpmSync: true, beatsPerCycle: 2, offset: 0.6, amplitude: 0.5 }, blend: 'scale' },
    { name: 'Strobe victoire', type: 'strobe', rigs: ['STR'], params: { speed: 6 } },
    { name: 'Arc-en-ciel victoire', type: 'rainbow', rigs: ['BAR'], params: { bpmSync: true, beatsPerCycle: 8, phaseSpread: 1 } },
  ],
  cueLists: [{ name: 'Finale', cues: [
    { name: 'Avant-match', look: 'Avant-match', fade: 4, effects: ['Chase postes'] },
    { name: 'Entrée équipe bleue', look: 'Entrée équipe bleue', fade: 1, effects: ['Balayage entrée'] },
    { name: 'Entrée équipe rouge', look: 'Entrée équipe rouge', fade: 1, effects: ['Balayage entrée'] },
    { name: 'Manche 1', look: 'Manche en cours', fade: 3 },
    { name: 'Moment décisif', look: 'Moment décisif', fade: 2, effects: ['Battement décisif'] },
    { name: 'Victoire', look: 'Victoire', fade: 0, follow: 8, effects: ['Strobe victoire', 'Arc-en-ciel victoire'], description: 'Strobe 8 s puis cérémonie' },
    { name: 'Cérémonie de remise', look: 'Victoire', fade: 2, effects: ['Arc-en-ciel victoire'] },
  ] }],
  timeline: { name: 'Entrée des équipes', duration: 50, events: [
    { at: 0, dur: 14, look: 'Avant-match', fade: 2 }, { at: 0, dur: 14, effect: 'Chase postes' },
    { at: 14, dur: 18, look: 'Entrée équipe bleue', fade: 1 }, { at: 14, dur: 18, effect: 'Balayage entrée' },
    { at: 32, dur: 18, look: 'Entrée équipe rouge', fade: 1 }, { at: 32, dur: 18, effect: 'Balayage entrée' },
  ] },
  notes: 'Démo : pas de strobe ni de changement brusque pendant les manches (joueurs et diffusion vidéo).',
};

const contemporary: DemoSpec = {
  id: 'danse-contemporaine', name: 'Compagnie Écume — « Marées »', venue: 'Scène nationale des Rives (600 places)', show: 'Marées — pièce chorégraphique (fictif)', category: 'Spectacle',
  description: 'Danse contemporaine : latéraux bas qui sculptent les corps, douches, contres et cyclorama, houle lente.',
  highlights: ['Latéraux au sol (pieds de projecteurs)', 'Houle de lumière lente et tempête', 'Timeline « Tempête » de 80 s'],
  bpm: 72, stage: [12, 10],
  rigs: [
    { prefix: 'DOUCHE', label: 'Douches', profile: 'demo-spot', mode: '13ch étendu', count: 6, y: 5, height: 8, span: 0.6, color: '#F8FAFC' },
    { prefix: 'LAT', label: 'Latéraux bas', profile: 'demo-par-rgbw', mode: '6ch DRGBW+Strobe', count: 8, y: 5, height: 1.5, span: 1, color: '#38BDF8' },
    { prefix: 'CONTRE', label: 'Contres', profile: 'demo-wash', mode: '13ch', count: 6, y: 9, height: 8, color: '#6366F1' },
    { prefix: 'CYCLO', label: 'Cyclorama', profile: 'demo-led-bar-4', mode: '4ch DRGB global', count: 6, y: 9.8, height: 0.2, color: '#14B8A6' },
  ],
  decor: [
    { name: 'Tapis de danse', kind: 'riser', x: 0, y: 5, width: 11, depth: 9, height: 0.05, color: '#1F2937' },
    { name: 'Rocher', kind: 'box', x: -3, y: 6.5, width: 1.4, depth: 1, height: 0.6, color: '#57534E' },
    { name: 'Pendrillon jardin', kind: 'drape', x: -5.6, y: 3, width: 1, depth: 0.1, height: 8 },
    { name: 'Pendrillon cour', kind: 'drape', x: 5.6, y: 3, width: 1, depth: 0.1, height: 8 },
  ],
  looks: [
    { name: 'Prologue', parts: [{ rigs: ['CYCLO'], colors: [C.navy], level: 0.3 }] },
    { name: 'Marée basse', parts: [{ rigs: ['LAT'], colors: ['#B0E0FF'], level: 0.6 }, { rigs: ['CYCLO'], colors: [C.teal], level: 0.4 }] },
    { name: 'Houle', parts: [{ rigs: ['LAT'], colors: [C.teal, C.blue], level: 0.7 }, { rigs: ['CONTRE'], colors: [C.blue], level: 0.5, tilt: 0.6 }, { rigs: ['CYCLO'], colors: [C.blue, C.teal], level: 0.5 }] },
    { name: 'Tempête', parts: [{ rigs: ['CONTRE'], colors: [C.white], level: 0.9, tilt: 0.6 }, { rigs: ['DOUCHE'], colors: ['#B0C4FF'], level: 0.8, tilt: 0.5 }, { rigs: ['CYCLO'], colors: [C.navy], level: 0.6 }] },
    { name: 'Duo en douche', parts: [{ rigs: ['DOUCHE'], colors: [C.warm], level: 1, tilt: 0.5 }, { rigs: ['LAT'], colors: [C.navy], level: 0.15 }] },
    { name: 'Écume', parts: [{ rigs: ['LAT'], colors: [C.white], level: 0.8 }, { rigs: ['CYCLO'], colors: ['#E0F7FF'], level: 0.7 }] },
    { name: 'Épilogue', parts: [{ rigs: ['CYCLO'], colors: [C.orange, C.pink], level: 0.5 }, { rigs: ['LAT'], colors: [C.amber], level: 0.3 }] },
  ],
  effects: [
    { name: 'Houle latéraux', type: 'dimmerWave', rigs: ['LAT'], params: { speed: 0.08, phaseSpread: 1, offset: 0.55, amplitude: 0.5 }, blend: 'scale' },
    { name: 'Ressac cyclo', type: 'colorCycle', rigs: ['CYCLO'], params: { speed: 0.02, colors: [C.teal, C.blue, C.navy], phaseSpread: 0.5 } },
    { name: 'Douches tourmentées', type: 'randomMove', rigs: ['DOUCHE'], params: { speed: 0.3, amplitude: 0.35 } },
    { name: 'Éclairs d’orage', type: 'strobe', rigs: ['LAT'], params: { speed: 2 } },
  ],
  cueLists: [{ name: 'Conduite', cues: [
    { name: '1 — Entrée public', look: 'Prologue', fade: 3 },
    { name: '2 — Noir', look: null, fade: 5 },
    { name: '3 — Marée basse', look: 'Marée basse', fade: 12 },
    { name: '4 — Houle', look: 'Houle', fade: 10, effects: ['Houle latéraux', 'Ressac cyclo'] },
    { name: '5 — Tempête', look: 'Tempête', fade: 2, effects: ['Douches tourmentées'] },
    { name: '6 — Orage', look: 'Tempête', fade: 0, follow: 5, effects: ['Douches tourmentées', 'Éclairs d’orage'], description: 'Éclairs 5 s puis duo' },
    { name: '7 — Duo', look: 'Duo en douche', fade: 6 },
    { name: '8 — Écume', look: 'Écume', fade: 8, effects: ['Houle latéraux'] },
    { name: '9 — Épilogue', look: 'Épilogue', fade: 15 },
    { name: '10 — Noir final', look: null, fade: 6 },
  ] }],
  timeline: { name: 'Tempête', duration: 80, events: [
    { at: 0, dur: 30, look: 'Houle', fade: 8 }, { at: 0, dur: 30, effect: 'Houle latéraux' },
    { at: 30, dur: 35, look: 'Tempête', fade: 4 }, { at: 30, dur: 35, effect: 'Douches tourmentées' }, { at: 50, dur: 6, effect: 'Éclairs d’orage' },
    { at: 65, dur: 15, look: 'Écume', fade: 10 },
  ] },
  notes: 'Démo : les latéraux bas sont posés sur pieds (pas de structure) ; fondus très longs, à jouer au ralenti.',
};

const openAir: DemoSpec = {
  id: 'open-air-techno', name: 'Sunrise Open Air — techno au lever du soleil', venue: 'Prairie des Cimes (plein air, 5 000 personnes)', show: 'Sunrise Open Air — édition 2026 (fictif)', category: 'Festival',
  description: 'Open air techno de nuit jusqu’à l’aube : 2 univers, tunnel de barres LED, lyres en éventail et lever du soleil.',
  highlights: ['2 univers, 48 projecteurs', 'Timeline « Peak » de 96 s', 'Du coucher de soleil à l’aube en 7 cues'],
  bpm: 132, stage: [16, 10],
  rigs: [
    { prefix: 'SPOT', label: 'Lyres', profile: 'demo-spot', mode: '13ch étendu', count: 10, y: 9, height: 8, color: '#8B5CF6' },
    { prefix: 'WASH', label: 'Wash', profile: 'demo-wash', mode: '13ch', count: 8, y: 3, height: 7, color: '#F59E0B' },
    { prefix: 'PAR', label: 'PAR sol', profile: 'demo-par-rgbw', mode: '6ch DRGBW+Strobe', count: 12, y: 0.5, height: 0.3, color: '#22D3EE' },
    { prefix: 'TUNNEL', label: 'Tunnel LED', profile: 'demo-led-bar-4', mode: '14ch pixels', count: 12, universe: 2, y: 0, height: 2.5, alongDepth: true, span: 0.45, color: '#F472B6' },
    { prefix: 'STR', label: 'Strobes', profile: 'demo-strobe', mode: '2ch', count: 6, universe: 2, y: 6, height: 8, span: 0.8, color: '#FACC15' },
  ],
  decor: [
    { name: 'Booth DJ', kind: 'riser', x: 0, y: 6, width: 4, depth: 2.5, height: 1.2 },
    { name: 'Platines', kind: 'table', x: 0, y: 6, width: 2.6, depth: 0.8, height: 1, elevation: 1.2 },
    { name: 'Stack jardin', kind: 'speaker', x: -7.4, y: 1, width: 1.2, depth: 1.2, height: 3 },
    { name: 'Stack cour', kind: 'speaker', x: 7.4, y: 1, width: 1.2, depth: 1.2, height: 3 },
    { name: 'Toile tendue', kind: 'drape', x: 0, y: 9.9, width: 16, depth: 0.1, height: 7, color: '#111827' },
  ],
  looks: [
    { name: 'Coucher de soleil', parts: [{ rigs: ['WASH'], colors: [C.orange, C.pink], level: 0.6 }, { rigs: ['PAR'], colors: [C.amber], level: 0.4 }] },
    { name: 'Nuit profonde', parts: [{ rigs: ['PAR'], colors: [C.blue, C.violet], level: 0.5 }, { rigs: ['TUNNEL'], colors: [C.violet], level: 0.3 }, { rigs: ['SPOT'], colors: [C.blue], level: 0.5, tilt: 0.3 }] },
    { name: 'Tunnel', parts: [{ rigs: ['TUNNEL'], colors: [C.cyan, C.magenta], level: 0.9 }, { rigs: ['SPOT'], colors: [C.white], level: 0.7, tilt: 0.6 }, { rigs: ['PAR'], colors: [C.navy], level: 0.3 }] },
    { name: 'Peak', parts: [{ rigs: ['WASH', 'PAR', 'TUNNEL'], colors: [C.white, C.cyan], level: 1 }, { rigs: ['SPOT'], colors: [C.white], level: 1, tilt: 0.65 }] },
    { name: 'Aube', parts: [{ rigs: ['WASH'], colors: [C.pink, C.violet], level: 0.5 }, { rigs: ['TUNNEL'], colors: [C.pink], level: 0.4 }] },
    { name: 'Lever du soleil', parts: [{ rigs: ['WASH'], colors: [C.gold, C.warm], level: 0.8 }, { rigs: ['PAR', 'TUNNEL'], colors: [C.gold, C.orange], level: 0.7 }] },
  ],
  effects: [
    { name: 'Chase tunnel', type: 'chase', rigs: ['TUNNEL'], params: { bpmSync: true, beatsPerCycle: 2, phaseSpread: 1, width: 2, barSync: true }, blend: 'scale' },
    { name: 'Éventail lyres', type: 'panTilt', rigs: ['SPOT'], params: { bpmSync: true, beatsPerCycle: 16, amplitude: 0.5, phaseSpread: 1, shape: 'pan', barSync: true } },
    { name: 'Arc-en-ciel sol', type: 'rainbow', rigs: ['PAR'], params: { bpmSync: true, beatsPerCycle: 16, phaseSpread: 1 } },
    { name: 'Vague aube', type: 'dimmerWave', rigs: ['WASH'], params: { speed: 0.05, phaseSpread: 1, offset: 0.6, amplitude: 0.5 }, blend: 'scale' },
    { name: 'Strobe peak', type: 'strobe', rigs: ['STR'], params: { speed: 8 } },
  ],
  cueLists: [{ name: 'Nuit blanche', cues: [
    { name: 'Coucher de soleil', look: 'Coucher de soleil', fade: 30 },
    { name: 'Nuit profonde', look: 'Nuit profonde', fade: 20, effects: ['Éventail lyres'] },
    { name: 'Tunnel', look: 'Tunnel', fade: 4, effects: ['Chase tunnel', 'Éventail lyres'] },
    { name: 'Peak time', look: 'Peak', fade: 0, effects: ['Chase tunnel', 'Éventail lyres', 'Arc-en-ciel sol', 'Strobe peak'] },
    { name: 'Redescente', look: 'Nuit profonde', fade: 8, effects: ['Arc-en-ciel sol'] },
    { name: 'Aube', look: 'Aube', fade: 30, effects: ['Vague aube'] },
    { name: 'Lever du soleil', look: 'Lever du soleil', fade: 60 },
  ] }],
  timeline: { name: 'Peak', duration: 96, events: [
    { at: 0, dur: 32, look: 'Nuit profonde', fade: 4 }, { at: 0, dur: 32, effect: 'Éventail lyres' },
    { at: 32, dur: 32, look: 'Tunnel', fade: 8 }, { at: 32, dur: 32, effect: 'Chase tunnel' },
    { at: 64, dur: 32, look: 'Peak' }, { at: 64, dur: 32, effect: 'Chase tunnel' }, { at: 64, dur: 32, effect: 'Arc-en-ciel sol' }, { at: 88, dur: 8, effect: 'Strobe peak' },
  ] },
  notes: 'Démo : univers 2 pour le tunnel et les strobes. Tempo audio conseillé : 125–140.',
};

// ---------------------------------------------------------------------------
// Stadium concert — « Vortex Arena » (grande production, 2 univers, 72 appareils, 5 trusses)
// ---------------------------------------------------------------------------
const stadiumConcert: DemoSpec = {
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

export const MORE_DEMOS_2: DemoSpec[] = [karaoke, christmas, esport, contemporary, openAir, stadiumConcert];
