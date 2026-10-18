/**
 * Application updates, as seen by the core. The Electron implementation (src/main/updates.ts) wraps
 * electron-updater; tests and the development build use none, and the state then reads « disabled ».
 * An update is downloaded in the background and installed only when the application quits: never during a show.
 */
export type UpdateChannel = 'stable' | 'beta';
export type UpdateState = 'disabled' | 'idle' | 'checking' | 'downloading' | 'ready' | 'up-to-date' | 'error';

export interface UpdateStatus {
  state: UpdateState;
  /** Version available (downloading or ready). */
  version: string | null;
  /** Download progress 0..1 while downloading. */
  progress: number | null;
  detail: string | null;
  checkedAt: string | null;
}

export interface Updater {
  status(): UpdateStatus;
  configure(opts: { channel: UpdateChannel; auto: boolean }): void;
  check(): Promise<UpdateStatus>;
}

export const DISABLED_UPDATES: UpdateStatus = { state: 'disabled', version: null, progress: null, detail: 'Mises à jour automatiques indisponibles dans cette version (développement ou tests).', checkedAt: null };
