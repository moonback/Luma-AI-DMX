import { describe, it, expect, beforeEach } from 'vitest';
import { QUALITY_PRESETS, loadPrefs, savePrefs, type Prefs } from '../../src/renderer/features/stage3d/scene';
import { disposeGeometries } from '../../src/renderer/features/stage3d/rig';
import { stageGeometry } from '../../src/renderer/features/stage3d/environment';
import type { Project } from '../../src/core/model/schemas';
import type { VisualFixture } from '../../src/core/visualizer/model';

describe('Stage 3D — Préférences & Préréglages de qualité', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageImpl = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => { mockStorage[key] = value; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => { mockStorage = {}; },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: storageImpl,
      writable: true,
      configurable: true,
    });
  });

  it('loadPrefs retourne les préférences par défaut quand localStorage est vide', () => {
    const prefs = loadPrefs();
    expect(prefs.haze).toBe(0.55);
    expect(prefs.glow).toBe(true);
    expect(prefs.pools).toBe(true);
    expect(prefs.smoke).toBe(false);
    expect(prefs.grid).toBe(0.25);
    expect(prefs.ambience).toBe('black');
  });

  it('loadPrefs est résilient aux JSON corrompus ou invalides', () => {
    mockStorage['luma.stage3d'] = 'invalid-json{{{';
    const prefs = loadPrefs();
    expect(prefs.haze).toBe(0.55);
    expect(prefs.glow).toBe(true);
  });

  it('savePrefs et loadPrefs effectuent un aller-retour complet', () => {
    const custom: Prefs = {
      haze: 0.8,
      glow: false,
      pools: false,
      labels: true,
      smoke: true,
      view: 'front',
      grid: 0.5,
      real: true,
      ambience: 'work',
      floor: 'lacquer',
      exposure: 1.2,
      room: 0.5,
    };
    savePrefs(custom);
    const loaded = loadPrefs();
    expect(loaded).toEqual(custom);
  });

  it('QUALITY_PRESETS contient 4 préréglages valides et cohérents', () => {
    expect(QUALITY_PRESETS.length).toBe(4);
    const expectedIds = ['edit', 'balanced', 'quality', 'present'];
    expect(QUALITY_PRESETS.map((p) => p.id)).toEqual(expectedIds);

    for (const preset of QUALITY_PRESETS) {
      expect(preset.labelKey.length).toBeGreaterThan(0);
      expect(preset.hintKey.length).toBeGreaterThan(0);
      expect(Object.keys(preset.patch).length).toBeGreaterThan(0);

      // Appliquer le patch sur DEFAULT_PREFS doit produire des valeurs valides
      const applied = { ...loadPrefs(), ...preset.patch };
      expect(typeof applied.haze).toBe('number');
      expect(applied.haze).toBeGreaterThanOrEqual(0);
      expect(applied.haze).toBeLessThanOrEqual(1);
      expect(typeof applied.glow).toBe('boolean');
      expect(typeof applied.pools).toBe('boolean');
      expect(typeof applied.smoke).toBe('boolean');
      expect(typeof applied.real).toBe('boolean');
    }
  });

  it('le préréglage Édition désactive les effets lourds pour maximiser le framerate', () => {
    const edit = QUALITY_PRESETS.find((p) => p.id === 'edit')!;
    expect(edit.patch.glow).toBe(false);
    expect(edit.patch.pools).toBe(false);
    expect(edit.patch.smoke).toBe(false);
    expect(edit.patch.real).toBe(false);
  });

  it('le préréglage Présentation active la fumée et le bloom pour un rendu client optimal', () => {
    const present = QUALITY_PRESETS.find((p) => p.id === 'present')!;
    expect(present.patch.smoke).toBe(true);
    expect(present.patch.glow).toBe(true);
    expect(present.patch.haze).toBeGreaterThan(0.7);
  });
});

describe('Stage 3D — Nettoyage mémoire géométries partagées', () => {
  it('disposeGeometries() peut être appelé sans erreur même si le cache est vide', () => {
    expect(() => disposeGeometries()).not.toThrow();
  });

  it('disposeGeometries() successifs sont idempotents', () => {
    expect(() => {
      disposeGeometries();
      disposeGeometries();
      disposeGeometries();
    }).not.toThrow();
  });
});

describe('Stage 3D — Géométrie du plateau (stageGeometry)', () => {
  const baseVis: Project['visualizer'] = {
    stageWidth: 10,
    stageDepth: 8,
    cyclo: true,
    shape: 'proscenium',
    thrust: 3,
    trusses: [],
    props: [],
    markers: [],
    performers: [],
    screens: [],
    views: [],
  };

  it('calcule les dimensions et la hauteur de mur minimale (6 m) sans projecteurs', () => {
    const geom = stageGeometry(baseVis, []);
    expect(geom.width).toBe(10);
    expect(geom.depth).toBe(8);
    expect(geom.wallHeight).toBe(6);
    expect(geom.wall).toBe(true);
    expect(geom.arena).toBe(false);
    expect(geom.thrust).toBeNull();
  });

  it('adapte la hauteur du mur cyclorama à la hauteur du plus haut projecteur', () => {
    const fixtures = [
      { id: 'f1', height: 4 } as VisualFixture,
      { id: 'f2', height: 7.5 } as VisualFixture,
    ];
    const geom = stageGeometry(baseVis, fixtures);
    // top = 7.5, wallHeight = Math.max(6, Math.ceil(7.5 + 2)) = 10
    expect(geom.wallHeight).toBe(10);
  });

  it('gère les formes avancées de scène (thrust et arena)', () => {
    const thrustGeom = stageGeometry({ ...baseVis, shape: 'thrust' }, []);
    expect(thrustGeom.thrust).toBe(3);
    expect(thrustGeom.arena).toBe(false);

    const arenaGeom = stageGeometry({ ...baseVis, shape: 'arena' }, []);
    expect(arenaGeom.arena).toBe(true);
    expect(arenaGeom.wall).toBe(false); // Pas de cyclorama en arène
  });
});
