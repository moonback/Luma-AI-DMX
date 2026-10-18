import path from 'node:path';
import type { Project } from '../../model/schemas';
import { createProject, ProjectLoadError } from '../../project/format';
import { buildDemo } from '../../demo/projects';
import { listRecovery, loadProjectFile, saveProjectFile } from '../../project/store';
import { followTruss } from '../../visualizer/truss';
import { UserError } from '../shared';
import { addRecent, clearAutosave } from '../files';
import type { AppService, CommandIn } from '../AppService';

/* Project documents: new/open/save/export, demos, recovery, onboarding. */
export async function handleProject(app: AppService, cmd: CommandIn<'project' | 'onboarding'>): Promise<unknown> {
  const ok = { ok: true } as const;
  const e = app.engine;
  switch (cmd.type) {
    case 'project.get': return app.projectState();
    case 'project.new':
      app.setProject(createProject(cmd.name), true);
      app.projectPath = null;
      app.logger.info('Projet', `Nouveau projet « ${cmd.name} »`);
      app.emitProject();
      return ok;
    case 'project.open':
    case 'project.openRecovery': {
      const file = cmd.type === 'project.open' ? cmd.path ?? (await app.opts.dialogs.openProject()) : cmd.file;
      if (!file) return { opened: false, migratedFrom: null };
      try {
        const { project, migratedFrom } = await loadProjectFile(file);
        app.setProject(project, true);
        app.projectPath = cmd.type === 'project.open' ? file : null;
        if (cmd.type === 'project.open') addRecent(app, file);
        app.logger.info('Projet', `Ouvert : ${path.basename(file)}${migratedFrom ? ` (migré depuis le format v${migratedFrom})` : ''}`);
        if (cmd.type === 'project.openRecovery') app.revision++; // recovered data is unsaved until saved explicitly
        app.emitProject();
        return { opened: true, migratedFrom };
      } catch (err) {
        if (err instanceof ProjectLoadError) {
          app.logger.error('Projet', `${err.message}${err.details.length ? ` — ${err.details.slice(0, 3).join(' ; ')}` : ''}`);
          throw new UserError(`${err.message}${err.kind === 'corrupt-json' || err.kind === 'invalid-format' ? '. Une copie de récupération est peut-être disponible (Paramètres › Sauvegardes).' : ''}`);
        }
        throw err;
      }
    }
    case 'project.save':
      if (!app.projectPath) return app.handle({ type: 'project.saveAs' });
      await saveProjectFile(app.projectPath, app.project);
      app.savedRevision = app.revision;
      await clearAutosave(app);
      app.logger.info('Projet', `Enregistré : ${path.basename(app.projectPath)}`);
      app.emitProject();
      return { path: app.projectPath };
    case 'project.saveAs':
    case 'project.export': {
      const file = cmd.path ?? (await app.opts.dialogs.saveProject(app.project.meta.name));
      if (!file) return { path: null };
      await saveProjectFile(file, app.project);
      if (cmd.type === 'project.saveAs') {
        app.projectPath = file;
        app.savedRevision = app.revision;
        addRecent(app, file);
        await clearAutosave(app);
      }
      app.logger.info('Projet', `${cmd.type === 'project.export' ? 'Exporté' : 'Enregistré'} : ${path.basename(file)}`);
      app.emitProject();
      return { path: file };
    }
    case 'project.update':
      (cmd.visualizer ? app.sceneMutate.bind(app) : app.mutate.bind(app))((d) => {
        if (cmd.visualizer?.trusses) {
          // Hung fixtures follow their truss; fixtures of a removed truss stay in place, detached.
          const next = new Map(cmd.visualizer.trusses.map((t) => [t.id, t]));
          for (const before of d.visualizer.trusses) {
            const after = next.get(before.id);
            for (const f of d.patch) {
              if (f.trussId !== before.id) continue;
              if (!after) f.trussId = null;
              else Object.assign(f, followTruss(before, after, f));
            }
          }
        }
        if (cmd.meta) Object.assign(d.meta, Object.fromEntries(Object.entries(cmd.meta).filter(([, v]) => v !== undefined)));
        if (cmd.show) Object.assign(d.show, Object.fromEntries(Object.entries(cmd.show).filter(([, v]) => v !== undefined)));
        if (cmd.visualizer) Object.assign(d.visualizer, Object.fromEntries(Object.entries(cmd.visualizer).filter(([, v]) => v !== undefined)));
      });
      if (cmd.show?.bpm) e.bpm = cmd.show.bpm;
      return ok;
    case 'project.openDemo': {
      let demo: Project;
      try {
        demo = buildDemo(cmd.id);
      } catch (err) {
        throw new UserError((err as Error).message);
      }
      app.setProject(demo, true);
      app.projectPath = null;
      app.revision++; // an unsaved copy: « Enregistrer » asks for a file name
      app.logger.info('Projet', `Projet de démonstration ouvert : « ${demo.meta.name} » (fictif)`);
      app.emitProject();
      return ok;
    }
    case 'onboarding.update':
      app.settings.onboarding = { ...app.settings.onboarding, ...Object.fromEntries(Object.entries({ completed: cmd.completed, checklistHidden: cmd.checklistHidden }).filter(([, v]) => v !== undefined)) };
      await app.persistSettings();
      return ok;
    case 'project.listRecovery':
      return listRecovery(app.autosaveDir, app.projectPath);
  }
}
