import type { FixtureValues } from '../../model/schemas';
import { colorToAttributes } from '../../fixtures/color';
import { buildSequence, FRAME_CAPTURE_MS, FRAME_SETTLE_MS } from '../../vision/locate';
import { coarseChannel, rangeValue } from '../../fixtures/profiles';
import { UserError } from '../shared';
import type { AppService, CommandIn } from '../AppService';

/* Camera localisation: the safe light sequence and the smartphone photos. */
export async function handleLocate(app: AppService, cmd: CommandIn<'locate'>): Promise<unknown> {
  const ok = { ok: true } as const;
  const e = app.engine;
  switch (cmd.type) {
    case 'locate.begin': {
      if (e.blackout) throw new UserError('Désactivez le blackout : la caméra doit voir les projecteurs');
      const ids = (cmd.fixtureIds ?? [...app.index.fixtures.keys()]).filter((id) => app.index.fixtures.has(id));
      if (!ids.length) throw new UserError('Aucun projecteur à localiser');
      // Manual control would win over the localisation pattern: release it (stated in the confirmation dialog).
      e.releaseProgrammer();
      const seq = buildSequence(ids, cmd.mode);
      app.locate = { seq, level: cmd.level, frame: 0, photo: cmd.photo, awaitingPhoto: false };
      showLocateFrame(app, 0);
      app.logger.warn('Localisation', `Séquence caméra démarrée : ${ids.length} projecteurs, ${seq.frames.length} images (${cmd.mode === 'binary' ? 'codage binaire' : 'un par un'}), intensité ${Math.round(cmd.level * 100)} %, sans strobe${cmd.photo ? ', photos smartphone' : ''}`);
      return { fixtureIds: ids, frames: seq.frames, codes: seq.codes, mode: seq.mode, bits: seq.bits, settleMs: FRAME_SETTLE_MS, captureMs: FRAME_CAPTURE_MS };
    }
    case 'locate.frame':
      if (!app.locate) throw new UserError('Aucune séquence de localisation en cours');
      if (cmd.index >= app.locate.seq.frames.length) throw new UserError('Image hors séquence');
      showLocateFrame(app, cmd.index);
      return ok;
    case 'locate.end':
      if (app.locate) app.logger.info('Localisation', 'Séquence caméra terminée — projecteurs rendus aux autres sources');
      endLocate(app);
      return ok;
    case 'locate.apply': {
      const ids = new Set(app.project.patch.map((f) => f.id));
      const updates = cmd.updates.filter((u) => ids.has(u.fixtureId));
      app.mutate((d) => {
        for (const u of updates) {
          const f = d.patch.find((x) => x.id === u.fixtureId)!;
          f.position = { x: Math.round(u.x * 100) / 100, y: Math.round(u.y * 100) / 100 };
          if (u.height !== undefined) f.height = Math.round(u.height * 100) / 100;
        }
      });
      app.logger.info('Localisation', `${updates.length} position(s) de projecteur mise(s) à jour depuis la caméra`);
      return { updated: updates.length };
    }
  }
}

/**
 * Localisation pattern: a top-priority layer that darkens every fixture except the lit ones, which get white light at
 * the capped level with shutter/strobe forced open (never strobing). Pan/tilt are left untouched.
 */
export function showLocateFrame(app: AppService, index: number): void {
  const s = app.locate!;
  s.frame = index;
  const lit = new Set(s.seq.frames[index]!.lit);
  const values: FixtureValues = {};
  for (const [id, rf] of app.index.fixtures) {
    const on = lit.has(id);
    const v: Record<string, number> = { dimmer: on ? s.level : 0 };
    if (on) Object.assign(v, colorToAttributes(rf, { r: 1, g: 1, b: 1 }));
    for (const a of ['shutter', 'strobe']) {
      const ch = coarseChannel(rf.mode, a);
      if (ch) v[a] = rangeValue(ch, 'open') ?? ch.default / 255;
    }
    values[id] = v;
  }
  app.engine.setExternal('locate', { layer: { id: 'locate', label: 'Localisation caméra', kind: 'locate', priority: 1000, order: 0, values } });
  s.awaitingPhoto = s.photo;
  app.emit('runtime', app.runtimeState());
}

export function endLocate(app: AppService): void {
  app.engine.setExternal('locate', null);
  app.locate = null;
}

export function onLocatePhoto(app: AppService, frame: number, jpeg: Buffer): boolean {
  const s = app.locate;
  if (!s?.photo || !s.awaitingPhoto || frame !== s.frame) return false;
  s.awaitingPhoto = false;
  app.emit('locatePhoto', { frame, jpeg: jpeg.toString('base64') });
  return true;
}
