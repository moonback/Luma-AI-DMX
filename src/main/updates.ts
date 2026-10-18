import { app } from 'electron';
import electronUpdater from 'electron-updater';
import type { Logger } from '../core/log/logger';
import { DISABLED_UPDATES, type UpdateChannel, type UpdateStatus, type Updater } from '../core/app/updates';

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

/**
 * GitHub-release updates through electron-updater. Downloads run in the background; the new version is installed
 * when the application quits (never a forced restart during a show). Disabled outside a packaged build.
 */
export function createUpdater(logger: () => Logger | null): Updater & { installNow(): boolean } {
  if (!app.isPackaged || process.env.LUMA_E2E) {
    return { status: () => DISABLED_UPDATES, configure: () => undefined, check: async () => DISABLED_UPDATES, installNow: () => false };
  }
  const { autoUpdater } = electronUpdater;
  let status: UpdateStatus = { state: 'idle', version: null, progress: null, detail: null, checkedAt: null };
  let auto = true;
  let timer: NodeJS.Timeout | null = null;
  const set = (patch: Partial<UpdateStatus>) => { status = { ...status, ...patch }; };
  const log = (level: 'info' | 'warn' | 'error', msg: string) => logger()?.[level]('Mise à jour', msg);

  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  autoUpdater.on('checking-for-update', () => set({ state: 'checking', detail: null }));
  autoUpdater.on('update-not-available', () => set({ state: 'up-to-date', version: null, progress: null, checkedAt: new Date().toISOString() }));
  autoUpdater.on('update-available', (info) => {
    set({ state: auto ? 'downloading' : 'idle', version: info.version, progress: 0, checkedAt: new Date().toISOString(), detail: auto ? null : `Version ${info.version} disponible (téléchargement automatique désactivé).` });
    log('info', `Version ${info.version} disponible${auto ? ' : téléchargement en arrière-plan' : ''}`);
  });
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', progress: p.percent / 100 }));
  autoUpdater.on('update-downloaded', (info) => {
    set({ state: 'ready', version: info.version, progress: 1, detail: 'Installée à la fermeture de l’application.' });
    log('info', `Version ${info.version} téléchargée : elle sera installée à la fermeture de l’application`);
  });
  autoUpdater.on('error', (err) => {
    set({ state: 'error', detail: err.message, progress: null });
    log('warn', `Recherche impossible : ${err.message}`);
  });

  const check = async (): Promise<UpdateStatus> => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      set({ state: 'error', detail: (err as Error).message });
    }
    return status;
  };

  return {
    status: () => status,
    configure({ channel, auto: on }: { channel: UpdateChannel; auto: boolean }) {
      auto = on;
      autoUpdater.allowPrerelease = channel === 'beta';
      autoUpdater.channel = channel === 'beta' ? 'beta' : 'latest';
      autoUpdater.autoDownload = on;
      if (timer) clearInterval(timer);
      timer = null;
      if (on) {
        void check();
        timer = setInterval(() => void check(), CHECK_EVERY_MS);
      }
    },
    check,
    /**
     * Quits and runs the downloaded installer with its UI (not silent): as an update it skips the wizard pages and
     * shows its progress bar, then restarts the app. False when nothing is ready, so the caller just quits.
     */
    installNow() {
      if (status.state !== 'ready') return false;
      try {
        autoUpdater.quitAndInstall(false, true);
        return true;
      } catch (err) {
        log('warn', `Installation impossible : ${(err as Error).message}`);
        return false;
      }
    },
  };
}
