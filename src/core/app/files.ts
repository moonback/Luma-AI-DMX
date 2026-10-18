import { promises as fs } from 'node:fs';
import path from 'node:path';
import { serializeProject } from '../project/format';
import { writeFileAtomic } from '../project/store';
import type { AppService } from './AppService';

/* Recent projects and the recovery copy written by the autosave timer. */

export function addRecent(app: AppService, file: string): void {
  app.settings.general.recentProjects = [file, ...app.settings.general.recentProjects.filter((f) => f !== file)].slice(0, 10);
  void app.persistSettings().catch((err: Error) => app.logger.warn('Paramètres', err.message));
}

export function autosaveFile(app: AppService): string {
  return path.join(app.autosaveDir, `${app.project.id}.luma.json`);
}

export async function autosave(app: AppService, force = false): Promise<void> {
  const minutes = app.settings.general.autosaveMinutes;
  if (!app.dirty || (!force && (minutes === 0 || Date.now() - app.lastAutosave < minutes * 60000))) return;
  app.lastAutosave = Date.now();
  try {
    await writeFileAtomic(autosaveFile(app), serializeProject(app.project), false);
    app.logger.debug('Projet', 'Sauvegarde automatique de récupération écrite');
  } catch (err) {
    app.logger.error('Projet', `Sauvegarde automatique impossible : ${(err as Error).message}`);
  }
}

export async function clearAutosave(app: AppService): Promise<void> {
  await fs.rm(autosaveFile(app), { force: true });
}
