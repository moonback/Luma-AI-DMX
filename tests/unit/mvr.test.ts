import { readFileSync } from 'node:fs';
import path from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { asUuid, exportMvr, mvrScene } from '../../src/core/project/mvr';
import { readZip } from '../../src/core/util/zip';
import { demoProject, makeService } from '../helpers';

const parse = (xml: string) => new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', isArray: (n) => n === 'Fixture' }).parse(xml) as {
  GeneralSceneDescription: { verMajor: string; Scene: { Layers: { Layer: { name: string; ChildList: { Fixture: { name: string; uuid: string; Matrix: string; GDTFSpec: string; GDTFMode: string; Addresses: { Address: { '#text': number; break: string } } }[] } } } } };
};

describe('export MVR', () => {
  it('UUID stables, au format MVR, même pour des ids de démo', () => {
    expect(asUuid('par1')).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
    expect(asUuid('par1')).toBe(asUuid('par1'));
    expect(asUuid('par1')).not.toBe(asUuid('par2'));
    expect(asUuid('0f8fad5b-d9cb-469f-a165-70867728950e')).toBe('0F8FAD5B-D9CB-469F-A165-70867728950E');
  });

  it('chaque projecteur : nom, type GDTF, mode, adresse absolue, position en mm, suspendu retourné', () => {
    const p = demoProject();
    p.patch[0]!.universe = 2;
    p.patch[0]!.rotation = 90;
    p.patch[1]!.mount = 'floor';
    const xml = mvrScene(p);
    expect(XMLValidator.validate(xml)).toBe(true);
    const fx = parse(xml).GeneralSceneDescription.Scene.Layers.Layer.ChildList.Fixture;
    expect(fx).toHaveLength(p.patch.length);
    expect(fx[0]).toMatchObject({ name: 'PAR 1', GDTFSpec: 'Luma Demo (fictif)@Demo PAR RGB.gdtf', GDTFMode: '3ch RGB' });
    expect(fx[0]!.Addresses.Address).toMatchObject({ '#text': 513, break: '0' }); // universe 2, address 1
    // Hung (4 m) and rotated 90°: X axis → Y, flipped Z; offset in millimetres.
    expect(fx[0]!.Matrix).toBe('{0,1,0}{1,0,0}{0,0,-1}{-2000,1000,4000}');
    expect(fx[1]!.Matrix).toBe('{1,0,0}{0,1,0}{0,0,1}{2000,1000,4000}');
  });

  it('commande project.exportMvr : archive avec GeneralSceneDescription.xml', async () => {
    const { svc, dataDir } = makeService();
    await svc.init();
    await svc.execute({ type: 'project.openDemo', id: (await import('../../src/core/demo/catalog')).DEMOS[0]!.id });
    const file = path.join(dataDir, 'rig.mvr');
    expect(await svc.execute({ type: 'project.exportMvr', path: file })).toEqual({ path: file });
    const xml = Buffer.from(readZip(readFileSync(file)).read('GeneralSceneDescription.xml')!).toString('utf8');
    expect(parse(xml).GeneralSceneDescription.Scene.Layers.Layer.ChildList.Fixture.length).toBe(svc.getProject().patch.length);
    expect(exportMvr(svc.getProject()).length).toBeGreaterThan(100);
    await svc.dispose();
  });
});
