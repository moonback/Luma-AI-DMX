import { buildDiagnostic, listCrashDumps } from '../../log/diagnostic';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { writeFileAtomic } from '../../project/store';
import { applyControl } from '../control';
import { DISABLED_UPDATES } from '../updates';
import type { AppService, CommandIn } from '../AppService';

/* Audio input, settings, logs and the diagnostic export. */
export async function handleSystem(app: AppService, cmd: CommandIn<'audio' | 'settings' | 'logs' | 'diagnostic' | 'app'>): Promise<unknown> {
  const ok = { ok: true } as const;
  switch (cmd.type) {
    case 'audio.features':
      app.audio.push(cmd.features, cmd.source);
      return ok;
    case 'audio.armDrop':
      app.audio.armDrop(cmd.on);
      app.logger.info('Audio', cmd.on ? 'GO sur drop prédit ARMÉ (un seul déclenchement)' : 'GO sur drop prédit désarmé');
      return ok;
    case 'audio.config':
      app.mutate((d) => { d.audio = cmd.config; });
      return ok;
    case 'settings.get': return app.getSettings();
    case 'settings.update': {
      const outputsChanged = JSON.stringify(cmd.settings.outputs) !== JSON.stringify(app.settings.outputs);
      app.settings = { ...cmd.settings, sacn: app.settings.sacn };
      app.settings.control.remote.token ??= randomUUID();
      await app.persistSettings();
      app.logger.level = app.settings.logs.level;
      app.engine.updateSettings(app.engineSettings());
      if (outputsChanged) await app.outputs.configure(app.settings.outputs);
      await applyControl(app);
      configureUpdates(app);
      app.logger.info('Paramètres', 'Paramètres enregistrés');
      return ok;
    }
    case 'logs.recent': return app.logger.recent();
    case 'diagnostic.export': {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/gu, '-');
      const file = cmd.path ?? (await app.opts.dialogs.saveDiagnostic?.(`luma-diagnostic-${stamp}.json`)) ?? null;
      if (!file) return { path: null };
      await writeFileAtomic(file, JSON.stringify(diagnostic(app), null, 2), false);
      app.logger.info('Diagnostic', `Exporté : ${path.basename(file)}`);
      return { path: file };
    }
    case 'app.info': {
      const info = app.opts.appInfo;
      return { name: info?.name ?? 'Luma AI DMX', version: info?.version ?? 'dev', updates: app.opts.updater?.status() ?? DISABLED_UPDATES };
    }
    case 'app.checkUpdates':
      return app.opts.updater ? app.opts.updater.check() : DISABLED_UPDATES;
  }
}

/** Applies the update channel and the automatic-update switch from the settings. */
export function configureUpdates(app: AppService): void {
  app.opts.updater?.configure({ channel: app.settings.general.updateChannel, auto: app.settings.general.autoUpdate });
}

/** Support bundle: version, settings and logs, secrets masked, never the project content. */
export function diagnostic(app: AppService) {
  return buildDiagnostic({
    app: app.opts.appInfo ?? { name: 'Luma AI DMX', version: 'dev', platform: process.platform, arch: process.arch, versions: { node: process.versions.node } },
    settings: app.settings,
    project: { name: app.project.meta.name, fixtures: app.project.patch.length, universes: app.project.show.universes, cueLists: app.project.cueLists.length },
    outputs: app.outputs.status().map((o) => ({ ...o })),
    logs: app.logSink?.tail(2000) ?? app.logger.recent(2000).map((e) => JSON.stringify(e)),
    crashDumps: listCrashDumps(app.opts.crashDir),
  });
}
