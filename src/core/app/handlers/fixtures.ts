import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { FixtureProfile } from '../../model/schemas';
import { convertMa2Fixture, mergeProfileModes } from '../../fixtures/ma2';
import { decodeMa2File, loadMa2Library } from '../../fixtures/ma2Library';
import { convertGdtf } from '../../fixtures/gdtf';
import { channelCount, parseProfileFile } from '../../fixtures/profiles';
import { BUILTIN_PROFILES } from '../../fixtures/builtinProfiles';
import { convertOflFixture, oflFetchFixture, oflFixtureKeys, oflManufacturers } from '../../fixtures/ofl';
import { findFreeAddress, validatePatch } from '../../fixtures/patch';
import { SCENE_FIELDS, UserError } from '../shared';
import { patchSheetCsv, patchSheetHtml } from '../../fixtures/patchSheet';
import { installPlanHtml } from '../../fixtures/installPlan';
import type { AppService, CommandIn } from '../AppService';
import { removeFromLibrary, saveToLibrary } from '../library';

/* Fixture profiles (Luma, grandMA2, Open Fixture Library) and the patch. */
export async function handleFixtures(app: AppService, cmd: CommandIn<'profile' | 'ofl' | 'ma2lib' | 'fixture' | 'patch'>): Promise<unknown> {
  const ok = { ok: true } as const;
  switch (cmd.type) {
    case 'profile.import': {
      const file = cmd.path ?? (await app.opts.dialogs.openProfile());
      if (!file) return { imported: [], errors: [], warnings: [] };
      const ext = path.extname(file).toLowerCase();
      if (ext === '.qxf') throw new UserError('Format QLC+ (.qxf) pas encore pris en charge : importez l’export grandMA2 (.xml), un profil Luma (.json) ou passez par Open Fixture Library.');
      let bytes: Buffer;
      try {
        bytes = await fs.readFile(file);
      } catch (err) {
        throw new UserError(`Fichier de profil illisible : ${(err as Error).message}`);
      }
      const text = ext === '.gdtf' ? '' : ext === '.xmlp' ? decodeMa2File(bytes) : bytes.toString('utf8');
      let warnings: string[] = [];
      let parsed: { profiles: FixtureProfile[]; errors: string[] };
      if (ext === '.gdtf') {
        // GDTF: every DMX mode of the file, merged into the existing profile of the same fixture.
        const r = convertGdtf(bytes);
        warnings = r.warnings;
        const existing = r.profile ? app.userProfiles.find((x) => x.id === r.profile!.id) ?? app.project.profiles.find((x) => x.id === r.profile!.id) : undefined;
        parsed = { profiles: r.profile ? [existing ? mergeProfileModes(existing, r.profile) : r.profile] : [], errors: r.errors };
        for (const w of warnings) app.logger.warn('GDTF', `${path.basename(file)} : ${w}`);
      } else if (ext === '.xml' || ext === '.xmlp' || text.trimStart().startsWith('<')) {
        // grandMA2 export: one file = one mode, merged into the existing profile of the same fixture.
        const r = convertMa2Fixture(text);
        warnings = r.warnings;
        const existing = r.profile ? app.userProfiles.find((x) => x.id === r.profile!.id) ?? app.project.profiles.find((x) => x.id === r.profile!.id) : undefined;
        parsed = { profiles: r.profile ? [existing ? mergeProfileModes(existing, r.profile) : r.profile] : [], errors: r.errors };
        for (const w of warnings) app.logger.warn('grandMA2', `${path.basename(file)} : ${w}`);
      } else {
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch (err) {
          throw new UserError(`Fichier de profil illisible : ${(err as Error).message}`);
        }
        const j = json as Record<string, unknown> | null;
        if (j && typeof j === 'object' && 'availableChannels' in j && !('profiles' in j)) {
          throw new UserError('Fichier Open Fixture Library : utilisez « Open Fixture Library › Importer un fichier » pour préciser le fabricant.');
        }
        parsed = parseProfileFile(json);
      }
      const { profiles, errors } = parsed;
      const accepted = profiles.filter((p) => {
        if (BUILTIN_PROFILES.some((b) => b.id === p.id)) {
          errors.push(`Profil « ${p.id} » : identifiant réservé à un profil intégré`);
          return false;
        }
        return true;
      });
      await saveToLibrary(app, accepted);
      if (accepted.length) app.mutate((d) => {
        for (const p of accepted) d.profiles = [...d.profiles.filter((x) => x.id !== p.id), p];
      });
      for (const er of errors) app.logger.warn('Profils', er);
      if (accepted.length) app.logger.info('Profils', `${accepted.length} profil(s) importé(s)`);
      return { imported: accepted.map((p) => p.name), errors, warnings };
    }
    case 'ma2lib.manufacturers': {
      const lib = await loadMa2Library().catch((err: Error) => { throw new UserError(`Bibliothèque grandMA2 illisible : ${err.message}`); });
      return { dir: lib?.dir ?? null, manufacturers: lib ? [...lib.index.keys()].sort() : [] };
    }
    case 'ma2lib.fixtures': {
      const fixtures = (await loadMa2Library())?.index.get(cmd.manufacturer) ?? new Map<string, string[]>();
      return [...fixtures].map(([key, modes]) => ({ key, modes: modes.length })).sort((a, b) => a.key.localeCompare(b.key));
    }
    case 'profile.importMa2Lib': {
      const lib = await loadMa2Library();
      const files = lib?.index.get(cmd.manufacturer)?.get(cmd.fixture);
      if (!lib || !files) throw new UserError('Appareil introuvable dans la bibliothèque grandMA2');
      // Library files: one per mode, merged into one profile (and into the existing one of the same fixture).
      const warnings: string[] = [];
      const errors: string[] = [];
      let profile: FixtureProfile | null = null;
      for (const file of files) {
        let r: ReturnType<typeof convertMa2Fixture>;
        try {
          r = convertMa2Fixture(decodeMa2File(await fs.readFile(path.join(lib.dir, file))));
        } catch (err) {
          r = { profile: null, warnings: [], errors: [(err as Error).message] };
        }
        warnings.push(...r.warnings.map((w) => `${file} : ${w}`));
        errors.push(...r.errors.map((e) => `${file} : ${e}`));
        if (r.profile) profile = profile ? mergeProfileModes(profile, r.profile) : r.profile;
      }
      for (const w of warnings) app.logger.warn('grandMA2', w);
      if (!profile) {
        app.logger.error('grandMA2', `${cmd.manufacturer}@${cmd.fixture} : conversion impossible — ${errors.join(' ; ')}`);
        return { imported: null, profileId: null, warnings, errors };
      }
      const id = profile.id;
      if (BUILTIN_PROFILES.some((b) => b.id === id)) throw new UserError(`Profil « ${id} » : identifiant réservé à un profil intégré`);
      const existing = app.userProfiles.find((x) => x.id === id) ?? app.project.profiles.find((x) => x.id === id);
      const merged = existing ? mergeProfileModes(existing, profile) : profile;
      await saveToLibrary(app, [merged]);
      app.mutate((d) => { d.profiles = [...d.profiles.filter((x) => x.id !== id), merged]; });
      app.logger.info('grandMA2', `Profil importé : ${merged.manufacturer} ${merged.name} (${merged.modes.length} mode(s))`);
      return { imported: `${merged.manufacturer} ${merged.name}`, profileId: id, warnings, errors };
    }
    case 'ofl.manufacturers':
      return oflManufacturers().catch((err: Error) => { throw new UserError(`Open Fixture Library inaccessible : ${err.message}`); });
    case 'ofl.fixtures':
      return oflFixtureKeys(cmd.manufacturer).catch((err: Error) => { throw new UserError(`Open Fixture Library inaccessible : ${err.message}`); });
    case 'profile.importOfl': {
      let json: unknown;
      let manufacturer: string;
      let key: string;
      if (cmd.source.kind === 'online') {
        const src = cmd.source;
        try {
          json = await oflFetchFixture(src.manufacturer, src.key);
          manufacturer = (await oflManufacturers().catch(() => [])).find((m) => m.key === src.manufacturer)?.name ?? src.manufacturer;
        } catch (err) {
          throw new UserError(`Téléchargement impossible : ${(err as Error).message}`);
        }
        key = src.key;
      } else {
        const file = cmd.source.path ?? (await app.opts.dialogs.openProfile());
        if (!file) return { imported: null, profileId: null, warnings: [], errors: [] };
        try {
          json = JSON.parse(await fs.readFile(file, 'utf8'));
        } catch (err) {
          throw new UserError(`Fichier OFL illisible : ${(err as Error).message}`);
        }
        manufacturer = cmd.source.manufacturerName;
        key = path.basename(file).replace(/.json$/i, '');
      }
      const r = convertOflFixture(json, { manufacturer, key });
      for (const w of r.warnings) app.logger.warn('OFL', `${key} : ${w}`);
      if (!r.profile) {
        app.logger.error('OFL', `${key} : conversion impossible — ${r.errors.join(' ; ')}`);
        return { imported: null, profileId: null, warnings: r.warnings, errors: r.errors };
      }
      const profile = r.profile;
      await saveToLibrary(app, [profile]);
      app.mutate((d) => { d.profiles = [...d.profiles.filter((x) => x.id !== profile.id), profile]; });
      app.logger.info('OFL', `Profil importé : ${profile.manufacturer} ${profile.name} (${profile.modes.length} mode(s))`);
      return { imported: `${profile.manufacturer} ${profile.name}`, profileId: profile.id, warnings: r.warnings, errors: r.errors };
    }
    case 'profile.remove': {
      const used = app.project.patch.filter((f) => f.profileId === cmd.id);
      if (used.length) throw new UserError(`Profil utilisé par ${used.length} projecteur(s)`);
      await removeFromLibrary(app, cmd.id);
      app.mutate((d) => { d.profiles = d.profiles.filter((p) => p.id !== cmd.id); });
      return ok;
    }
    case 'profile.export': {
      const profiles = cmd.ids ? app.userProfiles.filter((p) => cmd.ids!.includes(p.id)) : app.userProfiles;
      if (!profiles.length) throw new UserError('Aucun profil à exporter');
      const base = (profiles.length === 1 ? `${profiles[0]!.manufacturer} ${profiles[0]!.name}` : 'profils').replace(/[\\/:*?"<>|]/gu, '_');
      const file = cmd.path ?? (await app.opts.dialogs.saveProfiles?.(`${base}.json`)) ?? null;
      if (!file) return { path: null, count: 0 };
      await fs.writeFile(file, `${JSON.stringify({ profiles }, null, 2)}\n`, 'utf8');
      app.logger.info('Profils', `${profiles.length} profil(s) exporté(s) : ${path.basename(file)}`);
      return { path: file, count: profiles.length };
    }
    case 'profile.save': {
      const profile = cmd.profile;
      if (BUILTIN_PROFILES.some((b) => b.id === profile.id)) throw new UserError(`Profil « ${profile.id} » : identifiant réservé à un profil intégré`);
      await saveToLibrary(app, [profile]);
      app.mutate((d) => { d.profiles = [...d.profiles.filter((x) => x.id !== profile.id), profile]; });
      app.logger.info('Profils', `Profil enregistré : ${profile.manufacturer} ${profile.name} (${profile.modes.length} mode(s))`);
      return { profileId: profile.id };
    }
    case 'fixture.add': {
      const profile = app.index.lib.get(cmd.profileId);
      if (!profile) throw new UserError('Profil inconnu');
      const count = channelCount(profile, cmd.mode);
      if (!count) throw new UserError(`Mode « ${cmd.mode} » inconnu pour ce profil`);
      const ids: string[] = [];
      const existingNames = new Set(app.project.patch.map((f) => f.name));
      app.mutate((d) => {
        let next = cmd.address ?? 1;
        const moving = profile.type.startsWith('moving');
        let n = 1;
        for (let i = 0; i < cmd.count; i++) {
          const addr = cmd.address !== null && i === 0 ? cmd.address : findFreeAddress(app.index.lib, d.patch, cmd.universe, count, next);
          if (addr === undefined || addr + count - 1 > 512) throw new UserError(`Plus de place dans l’univers ${cmd.universe} pour ${count} canaux (projecteur ${i + 1}/${cmd.count})`);
          while (existingNames.has(`${cmd.namePrefix} ${n}`)) n++;
          const name = `${cmd.namePrefix} ${n}`;
          existingNames.add(name);
          const id = randomUUID();
          ids.push(id);
          const w = d.visualizer.stageWidth;
          d.patch.push({
            id, name, profileId: profile.id, mode: cmd.mode, universe: cmd.universe, address: addr, tags: cmd.tags,
            position: { x: Math.round((-w / 2 + ((i + 0.5) * w) / cmd.count) * 10) / 10, y: moving ? d.visualizer.stageDepth * 0.7 : d.visualizer.stageDepth * 0.25 },
            rotation: 0, height: moving ? 6 : 4, notes: '',
          });
          next = addr + count;
        }
        const overlaps = validatePatch(app.index.lib, d.patch).filter((iss) => iss.kind === 'overlap' && iss.fixtureIds.some((x) => ids.includes(x)));
        if (overlaps.length) throw new UserError(overlaps[0]!.message);
      });
      app.logger.info('Patch', `${ids.length} × ${profile.name} ajouté(s) (univers ${cmd.universe})`);
      return { ids };
    }
    case 'fixture.update':
      (SCENE_FIELDS.some((k) => cmd.patch[k] !== undefined) ? app.sceneMutate.bind(app) : app.mutate.bind(app))((d) => {
        const f = d.patch.find((x) => x.id === cmd.id);
        if (!f) throw new UserError('Projecteur introuvable');
        Object.assign(f, Object.fromEntries(Object.entries(cmd.patch).filter(([, v]) => v !== undefined)));
        if (f.trussId && !d.visualizer.trusses.some((t) => t.id === f.trussId)) throw new UserError('Structure introuvable');
        const profile = app.index.lib.get(f.profileId);
        if (!profile || !profile.modes.some((m) => m.name === f.mode)) throw new UserError('Profil ou mode invalide');
        const issues = validatePatch(app.index.lib, d.patch).filter((i) => i.fixtureIds.includes(f.id));
        if (issues.length) throw new UserError(issues[0]!.message);
      });
      return ok;
    case 'fixture.remove': {
      const ids = new Set(cmd.ids);
      app.engine.releaseProgrammer(cmd.ids);
      app.mutate((d) => {
        d.patch = d.patch.filter((f) => !ids.has(f.id));
        for (const g of d.groups) g.fixtureIds = g.fixtureIds.filter((x) => !ids.has(x));
        for (const s of d.scenes) for (const id of ids) delete s.values[id];
        for (const ef of d.effects) ef.targets.fixtureIds = ef.targets.fixtureIds.filter((x) => !ids.has(x));
      });
      return ok;
    }
    case 'fixture.place':
      app.sceneMutate((d) => {
        for (const p of cmd.placements) {
          const f = d.patch.find((x) => x.id === p.id);
          if (!f) throw new UserError('Projecteur introuvable');
          if (p.trussId && !d.visualizer.trusses.some((t) => t.id === p.trussId)) throw new UserError('Structure introuvable');
          Object.assign(f, { position: p.position, height: p.height, trussId: p.trussId }, p.mount ? { mount: p.mount } : {}, p.rotation !== undefined ? { rotation: p.rotation } : {});
        }
      });
      return ok;
    case 'fixture.duplicate': {
      const out: string[] = [];
      app.mutate((d) => {
        for (const id of cmd.ids) {
          const src = d.patch.find((f) => f.id === id);
          if (!src) continue;
          const profile = app.index.lib.get(src.profileId)!;
          const addr = findFreeAddress(app.index.lib, d.patch, src.universe, channelCount(profile, src.mode), src.address);
          if (addr === undefined) throw new UserError(`Plus de place dans l’univers ${src.universe}`);
          const nid = randomUUID();
          out.push(nid);
          d.patch.push({ ...structuredClone(src), id: nid, name: `${src.name} (copie)`.slice(0, 80), address: addr, position: { x: src.position.x + 0.5, y: src.position.y } });
        }
      });
      return { ids: out };
    }
    case 'patch.exportSheet': {
      const base = `${app.project.meta.name} - patch`.replace(/[\\/:*?"<>|]/gu, '_');
      const file = cmd.path ?? (await app.opts.dialogs.savePatchSheet?.(`${base}.${cmd.format}`, cmd.format)) ?? null;
      if (!file) return { path: null };
      if (cmd.format === 'csv') await fs.writeFile(file, patchSheetCsv(app.project), 'utf8');
      else {
        if (!app.opts.renderPdf) throw new UserError('Export PDF indisponible ici : exportez en CSV.');
        await fs.writeFile(file, await app.opts.renderPdf(patchSheetHtml(app.project)));
      }
      app.logger.info('Patch', `Feuille de patch exportée : ${path.basename(file)}`);
      return { path: file };
    }
    case 'patch.exportPlan': {
      const base = `${app.project.meta.name} - plan d'installation`.replace(/[\\/:*?"<>|]/gu, '_');
      const file = cmd.path ?? (await app.opts.dialogs.savePatchPlan?.(`${base}.pdf`)) ?? null;
      if (!file) return { path: null };
      if (!app.opts.renderPdf) throw new UserError('Export PDF indisponible ici : le plan d’installation nécessite le moteur de rendu.');
      await fs.writeFile(file, await app.opts.renderPdf(installPlanHtml(app.project, app.settings.outputs)));
      app.logger.info('Patch', `Plan d’installation exporté : ${path.basename(file)}`);
      return { path: file };
    }
  }
}
