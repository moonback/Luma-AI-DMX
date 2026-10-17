import { audienceGlare, beamDirection, beamHit, flickerOn, onStage, poolShape, rotateY, beamLength } from '../../src/core/visualizer/beam';
import { buildVisualModel, goboIndex, strobeFrequency, zoomedAngle, type VisualFixture } from '../../src/core/visualizer/model';
import { parseProject } from '../../src/core/project/format';
import { commandSchema } from '../../src/shared/commands';
import { ProjectIndex } from '../../src/core/engine/resolve';
import { ProfileLibrary, coarseChannel } from '../../src/core/fixtures/profiles';
import { demoProject, makeService } from '../helpers';

const stage = { width: 12, depth: 8, wallHeight: 6 };
const close = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 5);
  expect(a.y).toBeCloseTo(b.y, 5);
  expect(a.z).toBeCloseTo(b.z, 5);
};
const mover = { movable: true, panDeg: 0, tiltDeg: 0, rotation: 0, mount: 'hanging' as const };

describe('géométrie des faisceaux', () => {
  it('lyre accrochée : tilt 0 = vers le sol, tilt +90° = vers le public, pan tourne autour de la verticale', () => {
    close(beamDirection(mover), { x: 0, y: -1, z: 0 });
    close(beamDirection({ ...mover, tiltDeg: 90 }), { x: 0, y: 0, z: 1 });
    close(beamDirection({ ...mover, tiltDeg: 90, panDeg: 90 }), { x: 1, y: 0, z: 0 });
    close(beamDirection({ ...mover, mount: 'floor' }), { x: 0, y: 1, z: 0 });
  });

  it('projecteurs fixes : accrochés vers l’avant-scène, au sol vers le cyclorama', () => {
    const hung = beamDirection({ ...mover, movable: false });
    expect(hung.y).toBeLessThan(0);
    expect(hung.z).toBeGreaterThan(0);
    const floor = beamDirection({ ...mover, movable: false, mount: 'floor' });
    expect(floor.y).toBeGreaterThan(0);
    expect(floor.z).toBeLessThan(0);
  });

  it('impact au sol puis sur le cyclorama, avec la bonne distance', () => {
    const down = beamHit({ x: 0, y: 6, z: -3 }, { x: 0, y: -1, z: 0 }, stage)!;
    expect(down.surface).toBe('floor');
    expect(down.distance).toBeCloseTo(6);
    const back = beamHit({ x: 0, y: 0.3, z: -7.5 }, beamDirection({ ...mover, movable: false, mount: 'floor' }), stage)!;
    expect(back.surface).toBe('wall');
    expect(back.point.z).toBe(-8);
    expect(back.point.y).toBeGreaterThan(0.3);
    expect(beamHit({ x: 0, y: 6, z: -3 }, { x: 0, y: 1, z: 0 }, stage)).toBeNull(); // pointing at the ceiling
    expect(beamLength(null)).toBe(30);
  });

  it('tache : rayon selon l’angle, étirée en incidence rasante, atténuée avec la distance', () => {
    const hit = beamHit({ x: 0, y: 6, z: -3 }, { x: 0, y: -1, z: 0 }, stage)!;
    const straight = poolShape(hit, { x: 0, y: -1, z: 0 }, 20);
    expect(straight.radius).toBeCloseTo(6 * Math.tan((10 * Math.PI) / 180));
    expect(straight.stretch).toBeCloseTo(1);
    const d = { x: 0, y: -Math.cos(1.2), z: Math.sin(1.2) };
    const grazing = poolShape(beamHit({ x: 0, y: 6, z: -8 }, d, stage)!, d, 20);
    expect(grazing.stretch).toBeGreaterThan(2);
    expect(grazing.falloff).toBeLessThan(straight.falloff);
  });

  it('prisme : rotation autour de la verticale', () => {
    close(rotateY({ x: 0, y: 0, z: 1 }, Math.PI / 2), { x: 1, y: 0, z: 0 });
  });

  it('strobe : éclairs brefs à la fréquence donnée, continu sinon', () => {
    expect(flickerOn(1.234, 0)).toBe(true);
    const on = Array.from({ length: 1000 }, (_, i) => flickerOn(i / 1000, 10)).filter(Boolean).length;
    expect(on).toBeGreaterThan(250);
    expect(on).toBeLessThan(350);
  });
});

describe('modèle visuel enrichi', () => {
  const lib = new ProfileLibrary();
  const spotMode = lib.get('demo-spot')!.modes[0]!;

  it('fréquence strobe, gobo et zoom à partir des plages du profil', () => {
    const shutter = coarseChannel(spotMode, 'shutter')!;
    expect(strobeFrequency(shutter, 8 / 255)).toBe(0); // open
    expect(strobeFrequency(shutter, 16 / 255)).toBeCloseTo(1);
    expect(strobeFrequency(shutter, 131 / 255)).toBeCloseTo(20);
    const gobo = coarseChannel(spotMode, 'gobo')!;
    expect(goboIndex(gobo, 0)).toBe(0);
    expect(goboIndex(gobo, 25 / 255)).toBe(2);
    expect(zoomedAngle(25, undefined)).toBe(25);
    expect(zoomedAngle(25, 0)).toBe(10);
    expect(zoomedAngle(25, 1)).toBe(40);
  });

  it('accroche selon la hauteur, gobo et prisme lus depuis les valeurs calculées', () => {
    const p = demoProject();
    p.patch[3]!.height = 6;
    p.patch[4]!.height = 0.2;
    const index = new ProjectIndex(p);
    const m = buildVisualModel([...index.fixtures.values()], { spot1: { gobo: 15 / 255, prism: 200 / 255, dimmer: 1 } });
    const s1 = m.find((f) => f.id === 'spot1')!;
    const s2 = m.find((f) => f.id === 'spot2')!;
    expect(s1).toMatchObject({ mount: 'hanging', gobo: 1, prism: true, movable: true });
    expect(s2.mount).toBe('floor');
    expect(s2.prism).toBe(false);
  });
});

describe('forme de plateau, points de scène et éblouissement', () => {
  const vf = (o: Partial<VisualFixture>): VisualFixture => ({
    id: 'f', name: 'Lyre', type: 'moving-head', x: 0, y: 1, rotation: 0, color: '#ffffff', intensity: 1, movable: true, panDeg: 0, tiltDeg: 0,
    beamAngle: 15, height: 4, mount: 'hanging', cells: [], strobeHz: 0, gobo: 0, prism: false, ...o,
  } as VisualFixture);

  it('sans cyclo ou en arène, le faisceau traverse le fond de scène', () => {
    const o = { x: 0, y: 0.3, z: -7.5 }, d = beamDirection({ ...mover, movable: false, mount: 'floor' });
    expect(beamHit(o, d, stage)!.surface).toBe('wall');
    expect(beamHit(o, d, { ...stage, wall: false })).toBeNull();
    expect(beamHit(o, d, { ...stage, arena: true })).toBeNull();
    // Arena: the audience floor also exists behind the deck.
    expect(beamHit({ x: 0, y: 4, z: -10 }, { x: 0, y: -1, z: 0 }, { ...stage, arena: true })!.surface).toBe('floor');
  });

  it('l’avancée fait partie du plateau, pas de la salle', () => {
    const thrust = { ...stage, thrust: { width: 3, depth: 4 } };
    expect(onStage(0, 2, thrust)).toBe(true);
    expect(onStage(0, 2, stage)).toBe(false);
    expect(onStage(3, 2, thrust)).toBe(false);
  });

  it('signale une lyre pointée dans la salle à hauteur des yeux, pas une lyre vers le sol ni un projecteur fixe', () => {
    const intoHouse = vf({ id: 'a', tiltDeg: 70 });
    expect(audienceGlare([intoHouse], stage).map((f) => f.id)).toEqual(['a']);
    expect(audienceGlare([vf({ tiltDeg: 0 })], stage)).toEqual([]);
    expect(audienceGlare([vf({ tiltDeg: 70, intensity: 0 })], stage)).toEqual([]);
    expect(audienceGlare([vf({ tiltDeg: 70, movable: false })], stage)).toEqual([]);
    // Same beam over a long thrust: it lands on performers, not on the audience.
    expect(audienceGlare([intoHouse], { ...stage, thrust: { width: 6, depth: 12 } })).toEqual([]);
    // Arena: aiming upstage over the back edge also reaches spectators.
    expect(audienceGlare([vf({ y: 7, tiltDeg: 70, rotation: 180 })], { ...stage, arena: true })).toHaveLength(1);
  });

  it('un ancien projet reçoit les valeurs par défaut, une mise à jour partielle ne remet rien à zéro', async () => {
    const old = { ...demoProject(), visualizer: { stageWidth: 10, stageDepth: 6 } };
    const { project } = parseProject(JSON.stringify(old));
    expect(project.visualizer).toEqual({ stageWidth: 10, stageDepth: 6, shape: 'rect', thrust: { width: 3, depth: 4 }, cyclo: true, markers: [], views: [] });

    const { svc } = makeService();
    await svc.init();
    await svc.execute({ type: 'project.new', name: 'Scène' });
    const markers = [{ id: 'chant', name: 'Chanteur', x: 0, y: 2, height: 1.7 }];
    await svc.execute(commandSchema.parse({ type: 'project.update', visualizer: { markers, shape: 'thrust' } }) as never);
    await svc.execute(commandSchema.parse({ type: 'project.update', visualizer: { stageWidth: 14 } }) as never);
    expect(svc.projectState().project.visualizer).toMatchObject({ stageWidth: 14, shape: 'thrust', markers });
    expect(() => commandSchema.parse({ type: 'project.update', visualizer: { markers: [{ id: 'x', name: '', x: 0, y: 0, height: 1 }] } })).toThrow();
  });
});
