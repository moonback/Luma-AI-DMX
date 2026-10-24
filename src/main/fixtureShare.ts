import path from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { app, BrowserWindow, session, shell, type DownloadItem } from 'electron';
import type { AppService } from '../core/app/AppService';
import type { ProfilesImported } from '../shared/commands';
import { isFixtureShareUrl } from './ipc';

/**
 * MA Fixture Share inside the app: the user browses the site and signs in with their own MA account in an isolated
 * window (own session, no preload, no access to the app), and every fixture file they download there (grandMA2 .xml,
 * .zip collection, .gdtf) is converted and added to the profile library. Nothing is fetched behind their back and no
 * file is redistributed: the app only imports what the user chose to download under the site's terms.
 */
export const FIXTURE_SHARE_URL = 'https://fixtureshare.malighting.com/share.php?page=home';
const PARTITION = 'persist:fixtureshare';
const ACCEPTED = new Set(['.xml', '.zip', '.gdtf']);
/** A Fixture Share file or collection is far smaller; anything bigger is refused. */
const MAX_BYTES = 20 * 1024 * 1024;

let win: BrowserWindow | null = null;
let hooked = false;

export function openFixtureShare(service: AppService, notify: (event: ProfilesImported) => void, parent: BrowserWindow | null): void {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); return; }
  const ses = session.fromPartition(PARTITION);
  if (!hooked) {
    hooked = true;
    // Fixture Share needs no device access.
    ses.setPermissionRequestHandler((_wc, _permission, done) => done(false));
    ses.on('will-download', (_e, item) => handleDownload(item, service, notify));
  }
  win = new BrowserWindow({
    width: 1280, height: 860, title: 'MA Fixture Share', autoHideMenuBar: true, backgroundColor: '#ffffff',
    ...(parent ? { parent } : {}),
    webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false, spellcheck: false },
  });
  const wc = win.webContents;
  wc.on('will-navigate', (e, url) => {
    if (isFixtureShareUrl(url)) return;
    e.preventDefault();
    if (url.startsWith('https://')) void shell.openExternal(url);
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (isFixtureShareUrl(url)) void wc.loadURL(url);
    else if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => { win = null; });
  void win.loadURL(FIXTURE_SHARE_URL);
}

function handleDownload(item: DownloadItem, service: AppService, notify: (event: ProfilesImported) => void): void {
  const name = path.basename(item.getFilename()).replace(/[^\w.() -]+/gu, '_') || 'fixture.xml';
  const ext = path.extname(name).toLowerCase();
  const fail = (error: string) => notify({ source: 'fixtureShare', file: name, imported: [], errors: [error], warnings: [] });
  if (!ACCEPTED.has(ext)) { item.cancel(); fail('format non importable : choisissez la version grandMA2 (.xml), une collection .zip ou un fichier GDTF'); return; }
  if (item.getTotalBytes() > MAX_BYTES) { item.cancel(); fail('fichier trop volumineux'); return; }
  const dir = path.join(app.getPath('temp'), 'luma-fixtureshare');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${name}`);
  item.setSavePath(file);
  item.on('done', (_e, state) => {
    if (state !== 'completed') { fail(`téléchargement ${state === 'cancelled' ? 'annulé' : 'interrompu'}`); return; }
    service.execute({ type: 'profile.import', paths: [file] }).then(
      (r) => notify({ source: 'fixtureShare', file: name, ...r }),
      (err: Error) => fail(err.message),
    ).finally(() => rmSync(file, { force: true })); // imported into the library: the download itself is not kept
  });
}
