import { useStore } from '../store';
import { fr, type MessageKey } from './fr';
import { en } from './en';

export type Language = 'fr' | 'en';
export type { MessageKey };
const CATALOGUES: Record<Language, Record<MessageKey, string>> = { fr, en };

/** Message in `lang`, placeholders `{name}` replaced; falls back to French. */
export function translate(lang: Language, key: MessageKey, vars?: Record<string, string | number>): string {
  const text = CATALOGUES[lang]?.[key] ?? fr[key];
  return vars ? text.replace(/\{(\w+)\}/gu, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Outside React (dialogs, confirmations): current language from the store. */
export const t = (key: MessageKey, vars?: Record<string, string | number>): string => translate(useStore.getState().language, key, vars);

/** In components: re-renders when the language changes. */
export function useT(): (key: MessageKey, vars?: Record<string, string | number>) => string {
  const lang = useStore((s) => s.language);
  return (key, vars) => translate(lang, key, vars);
}
