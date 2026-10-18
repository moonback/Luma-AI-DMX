import type { Performer, Project, StageMarker, StageProp, StageScreen, Truss } from '../model/schemas';

type Vis = Project['visualizer'];
/** Everything a template replaces; saved camera views are kept. */
export type SceneLayout = Omit<Vis, 'views'>;

export type SceneTemplateId = 'concert' | 'theatre' | 'club' | 'conference' | 'arena' | 'catwalk' | 'festival' | 'acoustic' | 'tv' | 'gala';
export const SCENE_TEMPLATES: { id: SceneTemplateId; label: string; hint: string }[] = [
  { id: 'concert', label: 'Concert', hint: 'Groupe de 4, structures face et contre, écran de fond' },
  { id: 'theatre', label: 'Théâtre', hint: 'Trois perches, cyclorama, deux comédiens' },
  { id: 'club', label: 'Club / DJ', hint: 'Cercle au-dessus de la cabine, écran LED' },
  { id: 'conference', label: 'Conférence', hint: 'Pupitre, écran de projection, face' },
  { id: 'arena', label: 'Arène 360°', hint: 'Public autour, carré suspendu au centre' },
  { id: 'catwalk', label: 'Défilé', hint: 'Avancée de 10 m, structure le long du podium' },
  { id: 'festival', label: 'Festival', hint: 'Grande scène 16 m, trois herses, écrans latéraux, praticable batterie' },
  { id: 'acoustic', label: 'Acoustique', hint: 'Petit plateau, trio assis, rideau de fond' },
  { id: 'tv', label: 'Plateau TV', hint: 'Table d’animation, trois invités, mur LED, grill complet' },
  { id: 'gala', label: 'Gala / mariage', hint: 'Pupitre de discours, estrade musiciens, totems' },
];

/** Builds a ready-to-use stage layout. Ids come from `id` so the function stays pure and testable. */
export function sceneTemplate(tpl: SceneTemplateId, id: () => string): SceneLayout {
  const marker = (name: string, x: number, y: number, height = 1.7): StageMarker => ({ id: id(), name, x, y, height });
  const truss = (name: string, x: number, y: number, height: number, length: number, extra: Partial<Truss> = {}): Truss =>
    ({ id: id(), name, shape: 'line', x, y, height, length, rotation: 0, support: 'hung', ...extra });
  const on = (m: StageMarker, kind: Performer['kind'] = 'standing', name = m.name): Performer => ({ id: id(), name, kind, x: m.x, y: m.y, rotation: 0, markerId: m.id });
  const screen = (name: string, x: number, y: number, elevation: number, width: number, height: number, color: string): StageScreen =>
    ({ id: id(), name, x, y, elevation, width, height, rotation: 0, source: 'color', color, image: null, glow: 0.5 });
  const prop = (name: string, kind: StageProp['kind'], x: number, y: number, width: number, depth: number, height: number, rotation = 0): StageProp =>
    ({ id: id(), name, kind, x, y, width, depth, height, elevation: 0, rotation, color: '#15171c' });
  const base = { thrust: { width: 3, depth: 4 }, cyclo: true, markers: [], trusses: [], performers: [], screens: [], props: [] };

  switch (tpl) {
    case 'concert': {
      const m = [marker('Chant', 0, 2), marker('Guitare', -3.5, 3), marker('Basse', 3.5, 3), marker('Batterie', 0, 5.5, 1.3)];
      return {
        ...base, stageWidth: 12, stageDepth: 8, shape: 'rect', cyclo: false, markers: m,
        trusses: [truss('Face', 0, 0.5, 6.5, 12), truss('Contre', 0, 6.8, 7, 12, { support: 'towers' })],
        performers: [on(m[0]!), on(m[1]!), on(m[2]!), on(m[3]!, 'drums')],
        screens: [screen('Écran de fond', 0, 7.8, 2, 8, 4.5, '#1e3a8a')],
        props: [
          prop('Enceinte jardin', 'speaker', -5.5, 0.6, 0.6, 0.6, 1.2), prop('Enceinte cour', 'speaker', 5.5, 0.6, 0.6, 0.6, 1.2),
          prop('Retour chant', 'monitor', 0, 1.2, 0.6, 0.45, 0.35, 180), prop('Pied de micro', 'mic', 0, 2.3, 0.3, 0.3, 1.6),
        ],
      };
    }
    case 'theatre': {
      const m = [marker('Avant-scène', 0, 1.5), marker('Jardin', -3, 4), marker('Cour', 3, 4)];
      return {
        ...base, stageWidth: 10, stageDepth: 8, shape: 'rect', markers: m,
        trusses: [truss('Perche 1', 0, 1.5, 7, 10), truss('Perche 2', 0, 4.5, 7, 10), truss('Perche 3', 0, 7, 7, 10)],
        performers: [on(m[1]!, 'standing', 'Comédien 1'), on(m[2]!, 'standing', 'Comédien 2')],
      };
    }
    case 'club': {
      const dj = marker('DJ', 0, 2, 1.5);
      return {
        ...base, stageWidth: 8, stageDepth: 5, shape: 'rect', cyclo: false, markers: [dj],
        trusses: [truss('Cercle', 0, 2.5, 4.5, 5, { shape: 'circle' })],
        performers: [on(dj, 'lectern')],
        screens: [screen('Mur LED', 0, 4.8, 0.8, 6, 3, '#7c3aed')],
      };
    }
    case 'conference': {
      const speaker = marker('Orateur', 2, 2);
      return {
        ...base, stageWidth: 8, stageDepth: 5, shape: 'rect', cyclo: false, markers: [speaker],
        trusses: [truss('Face', 0, -1, 5, 8, { support: 'towers' })],
        performers: [on(speaker, 'lectern')],
        screens: [screen('Projection', -1.5, 4.8, 1.2, 4, 2.25, '#e5e7eb')],
      };
    }
    case 'arena': {
      const m = [marker('Centre', 0, 5), marker('Nord', 0, 8), marker('Sud', 0, 2), marker('Est', 3, 5), marker('Ouest', -3, 5)];
      return {
        ...base, stageWidth: 10, stageDepth: 10, shape: 'arena', cyclo: false, markers: m,
        trusses: [truss('Carré central', 0, 5, 8, 8, { shape: 'square' })],
        performers: [on(m[0]!, 'standing', 'Artiste')],
      };
    }
    case 'catwalk': {
      const m = [marker('Entrée', 0, 1), marker('Bout du podium', 0, -9.5)];
      return {
        ...base, stageWidth: 10, stageDepth: 5, shape: 'thrust', thrust: { width: 2, depth: 10 }, cyclo: false, markers: m,
        trusses: [truss('Podium', 0, -5, 6, 10, { rotation: 90 }), truss('Fond', 0, 3, 6, 10)],
        performers: [on(m[1]!, 'standing', 'Mannequin')],
        screens: [screen('Écran de fond', 0, 4.8, 0, 8, 4, '#0f172a')],
      };
    }
    case 'festival': {
      const m = [marker('Chant', 0, 2.5), marker('Guitare', -4, 3.5), marker('Basse', 4, 3.5), marker('Claviers', -3.5, 6.5, 1.3), marker('Batterie', 0, 7, 1.8)];
      return {
        ...base, stageWidth: 16, stageDepth: 10, shape: 'rect', cyclo: false, markers: m,
        trusses: [
          truss('Face', 0, 0.5, 8, 16), truss('Milieu', 0, 4.5, 9, 14), truss('Contre', 0, 9, 9.5, 16, { support: 'towers' }),
          truss('Totem jardin', -7, 3, 3, 0.5, { shape: 'totem', support: 'none' }), truss('Totem cour', 7, 3, 3, 0.5, { shape: 'totem', support: 'none' }),
        ],
        performers: [on(m[0]!), on(m[1]!), on(m[2]!), on(m[3]!, 'keys'), on(m[4]!, 'drums')],
        screens: [
          screen('Écran central', 0, 9.8, 2.5, 10, 5.6, '#1e3a8a'),
          screen('Écran jardin', -10, 1, 3, 4, 2.25, '#0f172a'), screen('Écran cour', 10, 1, 3, 4, 2.25, '#0f172a'),
        ],
        props: [
          prop('Praticable batterie', 'riser', 0, 7, 3, 2.5, 0.5),
          prop('Line array jardin', 'speaker', -9, 0.8, 0.8, 0.8, 1.8), prop('Line array cour', 'speaker', 9, 0.8, 0.8, 0.8, 1.8),
          prop('Retour chant', 'monitor', 0, 1.5, 0.6, 0.45, 0.35, 180), prop('Pied de micro', 'mic', 0, 2.8, 0.3, 0.3, 1.6),
        ],
      };
    }
    case 'acoustic': {
      const m = [marker('Chant', 0, 1.5, 1.2), marker('Guitare', -1.6, 1.9, 1.2), marker('Piano', 1.8, 2.4, 1.2)];
      return {
        ...base, stageWidth: 6, stageDepth: 4, shape: 'rect', cyclo: false, markers: m,
        trusses: [truss('Face', 0, -0.8, 4, 6, { support: 'towers' }), truss('Contre', 0, 3.5, 4, 6)],
        performers: [on(m[0]!, 'seated'), on(m[1]!, 'seated'), on(m[2]!, 'keys')],
        props: [
          prop('Rideau de fond', 'drape', 0, 3.9, 6, 0.1, 3.5), prop('Pied de micro', 'mic', 0, 1.1, 0.3, 0.3, 1.2),
          prop('Tabouret', 'box', 0, 1.6, 0.4, 0.4, 0.6), prop('Tabouret guitare', 'box', -1.6, 2, 0.4, 0.4, 0.6),
        ],
      };
    }
    case 'tv': {
      const m = [marker('Animateur', -2, 2.6, 1.2), marker('Invité 1', 0.4, 2.6, 1.2), marker('Invité 2', 2.4, 2.6, 1.2)];
      return {
        ...base, stageWidth: 10, stageDepth: 7, shape: 'rect', markers: m,
        trusses: [truss('Grill face', 0, 0, 6, 10), truss('Grill milieu', 0, 3.5, 6, 10), truss('Grill contre', 0, 6, 6, 10)],
        performers: [on(m[0]!, 'seated'), on(m[1]!, 'seated'), on(m[2]!, 'seated')],
        screens: [screen('Mur LED', 0, 6.8, 0.5, 8, 3, '#0ea5e9')],
        props: [prop('Table d’animation', 'table', 0.2, 3.1, 5.5, 1, 0.75), prop('Praticable', 'riser', 0.2, 3, 7, 3, 0.2)],
      };
    }
    case 'gala': {
      const m = [marker('Discours', -2.5, 1.5), marker('Chant', 1.5, 2.2), marker('Piano', 3, 3, 1.3)];
      return {
        ...base, stageWidth: 8, stageDepth: 5, shape: 'rect', cyclo: false, markers: m,
        trusses: [
          truss('Face', 0, -0.5, 5, 8, { support: 'towers' }),
          truss('Totem jardin', -4.5, 3.5, 2.5, 0.5, { shape: 'totem', support: 'none' }), truss('Totem cour', 4.5, 3.5, 2.5, 0.5, { shape: 'totem', support: 'none' }),
        ],
        performers: [on(m[0]!, 'lectern'), on(m[1]!), on(m[2]!, 'keys')],
        screens: [screen('Écran', 0, 4.8, 1, 4, 2.25, '#fbbf24')],
        props: [prop('Estrade musiciens', 'riser', 2.2, 2.8, 4, 2, 0.4), prop('Marches', 'stairs', 2.2, 1.4, 1.2, 0.8, 0.4)],
      };
    }
  }
}

/** True when the stage holds something a template would overwrite. */
export const hasSceneContent = (v: Vis) => v.markers.length + v.trusses.length + v.performers.length + v.screens.length + v.props.length > 0;
