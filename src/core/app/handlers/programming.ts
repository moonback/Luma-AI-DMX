import { randomUUID } from 'node:crypto';
import type { FixtureValues } from '../../model/schemas';
import { attributeClass } from '../../fixtures/attributes';
import { colorToAttributes } from '../../fixtures/color';
import { findModule } from '../../fixtures/modules';
import { hexToRgb } from '../../util/math';
import { UserError } from '../shared';
import type { AppService, CommandIn } from '../AppService';

/* Programming objects: groups, palettes, programmer, scenes, cue lists, effects, timelines and scene-layout undo. */
export async function handleProgramming(app: AppService, cmd: CommandIn<'group' | 'palette' | 'programmer' | 'scene' | 'cue' | 'cueList' | 'effect' | 'timeline'>): Promise<unknown> {
  const ok = { ok: true } as const;
  const e = app.engine;
  switch (cmd.type) {
    case 'scene.undo':
    case 'scene.redo': {
      const from = cmd.type === 'scene.undo' ? app.sceneUndo : app.sceneRedo;
      const to = cmd.type === 'scene.undo' ? app.sceneRedo : app.sceneUndo;
      const snap = from.pop();
      if (!snap) return ok;
      to.push(app.sceneSnapshot());
      app.restoreScene(snap);
      return ok;
    }
    case 'group.upsert':
      app.mutate((d) => {
        const g = { ...cmd.group, fixtureIds: cmd.group.fixtureIds.filter((id) => app.index.fixtures.has(id)) };
        d.groups = d.groups.some((x) => x.id === g.id) ? d.groups.map((x) => (x.id === g.id ? g : x)) : [...d.groups, g];
      });
      return ok;
    case 'group.remove':
      app.mutate((d) => {
        d.groups = d.groups.filter((g) => g.id !== cmd.id);
        for (const ef of d.effects) ef.targets.groupIds = ef.targets.groupIds.filter((x) => x !== cmd.id);
      });
      return ok;
    case 'group.reorder':
      app.mutate((d) => {
        const rank = new Map(cmd.ids.map((id, i) => [id, i]));
        d.groups.sort((x, y) => (rank.get(x.id) ?? 1e9) - (rank.get(y.id) ?? 1e9));
      });
      return ok;
    case 'palette.upsert':
      app.mutate((d) => { d.palettes = d.palettes.some((x) => x.id === cmd.palette.id) ? d.palettes.map((x) => (x.id === cmd.palette.id ? cmd.palette : x)) : [...d.palettes, cmd.palette]; });
      return ok;
    case 'palette.remove':
      app.mutate((d) => { d.palettes = d.palettes.filter((p) => p.id !== cmd.id); });
      return ok;
    case 'palette.apply': {
      const pal = app.project.palettes.find((p) => p.id === cmd.id);
      if (!pal) throw new UserError('Palette introuvable');
      let applied = 0;
      for (const fid of cmd.fixtureIds) {
        const rf = app.index.fixtures.get(fid);
        if (!rf) continue;
        const vals: Record<string, number> = {};
        if (pal.color) Object.assign(vals, colorToAttributes(rf, hexToRgb(pal.color)));
        for (const [a, v] of Object.entries(pal.values)) if (a === 'dimmer' || rf.attributes.includes(a)) vals[a] = v;
        applied += e.setProgrammer([fid], vals).applied;
      }
      return { applied };
    }
    case 'palette.recordFromProgrammer': {
      const prog = e.getProgrammer()[cmd.fixtureId];
      if (!prog) throw new UserError('Ce projecteur n’a aucune valeur dans le programmeur');
      const cls = cmd.kind === 'color' ? ['color'] : cmd.kind === 'position' ? ['position'] : cmd.kind === 'intensity' ? ['intensity'] : ['beam'];
      const values = Object.fromEntries(Object.entries(prog).filter(([a]) => cls.includes(attributeClass(a))));
      if (!Object.keys(values).length) throw new UserError('Aucune valeur de ce type dans le programmeur pour ce projecteur');
      const id = randomUUID();
      app.mutate((d) => { d.palettes.push({ id, name: cmd.name, kind: cmd.kind, values }); });
      return { id };
    }
    case 'programmer.set':
      return e.setProgrammer(cmd.fixtureIds, cmd.values, { confirmSpecial: cmd.confirmSpecial });
    case 'programmer.setColor': {
      let applied = 0;
      for (const fid of cmd.fixtureIds) {
        const rf = app.index.fixtures.get(fid);
        // A fixture without the requested head (module) is left untouched.
        const mod = cmd.module !== undefined && rf ? findModule(rf.profile, cmd.module) : undefined;
        if (rf && (cmd.module === undefined || mod)) applied += e.setProgrammer([fid], colorToAttributes(rf, hexToRgb(cmd.color), cmd.cell, mod)).applied;
      }
      return { applied };
    }
    case 'programmer.release':
      e.releaseProgrammer(cmd.fixtureIds, cmd.attributes);
      return ok;
    case 'scene.record': {
      const prog = e.getProgrammer();
      const values: FixtureValues = cmd.fixtureIds ? Object.fromEntries(Object.entries(prog).filter(([id]) => cmd.fixtureIds!.includes(id))) : prog;
      if (!Object.keys(values).length) throw new UserError('Le programmeur est vide : réglez des projecteurs dans la Live Console avant d’enregistrer.');
      const id = randomUUID();
      app.mutate((d) => { d.scenes.push({ id, name: cmd.name, notes: '', values, origin: 'user' }); });
      app.logger.info('Scènes', `Scène « ${cmd.name} » enregistrée (${Object.keys(values).length} projecteurs)`);
      return { id };
    }
    case 'scene.upsert':
      app.mutate((d) => { d.scenes = d.scenes.some((s) => s.id === cmd.scene.id) ? d.scenes.map((s) => (s.id === cmd.scene.id ? cmd.scene : s)) : [...d.scenes, cmd.scene]; });
      return ok;
    case 'scene.remove':
      app.mutate((d) => {
        d.scenes = d.scenes.filter((s) => s.id !== cmd.id);
        for (const l of d.cueLists) for (const c of l.cues) if (c.sceneId === cmd.id) c.sceneId = null;
        for (const t of d.timelines) t.events = t.events.filter((ev) => !(ev.kind === 'scene' && ev.refId === cmd.id));
      });
      return ok;
    case 'scene.duplicate': {
      const src = app.project.scenes.find((s) => s.id === cmd.id);
      if (!src) throw new UserError('Scène introuvable');
      const id = randomUUID();
      app.mutate((d) => { d.scenes.push({ ...structuredClone(src), id, name: `${src.name} (copie)`.slice(0, 80) }); });
      return { id };
    }
    case 'scene.load': {
      const s = app.index.scenes.get(cmd.id);
      if (!s) throw new UserError('Scène introuvable');
      for (const [fid, vals] of Object.entries(s.values)) e.setProgrammer([fid], vals);
      return ok;
    }
    case 'scene.preview': {
      const s = app.index.scenes.get(cmd.id);
      if (!s) throw new UserError('Scène introuvable');
      return { values: e.compute(s.values).values };
    }
    case 'cueList.upsert':
      for (const c of cmd.cueList.cues) {
        if (c.sceneId && !app.index.scenes.has(c.sceneId)) throw new UserError(`Cue « ${c.name} » : scène inconnue`);
        for (const fx of c.effectIds) if (!app.index.effects.has(fx)) throw new UserError(`Cue « ${c.name} » : effet inconnu`);
      }
      app.mutate((d) => { d.cueLists = d.cueLists.some((l) => l.id === cmd.cueList.id) ? d.cueLists.map((l) => (l.id === cmd.cueList.id ? cmd.cueList : l)) : [...d.cueLists, cmd.cueList]; });
      return ok;
    case 'cueList.remove':
      e.cueStop(cmd.id);
      app.mutate((d) => {
        d.cueLists = d.cueLists.filter((l) => l.id !== cmd.id);
        for (const t of d.timelines) t.events = t.events.filter((ev) => !(ev.kind === 'cue' && ev.refId === cmd.id));
        // Audio reactions aimed at this list would otherwise fire GO into nothing, silently.
        const r = d.audio.reactions;
        if (r.energyRiseGo.cueListId === cmd.id) r.energyRiseGo.cueListId = null;
        if (r.dropGo.cueListId === cmd.id) r.dropGo.cueListId = null;
      });
      return ok;
    case 'cue.go': return { ok: e.cueGo(cmd.listId) };
    case 'cue.back': return { ok: e.cueBack(cmd.listId) };
    case 'cue.goto': return { ok: e.cueGoto(cmd.listId, cmd.index) };
    case 'cue.pause': e.cuePause(cmd.listId); return ok;
    case 'cue.resume': e.cueResume(cmd.listId); return ok;
    case 'cue.stop': e.cueStop(cmd.listId); return ok;
    case 'effect.upsert':
      app.mutate((d) => { d.effects = d.effects.some((x) => x.id === cmd.effect.id) ? d.effects.map((x) => (x.id === cmd.effect.id ? cmd.effect : x)) : [...d.effects, cmd.effect]; });
      return ok;
    case 'effect.remove':
      e.stopEffectById(cmd.id);
      app.mutate((d) => {
        d.effects = d.effects.filter((x) => x.id !== cmd.id);
        for (const l of d.cueLists) for (const c of l.cues) c.effectIds = c.effectIds.filter((x) => x !== cmd.id);
        for (const t of d.timelines) t.events = t.events.filter((ev) => !(ev.kind === 'effect' && ev.refId === cmd.id));
      });
      return ok;
    case 'effect.start': {
      const id = e.startEffect(cmd.id, 'manual');
      if (!id) throw new UserError('Effet introuvable');
      return { instanceId: id };
    }
    case 'effect.stop': e.stopEffect(cmd.instanceId); return ok;
    case 'effect.pause': e.setEffectPaused(cmd.instanceId, cmd.paused); return ok;
    case 'effect.stopAll': e.stopAllEffects(); return ok;
    case 'timeline.upsert':
      for (const ev of cmd.timeline.events) {
        const exists = ev.kind === 'marker' || (ev.kind === 'scene' ? app.index.scenes.has(ev.refId!) : ev.kind === 'effect' ? app.index.effects.has(ev.refId!) : app.index.cueLists.has(ev.refId!));
        if (!exists) throw new UserError(`Événement « ${ev.label || ev.kind} » : référence inconnue`);
      }
      app.mutate((d) => { d.timelines = d.timelines.some((t) => t.id === cmd.timeline.id) ? d.timelines.map((t) => (t.id === cmd.timeline.id ? cmd.timeline : t)) : [...d.timelines, cmd.timeline]; });
      return ok;
    case 'timeline.remove':
      e.timelineStop();
      app.mutate((d) => { d.timelines = d.timelines.filter((t) => t.id !== cmd.id); });
      return ok;
    case 'timeline.play':
      if (!e.timelinePlay(cmd.id)) throw new UserError('Timeline introuvable');
      return ok;
    case 'timeline.pause': e.timelinePause(); return ok;
    case 'timeline.stop': e.timelineStop(); return ok;
    case 'timeline.seek': e.timelineSeek(cmd.seconds); return ok;
    case 'timeline.timecode': {
      const id = cmd.timelineId ?? e.snapshot().timeline.timelineId ?? app.project.timelines[0]?.id;
      const chasing = !!id && e.timelineChase(id, cmd.seconds);
      if (chasing) app.timecodeAt = Date.now();
      return { chasing };
    }
  }
}
