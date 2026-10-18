import { createHash } from 'node:crypto';
import type { Project } from '../model/schemas';
import { ProfileLibrary } from '../fixtures/profiles';
import { writeZip } from '../util/zip';

/**
 * MVR export (My Virtual Rig, DIN SPEC 15801): the patch and the fixture positions as a GeneralSceneDescription.xml
 * in a ZIP, for Capture, Vectorworks, grandMA3… Fixture types are referenced by name (« Manufacturer@Model.gdtf »):
 * no GDTF file is embedded, the receiving software maps them to its own library.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** Stable UUID for ids that are not already UUIDs (demo projects). */
export function asUuid(id: string): string {
  if (UUID_RE.test(id)) return id.toUpperCase();
  const h = createHash('sha1').update(`luma:${id}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`.toUpperCase();
}
const esc = (s: string) => s.replace(/[&<>"']/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const mm = (m: number) => Math.round(m * 1000);
const f6 = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e6) / 1e6);

/** MVR 4x3 matrix: rotation about the vertical axis, hung fixtures upside down, offset in millimetres. */
function matrix(x: number, y: number, z: number, rotationDeg: number, hanging: boolean): string {
  const a = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a), k = hanging ? -1 : 1;
  const u = [c, s, 0], v = [-s * k, c * k, 0], w = [0, 0, k];
  return [u, v, w].map((r) => `{${r.map(f6).join(',')}}`).join('') + `{${mm(x)},${mm(y)},${mm(z)}}`;
}

export function mvrScene(project: Project): string {
  const lib = new ProfileLibrary(project.profiles);
  const fixtures = project.patch.map((f, i) => {
    const p = lib.get(f.profileId);
    const spec = `${p?.manufacturer ?? 'Unknown'}@${p?.name ?? f.profileId}`.replace(/[\\/:*?"<>|]/gu, '_');
    const hanging = f.mount === 'hanging' || (f.mount !== 'floor' && f.mount !== 'wall' && f.height > 2.5);
    return `        <Fixture name="${esc(f.name)}" uuid="${asUuid(f.id)}">
          <Matrix>${matrix(f.position.x, f.position.y, f.height, f.rotation, hanging)}</Matrix>
          <GDTFSpec>${esc(spec)}.gdtf</GDTFSpec>
          <GDTFMode>${esc(f.mode)}</GDTFMode>
          <FixtureID>${i + 1}</FixtureID>
          <UnitNumber>${i + 1}</UnitNumber>
          <Addresses><Address break="0">${(f.universe - 1) * 512 + f.address}</Address></Addresses>
        </Fixture>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<GeneralSceneDescription verMajor="1" verMinor="5" provider="Luma AI DMX" providerVersion="1">
  <UserData/>
  <Scene>
    <AUXData/>
    <Layers>
      <Layer name="${esc(project.meta.name)}" uuid="${asUuid(`${project.id}:layer`)}">
        <ChildList>
${fixtures.join('\n')}
        </ChildList>
      </Layer>
    </Layers>
  </Scene>
</GeneralSceneDescription>
`;
}

export function exportMvr(project: Project): Uint8Array {
  return writeZip([{ name: 'GeneralSceneDescription.xml', data: Buffer.from(mvrScene(project), 'utf8') }]);
}
