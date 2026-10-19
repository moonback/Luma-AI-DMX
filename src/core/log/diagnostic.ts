import { existsSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The user's home folder, any separator and case: diagnostics are sent to the team, the account name is not. */
const HOME_RE = (() => {
  const home = os.homedir();
  if (!home) return null;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(home.split(/[\\/]/u).filter(Boolean).map(esc).join('[\\\\/]'), 'giu');
})();
export const maskHome = (s: string): string => (HOME_RE ? s.replace(HOME_RE, '~') : s);

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  arch: string;
  versions: Record<string, string>;
}

export interface Diagnostic {
  format: 'luma-diagnostic';
  version: 1;
  createdAt: string;
  app: AppInfo;
  settings: unknown;
  project: { name: string; fixtures: number; universes: number; cueLists: number } | null;
  outputs: unknown[];
  logs: string[];
  crashDumps: { name: string; size: number; modifiedAt: string }[];
  /** Engine and output metrics of the last 24 h (one sample every 10 s). */
  metrics?: unknown[];
}

const SECRET_KEY = /token|secret|password|passwd|api[-_]?key|apikey|^key$/iu;
export const REDACTED = '[masqué]';

/** Deep copy with every secret-looking field replaced; URLs carrying a `t=` token are masked too. */
export function redactSecrets<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET_KEY.test(k) && x != null ? REDACTED : walk(x)]));
    }
    if (typeof v === 'string') return maskHome(v.replace(/([?&](?:t|token)=)[^&\s"]+/giu, `$1${REDACTED}`));
    return v;
  };
  return walk(value) as T;
}

/** Crash dumps written by Electron's crashReporter (kept local, never uploaded). */
export function listCrashDumps(dir: string | undefined): Diagnostic['crashDumps'] {
  if (!dir || !existsSync(dir)) return [];
  const out: Diagnostic['crashDumps'] = [];
  const visit = (d: string, depth: number) => {
    for (const name of readdirSync(d)) {
      const full = path.join(d, name);
      const st = statSync(full);
      if (st.isDirectory() && depth < 3) visit(full, depth + 1);
      else if (name.endsWith('.dmp')) out.push({ name: path.relative(dir, full), size: st.size, modifiedAt: st.mtime.toISOString() });
    }
  };
  visit(dir, 0);
  return out.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 20);
}

export function buildDiagnostic(input: Omit<Diagnostic, 'format' | 'version' | 'createdAt'>): Diagnostic {
  return redactSecrets({ format: 'luma-diagnostic', version: 1, createdAt: new Date().toISOString(), ...input });
}
