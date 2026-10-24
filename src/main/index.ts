import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, crashReporter, dialog, ipcMain, session, shell } from 'electron';
import { AppService } from '../core/app/AppService';
import type { AppEvents } from '../shared/commands';
import { BRAND } from '../shared/brand';
import { createSecretStore } from './secrets';
import { createUpdater } from './updates';
import { handleCommand, isTrustedSender as isTrusted } from './ipc';
import { openFixtureShare } from './fixtureShare';
import { discardAutosaveSync } from '../core/app/files';
import type { Logger } from '../core/log/logger';
import { LICENSE_PUBLIC_KEY } from '../core/license/publicKey';
import icon from '../../resources/icon.png?asset';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.ELECTRON_RENDERER_URL;

// Isolated profile for automated tests.
if (process.env.LUMA_USER_DATA) app.setPath('userData', process.env.LUMA_USER_DATA);

app.setName(BRAND.productName);
// A second instance only hands focus to the first: it must not open outputs, sockets or windows while quitting.
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();

// Native crashes leave a minidump in userData/Crashpad; nothing is ever uploaded.
crashReporter.start({ uploadToServer: false });

let win: BrowserWindow | null = null;
let service: AppService | null = null;
let updater: ReturnType<typeof createUpdater> | null = null;
let quitting = false;

const projectFilters = [{ name: BRAND.productName, extensions: ['json'] }];

const isTrustedSender = (url: string) => isTrusted(url, DEV_URL);

/** App events go to the app's own windows only, never to an external page (MA Fixture Share window). */
function sendEvent<K extends keyof AppEvents>(name: K, payload: AppEvents[K]): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && isTrustedSender(w.webContents.getURL())) w.webContents.send('luma:event', name, payload);
}

/** Prints self-contained HTML to an A4 landscape PDF in a hidden, script-less window. */
async function renderPdf(html: string): Promise<Uint8Array> {
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } });
  try {
    await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await w.webContents.printToPDF({ landscape: true, pageSize: 'A4', printBackground: true });
  } finally {
    w.destroy();
  }
}

async function createService(): Promise<AppService> {
  const dataDir = app.getPath('userData');
  const svc: AppService = new AppService({
    dataDir,
    crashDir: app.getPath('crashDumps'),
    // Read lazily: update events arrive after the service is constructed.
    updater: (updater = createUpdater((): Logger => svc.logger)),
    renderPdf,
    licensePublicKey: LICENSE_PUBLIC_KEY,
    appInfo: {
      name: BRAND.productName,
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
    },
    secrets: createSecretStore(dataDir, (m) => svc.logger.warn('Secrets', m)),
    dialogs: {
      openProject: async () => {
        const r = await dialog.showOpenDialog(win!, { title: 'Ouvrir un projet', filters: projectFilters, properties: ['openFile'] });
        return r.canceled ? null : r.filePaths[0] ?? null;
      },
      saveProject: async (name) => {
        const r = await dialog.showSaveDialog(win!, { title: 'Enregistrer le projet', defaultPath: `${name}.${BRAND.projectExtension}`, filters: projectFilters });
        return r.canceled ? null : r.filePath ?? null;
      },
      openProfile: async () => {
        const r = await dialog.showOpenDialog(win!, { title: 'Importer des profils', filters: [
          { name: 'Profils (Luma, GDTF, grandMA2)', extensions: ['json', 'gdtf', 'xml', 'xmlp'] },
          { name: 'Profils Luma', extensions: ['json'] },
          { name: 'GDTF', extensions: ['gdtf'] },
          { name: 'grandMA2', extensions: ['xml', 'xmlp'] },
        ], properties: ['openFile'] });
        return r.canceled ? null : r.filePaths[0] ?? null;
      },
      openProfiles: async () => {
        const r = await dialog.showOpenDialog(win!, { title: 'Importer des profils', filters: [
          { name: 'Profils (Luma, GDTF, grandMA2, collections .zip)', extensions: ['json', 'gdtf', 'xml', 'xmlp', 'zip'] },
        ], properties: ['openFile', 'multiSelections'] });
        return r.canceled ? [] : r.filePaths;
      },
      openFixtureShare: () => openFixtureShare(svc, (e) => sendEvent('imported', e), win),
      saveProfiles: async (name) => {
        const r = await dialog.showSaveDialog(win!, { title: 'Exporter des profils', defaultPath: name, filters: [{ name: 'Profils Luma', extensions: ['json'] }] });
        return r.canceled ? null : r.filePath ?? null;
      },
      savePatchSheet: async (name, format) => {
        const r = await dialog.showSaveDialog(win!, { title: 'Exporter la feuille de patch', defaultPath: name, filters: [format === 'csv' ? { name: 'Tableur (CSV)', extensions: ['csv'] } : { name: 'PDF', extensions: ['pdf'] }] });
        return r.canceled ? null : r.filePath ?? null;
      },
      savePatchPlan: async (name) => {
        const r = await dialog.showSaveDialog(win!, { title: 'Exporter le plan d’installation', defaultPath: name, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
        return r.canceled ? null : r.filePath ?? null;
      },
      saveMvr: async (name) => {
        const r = await dialog.showSaveDialog(win!, { title: 'Exporter l’implantation (MVR)', defaultPath: name, filters: [{ name: 'My Virtual Rig', extensions: ['mvr'] }] });
        return r.canceled ? null : r.filePath ?? null;
      },
      saveFeedback: async (name) => {
        const r = await dialog.showSaveDialog(win!, { title: 'Enregistrer le retour', defaultPath: path.join(app.getPath('desktop'), name), filters: [{ name: 'Retour', extensions: ['json'] }] });
        return r.canceled ? null : r.filePath ?? null;
      },
      saveDiagnostic: async (name) => {
        const r = await dialog.showSaveDialog(win!, { title: 'Exporter un diagnostic', defaultPath: path.join(app.getPath('desktop'), name), filters: [{ name: 'Diagnostic', extensions: ['json'] }] });
        return r.canceled ? null : r.filePath ?? null;
      },
    },
  });
  await svc.init();
  return svc;
}

const webPreferences = {
  preload: path.join(here, '../preload/index.cjs'),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
  spellcheck: false,
};

function guardNavigation(w: BrowserWindow): void {
  w.webContents.on('will-navigate', (e, url) => {
    if (!isTrustedSender(url)) e.preventDefault();
  });
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#0B0D12',
    title: BRAND.productName,
    icon,
    autoHideMenuBar: true,
    // The main window runs the audio analysis and the timecode decoders: they must keep running while it is minimised.
    webPreferences: { ...webPreferences, backgroundThrottling: false },
  });
  // Navigation is restricted to the app itself; external https links open in the system browser.
  guardNavigation(w);
  w.webContents.setWindowOpenHandler(({ url }) => {
    // Detachable 3D stage view and Live Console (second screen): same renderer, same locked-down preferences.
    if (isTrustedSender(url) && (url.endsWith('#stage3d') || url.endsWith('#console'))) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 1280, height: 720, backgroundColor: '#0B0D12', title: url.endsWith('#console') ? 'Live Console' : 'Stage 3D', icon, autoHideMenuBar: true, webPreferences } };
    }
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('did-create-window', (child) => {
    guardNavigation(child);
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
  // Detached windows must not keep the app alive once the main window is gone.
  w.on('closed', () => app.quit());
  w.on('close', (e) => {
    if (quitting || !service?.dirty || process.env.LUMA_E2E) return;
    const choice = dialog.showMessageBoxSync(w, {
      type: 'warning',
      buttons: ['Enregistrer', 'Quitter sans enregistrer', 'Annuler'],
      defaultId: 0,
      cancelId: 2,
      title: BRAND.productName,
      message: 'Le projet contient des modifications non enregistrées.',
    });
    if (choice === 2) e.preventDefault();
    else if (choice === 1) discardAutosaveSync(service);
    else if (choice === 0) {
      e.preventDefault();
      void service.execute({ type: 'project.save' }).then(
        (r) => {
          if (r.path) {
            quitting = true;
            w.close();
          }
        },
        (err: unknown) => {
          // Never leave the user believing the show was saved: say why, and let them choose.
          const again = dialog.showMessageBoxSync(w, {
            type: 'error',
            buttons: ['Enregistrer sous…', 'Quitter sans enregistrer', 'Annuler'],
            defaultId: 0,
            cancelId: 2,
            title: BRAND.productName,
            message: 'L’enregistrement a échoué.',
            detail: err instanceof Error ? err.message : String(err),
          });
          if (again === 1) {
            quitting = true;
            w.close();
          } else if (again === 0) {
            void service?.execute({ type: 'project.saveAs' }).then((r) => {
              if (r.path) {
                quitting = true;
                w.close();
              }
            }, (e2: unknown) => logFatal('Enregistrement', e2));
          }
        },
      );
    }
  });
  if (DEV_URL) void w.loadURL(DEV_URL);
  else void w.loadFile(path.join(here, '../renderer/index.html'));
  return w;
}

/** Frameless window playing the intro video; resolves after 8 seconds. */
function showSplash(): { win: BrowserWindow; done: Promise<void> } {
  const s = new BrowserWindow({
    width: 880,
    height: 220,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#000415',
    icon,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  guardNavigation(s);
  if (DEV_URL) void s.loadURL(`${DEV_URL}/splash.html`);
  else void s.loadFile(path.join(here, '../renderer/splash.html'));
  // Fixed duration: the splash lasts 8 s whatever the video length (a shorter video holds its last frame).
  const done = new Promise<void>((r) => setTimeout(r, 8_000));
  return { win: s, done };
}

/** Small window with a progress bar shown while the app shuts down to install a downloaded update. */
function showInstallWindow(version: string | null): BrowserWindow {
  const w = new BrowserWindow({
    width: 460,
    height: 160,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    // Prevents a white flash while updating.html loads: the window stays hidden until ready-to-show.
    show: false,
    backgroundColor: '#0B0D12',
    title: BRAND.productName,
    icon,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  guardNavigation(w);
  w.once('ready-to-show', () => { if (!w.isDestroyed()) w.show(); });
  const load = DEV_URL ? w.loadURL(`${DEV_URL}/updating.html`) : w.loadFile(path.join(here, '../renderer/updating.html'));
  if (version) void load.then(() => w.webContents.executeJavaScript(`document.getElementById('title').textContent = ${JSON.stringify(`Installation de la version ${version}…`)}`)).catch(() => undefined);
  return w;
}

function logFatal(source: string, err: unknown): void {
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  if (service) service.logger.error(source, message);
  else console.error(source, message);
}
process.on('uncaughtException', (err) => logFatal('Processus principal', err));
process.on('unhandledRejection', (reason) => logFatal('Promesse non gérée', reason));
app.on('render-process-gone', (_e, wc, details) => {
  logFatal('Fenêtre', `processus de rendu arrêté : ${details.reason} (code ${details.exitCode})`);
  if (win && !win.isDestroyed() && wc === win.webContents) service?.onRendererLost(`plantage : ${details.reason}`);
});
app.on('child-process-gone', (_e, details) => {
  if (details.reason !== 'clean-exit') logFatal('Processus', `${details.type} arrêté : ${details.reason} (code ${details.exitCode})`);
});

app.whenReady().then(async () => {
  if (!primaryInstance) return;
  const splash = process.env.LUMA_E2E ? null : showSplash();
  // Only the microphone (audio-reactive input, LTC), MIDI (controllers, MTC) and the HTML fullscreen of the detached
  // 3D view (F11) may be requested by the renderer.
  const allowed = new Set(['media', 'midi', 'midiSysex', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  service = await createService();

  ipcMain.handle('luma:cmd', (event, raw: unknown) => handleCommand(service!, raw, event.senderFrame?.url ?? '', DEV_URL));

  const forward = <K extends keyof AppEvents>(name: K) => (payload: AppEvents[K]) => sendEvent(name, payload);
  service.on('project', forward('project'));
  service.on('runtime', forward('runtime'));
  service.on('values', forward('values'));
  service.on('log', forward('log'));
  service.on('locatePhoto', forward('locatePhoto'));
  service.on('progress', forward('progress'));

  const w = createWindow();
  win = w;
  // A reload of the main window drops the camera localisation it was driving.
  w.webContents.on('did-start-navigation', (e) => {
    if (e.isMainFrame && !e.isSameDocument) service?.onRendererLost('rechargement');
  });
  const ready = new Promise<void>((r) => w.once('ready-to-show', () => r()));
  await Promise.all([ready, splash?.done]);
  if (splash && !splash.win.isDestroyed()) splash.win.destroy();
  if (!w.isDestroyed()) w.show();
});

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  quitting = true;
  app.quit();
});

let disposed = false;
// Kept alive until quitAndInstall terminates the process — prevents GC from closing the window prematurely.
let _installWin: BrowserWindow | null = null;
app.on('before-quit', (e) => {
  quitting = true;
  if (disposed || !service) return;
  e.preventDefault();
  const update = updater?.status();
  if (update?.state === 'ready') _installWin = showInstallWindow(update.version);
  // Clean shutdown: stop the engine, send sACN stream-terminated packets, close sockets/serial ports.
  void service.dispose().finally(() => {
    disposed = true;
    if (!updater?.installNow()) app.quit();
  });
});
