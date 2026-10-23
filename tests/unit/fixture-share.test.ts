import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { convertFixtureFiles, MAX_ARCHIVE_FILES } from '../../src/core/fixtures/importFile';
import { writeZip } from '../../src/core/util/zip';
import { makeService, tempDir } from '../helpers';
import { isFixtureShareUrl } from '../../src/main/ipc';

/** MA Fixture Share downloads: grandMA2 files (one per mode), .zip collections, refusals that say why. */
const MHL = readFileSync(path.resolve('tests/fixtures/ma2/BeamZ@MHL1940@26Channels@MHL1940.xml'));
const IGNITE = readFileSync(path.resolve('tests/fixtures/ma2/BeamZ@Ignite300LED@Mode_1@Ignite300LED.xml'));
/** The same fixture in another mode (another file of the same Fixture Share entry). */
const MHL_OTHER_MODE = Buffer.from(MHL.toString('utf8').replace('mode="26Channels"', 'mode="Mode court"'));
const enc = (s: string) => new TextEncoder().encode(s);

describe('import de fichiers de machines (MA Fixture Share)', () => {
  it('une collection .zip donne un profil par machine, les modes d’une même machine fusionnés', () => {
    const zip = writeZip([
      { name: 'BeamZ/MHL1940_26ch.xml', data: MHL },
      { name: 'BeamZ/MHL1940_court.xml', data: MHL_OTHER_MODE },
      { name: 'BeamZ/Ignite300.xml', data: IGNITE },
      { name: '__MACOSX/._MHL1940_26ch.xml', data: enc('junk') },
      { name: 'lisez-moi.txt', data: enc('notes') },
    ]);
    const r = convertFixtureFiles([{ name: 'collection.zip', bytes: zip }]);
    expect(r.errors).toEqual([]);
    expect(r.profiles).toHaveLength(2);
    const mhl = r.profiles.find((p) => /MHL1940/u.test(p.name))!;
    expect(mhl.modes.map((m) => m.name).sort()).toEqual(['26Channels', 'Mode court']);
  });

  it('les modes s’ajoutent au profil déjà présent dans la bibliothèque', () => {
    const first = convertFixtureFiles([{ name: 'a.xml', bytes: MHL }]).profiles[0]!;
    const r = convertFixtureFiles([{ name: 'b.xml', bytes: MHL_OTHER_MODE }], (id) => (id === first.id ? first : undefined));
    expect(r.profiles[0]!.modes).toHaveLength(2);
  });

  it('refus explicites : grandMA3, QLC+, archive vide, archive corrompue, archive imbriquée, OFL', () => {
    const r = convertFixtureFiles([
      { name: 'Robe.xml', bytes: enc('<?xml version="1.0"?><GMA3 DataVersion="1.9"><FixtureType Name="X"/></GMA3>') },
      { name: 'x.qxf', bytes: enc('<FixtureDefinition/>') },
      { name: 'vide.zip', bytes: writeZip([{ name: 'a.txt', data: enc('x') }]) },
      { name: 'casse.zip', bytes: enc('PK pas une archive') },
      { name: 'double.zip', bytes: writeZip([{ name: 'inner.zip', data: writeZip([{ name: 'a.xml', data: MHL }]) }]) },
      { name: 'ofl.json', bytes: enc('{"availableChannels":{}}') },
    ]);
    expect(r.profiles).toEqual([]);
    const all = [...r.errors, ...r.warnings].join('\n');
    expect(all).toMatch(/Robe\.xml : fiche grandMA3 non prise en charge/u);
    expect(all).toMatch(/x\.qxf : format QLC\+/u);
    expect(all).toMatch(/vide\.zip : aucun fichier de profil/u);
    expect(all).toMatch(/casse\.zip : Archive ZIP invalide/u);
    expect(all).toMatch(/inner\.zip : archive imbriquée ignorée/u);
    expect(all).toMatch(/ofl\.json : fichier Open Fixture Library/u);
  });

  it('une archive trop grande n’importe que les premiers fichiers', () => {
    const many = Array.from({ length: MAX_ARCHIVE_FILES + 2 }, (_, i) => ({ name: `f${i}.json`, data: enc('{"profiles":[]}') }));
    expect(convertFixtureFiles([{ name: 'gros.zip', bytes: writeZip(many) }]).warnings.join()).toMatch(new RegExp(`seuls les ${MAX_ARCHIVE_FILES} premiers`, 'u'));
  });
});

describe('commandes d’import', () => {
  it('profile.import accepte plusieurs fichiers et une collection, et les ajoute à la bibliothèque', async () => {
    const dir = tempDir();
    const zip = path.join(dir, 'collection.zip'), single = path.join(dir, 'Ignite.xml');
    writeFileSync(zip, writeZip([{ name: 'a.xml', data: MHL }, { name: 'b.xml', data: MHL_OTHER_MODE }]));
    writeFileSync(single, IGNITE);
    const { svc } = makeService(dir);
    await svc.init();
    const r = await svc.execute({ type: 'profile.import', paths: [zip, single, path.join(dir, 'absent.xml')] });
    expect(r.imported).toHaveLength(2);
    expect(svc.projectState().library?.some((p) => p.modes.length === 2)).toBe(true);
    await svc.dispose();
  });

  it('profile.openFixtureShare ouvre la fenêtre fournie par l’hôte, sinon explique', async () => {
    const { svc } = makeService();
    await svc.init();
    await expect(svc.execute({ type: 'profile.openFixtureShare' })).rejects.toThrow(/application de bureau/u);
    let opened = 0;
    svc.opts.dialogs.openFixtureShare = () => { opened++; };
    await svc.execute({ type: 'profile.openFixtureShare' });
    expect(opened).toBe(1);
    await svc.dispose();
  });
});

describe('fenêtre MA Fixture Share', () => {
  it('ne garde que les pages MA Lighting en https', () => {
    expect(isFixtureShareUrl('https://fixtureshare.malighting.com/share.php?page=home')).toBe(true);
    expect(isFixtureShareUrl('https://login.malighting.com/auth')).toBe(true);
    expect(isFixtureShareUrl('http://fixtureshare.malighting.com/')).toBe(false);
    expect(isFixtureShareUrl('https://malighting.com.evil.example/')).toBe(false);
    expect(isFixtureShareUrl('https://evilmalighting.com/')).toBe(false);
    expect(isFixtureShareUrl('file:///etc/passwd')).toBe(false);
    expect(isFixtureShareUrl('pas une url')).toBe(false);
  });
});
