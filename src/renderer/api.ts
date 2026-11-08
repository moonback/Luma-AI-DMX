import type { CommandInput, CommandResults, CommandType } from '../shared/commands';
import { useStore } from './store';
import { translateCore } from '../shared/i18n';

/** Typed command call. Errors are shown as a toast and re-thrown. */
export async function call<T extends CommandType>(cmd: Extract<CommandInput, { type: T }>): Promise<CommandResults[T]> {
  const r = await window.luma.invoke<T>(cmd);
  if (!r.ok) {
    const state = useStore.getState();
    const detail = r.message ? translateCore(state.language, r.message.key, r.message.vars) : r.error;
    state.setNotice({ title: state.language === 'en' ? 'Action failed' : 'Action impossible', detail });
    throw new Error(detail);
  }
  return r.data;
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
