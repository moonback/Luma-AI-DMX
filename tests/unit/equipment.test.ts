import * as THREE from 'three';
import path from 'node:path';
import { createProject } from '../../src/core/project/format';
import { projectSchema, propSchema, PROP_KINDS, type Project, type StageProp, type Truss } from '../../src/core/model/schemas';
import { EQUIPMENT, lineArrayAngles, paramOf, sanitizeParams } from '../../src/core/visualizer/equipment';
import { LIBRARY, librarySearchText } from '../../src/core/visualizer/library';
import { ASSEMBLIES, buildAssembly, withAssembly } from '../../src/core/visualizer/assemblies';
import { alignProp, cloneElement, mirrorProp, newElement, parseElement, serializeElement, snapPropToTruss, withElement, withPatched, withoutElement } from '../../src/core/visualizer/sceneEdit';
import { isAdditionRequest, planSceneAdditions } from '../../src/core/visualizer/sceneAdditions';
import { floorAt } from '../../src/core/visualizer/lighting';
import { ProfileLibrary } from '../../src/core/fixtures/profiles';
import { BUILTIN_PROFILES } from '../../src/core/fixtures/builtinProfiles';
import { buildEquipment, hasEquipmentModel } from '../../src/renderer/features/stage3d/equipment';
import { disposeGroup } from '../../src/renderer/features/stage3d/environment';
import { UNIT_BOX } from '../../src/renderer/features/stage3d/equipment/kit';
import { makeService, tempDir } from '../helpers';

let n = 0;
const id = () => `e${n++}`;
const vis = (): Project['visualizer'] => createProject('Équipements').visualizer;
const prop = (over: Partial<StageProp>): StageProp => ({ id: id(), name: 'P', kind: 'riser', x: 0, y: 2, width: 1, depth: 1, height: 1, elevation: 0, rotation: 0, color: '#222222', ...over });
const truss: Truss = { id: 't1', name: 'Pont', shape: 'line', x: 0, y: 4, height: 7, length: 10, rotation: 0, support: 'hung' };

describe('modèle de données des équipements', () => {
  it('un décor d’un ancien projet (sans paramètres) reste valide', () => {
    const old = { id: 'r', name: 'Praticable', kind: 'riser', x: 0, y: 1, width: 2, depth: 1, height: 0.4, elevation: 0, rotation: 0, color: '#2a2f3a' };
    expect(propSchema.parse(old)).toEqual(old);
    const p = createProject('Ancien');
    expect(projectSchema.parse({ ...p, visualizer: { ...p.visualizer, props: [old], trusses: [{ ...truss }] } }).visualizer.trusses[0]!.section).toBeUndefined();
  });

  it('chaque type a une fiche de catalogue et chaque élément de bibliothèque crée un objet valide', () => {
    for (const k of PROP_KINDS) expect(EQUIPMENT[k].label).toBeTruthy();
    let v = vis();
    for (const item of LIBRARY.filter((x) => x.kind === 'prop')) v = { ...v, ...withElement(v, 'prop', newElement(v, 'prop', id, { x: 1, y: 2 }, item.preset)) };
    expect(projectSchema.parse({ ...createProject('x'), visualizer: v }).visualizer.props.length).toBe(LIBRARY.filter((x) => x.kind === 'prop').length);
    // Every category of the request has items.
    for (const c of ['structure', 'sound', 'backline', 'light', 'decor', 'video', 'accessory']) expect(LIBRARY.some((x) => x.group === c)).toBe(true);
  });

  it('les paramètres sont bornés et filtrés selon le type', () => {
    expect(sanitizeParams('line-array', { modules: 99, splay: 2.3, bogus: 1, flown: 'oui', angles: '0,1,2' })).toEqual({ modules: 24, splay: 2.5, angles: '0,1,2' });
    expect(paramOf({ kind: 'line-array', params: { modules: -4 } }, 'modules')).toBe(1);
    expect(paramOf({ kind: 'amp', params: { style: 'tuba' } }, 'style')).toBe('combo');
  });

  it('angles d’un line array : liste par module complétée, sinon angle uniforme', () => {
    expect(lineArrayAngles({ kind: 'line-array', params: { modules: 5, angles: '0, 1, 3' } })).toEqual([0, 1, 3, 3]);
    expect(lineArrayAngles({ kind: 'line-array', params: { modules: 4, splay: 2 } })).toEqual([2, 2, 2]);
  });

  it('newElement filtre les paramètres d’un préréglage, la copie et le presse-papiers les conservent', () => {
    const v = vis();
    const el = newElement(v, 'prop', id, { x: 0, y: 1 }, { kind: 'amp', params: { style: 'stack', nope: true } }) as StageProp;
    expect(el.params).toEqual({ style: 'stack' });
    expect((cloneElement(v, 'prop', el, id) as StageProp).params).toEqual({ style: 'stack' });
    expect(parseElement(serializeElement('prop', el))!.el).toMatchObject({ kind: 'amp', params: { style: 'stack' } });
  });

  it('recherche : les mots-clés du type trouvent l’élément', () => {
    expect(LIBRARY.filter((x) => librarySearchText(x).toLowerCase().includes('sono')).map((x) => x.id)).toContain('line-array-8');
  });
});

describe('placement des équipements', () => {
  it('un line array lâché près d’une structure s’accroche dessous, pas une batterie', () => {
    const la = prop({ kind: 'line-array', x: 0.3, y: 4.4, height: 2.6 });
    expect(snapPropToTruss(la, [truss])).toMatchObject({ x: 0.3, y: 4, elevation: 4.22, truss: { id: 't1' } });
    expect(snapPropToTruss(prop({ kind: 'hoist', y: 4.2, height: 0.5 }), [truss])!.elevation).toBe(7.18);
    expect(snapPropToTruss(prop({ kind: 'drums', y: 4 }), [truss])).toBeNull();
    expect(snapPropToTruss(la, [{ ...truss, y: 10 }])).toBeNull();
  });

  it('copie symétrique et alignements', () => {
    const p = prop({ name: 'Ampli jardin', x: -3, rotation: 20, width: 2, depth: 1 });
    expect(mirrorProp(p, id)).toMatchObject({ name: 'Ampli cour', x: 3, rotation: -20 });
    const v = { stageWidth: 12, stageDepth: 8 };
    expect(alignProp({ ...p, rotation: 0 }, v, 'back')).toEqual({ y: 7.5 });
    expect(alignProp({ ...p, rotation: 90 }, v, 'left')).toEqual({ x: -5.5 });
    expect(alignProp(p, v, 'floor')).toEqual({ elevation: 0 });
  });

  it('flight-case praticable, objets masqués ignorés pour le sol', () => {
    expect(floorAt(0, 2, [prop({ kind: 'flight-case', height: 0.7 })])).toBe(0.7);
    expect(floorAt(0, 2, [prop({ kind: 'riser', height: 0.7, hidden: true })])).toBe(0);
    expect(floorAt(0, 2, [prop({ kind: 'drums', height: 1.4 })])).toBe(0);
  });

  it('chaque assemblage produit des éléments valides, refusé au-delà des limites', () => {
    const v = vis();
    for (const a of ASSEMBLIES) {
      const parts = buildAssembly(a.id, v, { x: 0, y: 4 }, id);
      expect(parts.trusses.length + parts.props.length).toBeGreaterThan(0);
      const patch = withAssembly(v, parts)!;
      expect(() => projectSchema.parse({ ...createProject('a'), visualizer: { ...v, ...patch } })).not.toThrow();
    }
    const full = { ...v, trusses: Array.from({ length: 64 }, (_, i) => ({ ...truss, id: `t${i}` })) };
    expect(withAssembly(full, buildAssembly('roof', v, { x: 0, y: 4 }, id))).toBeNull();
  });
});

describe('assistant de scène (ajouts)', () => {
  const profiles = new ProfileLibrary(BUILTIN_PROFILES).all();
  const request = 'Ajoute deux line arrays de chaque côté de la scène, une batterie au centre arrière, deux amplificateurs de guitare et un grand écran LED derrière les musiciens.';

  it('comprend la demande d’exemple : catégories, quantités et positions cohérentes', () => {
    const v = vis();
    const plan = planSceneAdditions(request, v, id, profiles);
    const added = plan.patch.props!.filter((p) => plan.created.props.includes(p.id));
    const arrays = added.filter((p) => p.kind === 'line-array');
    expect(arrays).toHaveLength(2);
    expect(arrays.map((p) => Math.sign(p.x)).sort()).toEqual([-1, 1]);
    expect(arrays.every((p) => Math.abs(p.x) > v.stageWidth / 2 && p.elevation > 2)).toBe(true);
    const drums = added.find((p) => p.kind === 'drums')!;
    expect(drums.x).toBe(0);
    expect(drums.y).toBeGreaterThan(v.stageDepth / 2);
    expect(added.filter((p) => p.kind === 'amp')).toHaveLength(2);
    expect(plan.patch.screens).toHaveLength(1);
    const screen = plan.patch.screens![0]!;
    expect(screen.y).toBeGreaterThan(drums.y); // behind the musicians
    expect(screen.width).toBeGreaterThan(6);
    expect(plan.lines).toHaveLength(4);
    // The "deux … de chaque côté" reading is reported, not hidden.
    expect(plan.notices.join('\n')).toMatch(/un par côté/);
    expect(() => projectSchema.parse({ ...createProject('x'), visualizer: { ...v, ...plan.patch } })).not.toThrow();
  });

  it('signale l’indisponible et l’incompris, ne crée rien d’inventé', () => {
    const plan = planSceneAdditions('Ajoute une harpe, trois blablas et 2 retours', vis(), id, profiles);
    expect(plan.notices.join('\n')).toMatch(/Indisponible.*harpe/);
    expect(plan.notices.join('\n')).toMatch(/Non compris.*blablas/);
    expect(plan.created.props).toHaveLength(2);
    expect(plan.patch.props!.every((p) => p.kind === 'monitor' && p.rotation === 180)).toBe(true);
  });

  it('« 2 par côté » donne 4 éléments, un line array près d’un pont s’y accroche, les projecteurs passent par des profils', () => {
    const v = { ...vis(), trusses: [{ ...truss, y: 0.3, length: 20 }] };
    const plan = planSceneAdditions('ajoute 2 line arrays par côté et 4 lyres', v, id, profiles);
    const arrays = plan.patch.props!.filter((p) => p.kind === 'line-array');
    expect(arrays).toHaveLength(4);
    expect(arrays.every((p) => p.y === 0.3 && p.elevation + p.height <= 7)).toBe(true);
    expect(plan.fixtures).toEqual([expect.objectContaining({ profileId: 'demo-spot', count: 4, movable: true })]);
  });

  it('rien n’est préparé au-delà des limites, et une demande de scène complète n’est pas un ajout', () => {
    const v = { ...vis(), screens: Array.from({ length: 16 }, (_, i) => ({ id: `s${i}`, name: 'É', x: 0, y: 1, elevation: 0, width: 1, height: 1, rotation: 0, source: 'color' as const, color: '#000000', glow: 0 })) };
    const plan = planSceneAdditions('ajoute un écran', v, id, profiles);
    expect(plan.patch).toEqual({});
    expect(plan.notices.join()).toMatch(/Limite/);
    expect(isAdditionRequest('Ajoute deux retours')).toBe(true);
    expect(isAdditionRequest('Créer une scène de concert avec…')).toBe(false);
  });
});

describe('modèles 3D procéduraux', () => {
  it('chaque type d’équipement a un modèle détaillé qui tient dans son encombrement', () => {
    for (const item of LIBRARY.filter((x) => x.kind === 'prop')) {
      const p = propSchema.parse({ id: 'm', x: 0, y: 0, rotation: 0, ...item.preset, name: 'M' });
      const o = buildEquipment(p, false);
      if (!hasEquipmentModel(p.kind)) { expect(o).toBeNull(); continue; }
      expect(o).not.toBeNull();
      let meshes = 0;
      o!.traverse((x) => { if (x instanceof THREE.Mesh || x instanceof THREE.Line) meshes++; });
      expect(meshes, item.id).toBeGreaterThanOrEqual(2); // never a single cube
      if (o instanceof THREE.LOD) o.levels[1]!.object.visible = false;
      const box = new THREE.Box3().setFromObject(o instanceof THREE.LOD ? o.levels[0]!.object : o!);
      const size = box.getSize(new THREE.Vector3());
      // Rigging (chains, motor) may rise above a flown piece; the footprint is respected within 25 %.
      expect(size.x, item.id).toBeLessThan(p.width * 1.25 + 0.6);
      expect(size.z, item.id).toBeLessThan(p.depth * 1.25 + 0.7);
    }
  });

  it('libérer une scène épargne les géométries partagées du cache', () => {
    const g = new THREE.Group();
    g.add(buildEquipment(prop({ kind: 'drums', width: 1.8, depth: 1.5, height: 1.4 }), true)!);
    let tinted = 0;
    g.traverse((o) => { if (o instanceof THREE.Mesh && (o.material as THREE.MeshStandardMaterial).emissive?.getHex() === 0x3b1f8a) tinted++; });
    expect(tinted).toBeGreaterThan(5); // selection highlight
    disposeGroup(g);
    expect(UNIT_BOX().attributes.position).toBeDefined(); // still usable after the set was disposed
  });
});

describe('sauvegarde et rechargement', () => {
  it('un projet avec équipements, paramètres, section triangulaire et mur LED modulaire se rouvre à l’identique', async () => {
    const dir = tempDir();
    const file = path.join(dir, 'equip.json');
    const { svc } = makeService(dir);
    await svc.init();
    await svc.execute({ type: 'project.new', name: 'Équipements' });
    const v = svc.projectState().project.visualizer;
    const plan = planSceneAdditions('ajoute deux line arrays de chaque côté, une batterie au fond et un grand écran LED', v, id);
    const extra = withElement(v, 'prop', newElement(v, 'prop', id, { x: 2, y: 3 }, { kind: 'keyboard', params: { tiers: 2 }, locked: true }));
    await svc.execute({ type: 'project.update', visualizer: { ...plan.patch, props: [...plan.patch.props!, ...extra.props!], trusses: [{ ...truss, section: 'triangle' }] } });
    // Move, rotate, rename, duplicate, delete: the usual element edits work on the new kinds.
    let cur = svc.projectState().project.visualizer;
    const drums = cur.props.find((p) => p.kind === 'drums')!;
    await svc.execute({ type: 'project.update', visualizer: withPatched(cur, { kind: 'prop', id: drums.id }, { x: 1.5, rotation: 30, name: 'Batterie principale' }) });
    cur = svc.projectState().project.visualizer;
    const copy = cloneElement(cur, 'prop', cur.props.find((p) => p.id === drums.id)!, id);
    await svc.execute({ type: 'project.update', visualizer: withElement(cur, 'prop', copy) });
    cur = svc.projectState().project.visualizer;
    const keyboard = cur.props.find((p) => p.kind === 'keyboard')!;
    await svc.execute({ type: 'project.update', visualizer: withoutElement(cur, { kind: 'prop', id: keyboard.id }) });
    await svc.execute({ type: 'scene.undo' }); // the keyboard comes back
    await svc.execute({ type: 'project.saveAs', path: file });
    const before = svc.projectState().project.visualizer;
    await svc.dispose();

    const second = makeService(dir).svc;
    await second.init();
    await second.execute({ type: 'project.open', path: file });
    const after = second.projectState().project.visualizer;
    expect(after.props).toEqual(before.props);
    expect(after.screens).toEqual(before.screens);
    expect(after.trusses[0]!.section).toBe('triangle');
    expect(after.props.find((p) => p.id === drums.id)).toMatchObject({ x: 1.5, rotation: 30, name: 'Batterie principale' });
    expect(after.props.find((p) => p.kind === 'keyboard')).toMatchObject({ locked: true, params: { tiers: 2 } });
    expect(after.props.filter((p) => p.kind === 'drums')).toHaveLength(2);
    expect(after.screens[0]!.cabinet).toBe(0.5);
    await second.dispose();
  });
});
