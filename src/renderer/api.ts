import type { CommandInput, CommandResults, CommandType } from '../shared/commands';
import { translateCore } from '../shared/i18n';
import { t } from './i18n';
import { useStore } from './store';

export interface CallOptions {
  /** Avoid flooding the operator when a polling command keeps failing. Cleared after a successful call. */
  deduplicateErrors?: boolean;
}

const reportedErrors = new Set<string>();

/** Typed command call. Ordinary errors are non-blocking toasts; licence refusals remain explicit dialogs. */
export async function call<T extends CommandType>(
  cmd: Extract<CommandInput, { type: T }>,
  options: CallOptions = {},
): Promise<CommandResults[T]> {
  const r = await window.luma.invoke<T>(cmd);
  const errorKey = options.deduplicateErrors ? `${cmd.type}:${r.ok ? '' : r.error}` : null;
  if (r.ok) {
    if (options.deduplicateErrors) {
      for (const key of reportedErrors) if (key.startsWith(`${cmd.type}:`)) reportedErrors.delete(key);
    }
    return r.data;
  }

  const detail = r.message ? translateCore(useStore.getState().language, r.message.key, r.message.vars) : r.error;
  if (!errorKey || !reportedErrors.has(errorKey)) {
    if (errorKey) reportedErrors.add(errorKey);
    if (/licen[cs]e/i.test(r.error)) {
      useStore.getState().setNotice({ title: t('api.error.title'), detail });
    } else {
      useStore.getState().toast({ kind: 'error', title: t('api.error.title'), detail });
    }
  }
  throw new Error(detail);
}

/** Same as `call` but swallows the (already displayed) error. For fire-and-forget UI actions. */
export async function act<T extends CommandType>(cmd: Extract<CommandInput, { type: T }>): Promise<CommandResults[T] | undefined> {
  try {
    return await call(cmd);
  } catch {
    return undefined;
  }
}

export const newId = (): string => crypto.randomUUID();
