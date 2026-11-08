import { defaultSettings, type Settings } from '../../../core/settings/settings';
import type { MessageKey } from '../../i18n';

export type TabId = 'general' | 'appearance' | 'safety' | 'engine' | 'network' | 'ai' | 'assistant' | 'audio' | 'shortcuts' | 'control' | 'logs' | 'backups';
export const TAB_GROUPS: readonly { id: 'app' | 'show' | 'ai' | 'system'; tabs: readonly TabId[] }[] = [
  { id: 'app', tabs: ['general', 'appearance', 'shortcuts'] },
  { id: 'show', tabs: ['safety', 'engine', 'network', 'audio', 'control'] },
  { id: 'ai', tabs: ['ai', 'assistant'] },
  { id: 'system', tabs: ['logs', 'backups'] },
];

/** A scalar setting shown on the page: its path in `Settings`, the tab holding it and its labels (searched in the active language). */
export interface SettingDef { path: string; tab: TabId; labelKey: MessageKey; hintKey?: MessageKey; contextKey?: MessageKey }

/** Every setting wrapped in `<Setting>`: the search and the « modified » marker both read this list. Lists (outputs, profiles, mappings) are left out. */
export const SETTING_DEFS: readonly SettingDef[] = [
  { path: 'general.autosaveMinutes', tab: 'general', labelKey: 'settings.general.autosave', hintKey: 'settings.general.autosaveHint' },
  { path: 'general.confirmDangerous', tab: 'general', labelKey: 'settings.general.confirmDangerous' },
  { path: 'general.detachStage3dOnStart', tab: 'general', labelKey: 'settings.general.detachStage3d' },
  { path: 'general.detachConsoleOnStart', tab: 'general', labelKey: 'settings.general.detachConsole' },
  { path: 'general.simpleConsoleOnStart', tab: 'general', labelKey: 'settings.general.simpleConsole', hintKey: 'settings.general.simpleConsoleHint' },
  { path: 'general.installPlanButton', tab: 'general', labelKey: 'settings.general.installPlan', hintKey: 'settings.general.installPlanHint' },
  { path: 'appearance.reducedMotion', tab: 'appearance', labelKey: 'settings.appearance.reducedMotion' },
  { path: 'appearance.uiScale', tab: 'appearance', labelKey: 'settings.appearance.scale' },
  { path: 'appearance.language', tab: 'appearance', labelKey: 'settings.appearance.language', hintKey: 'settings.appearance.languageHint' },
  { path: 'ai.allowStrobe', tab: 'safety', labelKey: 'settings.safety.allowStrobe', hintKey: 'settings.safety.allowStrobeHint' },
  { path: 'engine.maxStrobeHz', tab: 'safety', labelKey: 'settings.engine.maxStrobe', hintKey: 'settings.engine.maxStrobeHint' },
  { path: 'engine.flashGuard', tab: 'safety', labelKey: 'settings.engine.flashGuard', hintKey: 'settings.engine.flashGuardHint' },
  { path: 'engine.blackoutPolicy', tab: 'safety', labelKey: 'settings.engine.blackout', hintKey: 'settings.engine.blackoutHint' },
  { path: 'general.autoArmOnStart', tab: 'safety', labelKey: 'settings.network.autoArm', hintKey: 'settings.network.armingNever' },
  { path: 'engine.rateHz', tab: 'engine', labelKey: 'settings.engine.rate', hintKey: 'settings.engine.rateHint' },
  { path: 'engine.priorities.ai', tab: 'engine', labelKey: 'settings.engine.priorityAi' },
  { path: 'engine.priorities.timeline', tab: 'engine', labelKey: 'settings.engine.priorityTimeline' },
  { path: 'engine.priorities.audio', tab: 'engine', labelKey: 'settings.engine.priorityAudio' },
  { path: 'ai.provider', tab: 'ai', labelKey: 'settings.ai.provider' },
  { path: 'ai.timeoutSec', tab: 'ai', labelKey: 'settings.ai.timeout' },
  { path: 'ai.fallbackToLocal', tab: 'ai', labelKey: 'settings.ai.fallback' },
  { path: 'ai.monthlyBudget', tab: 'ai', labelKey: 'settings.ai.budget', hintKey: 'settings.ai.budgetHint' },
  { path: 'ai.autoSuggestIntents', tab: 'ai', labelKey: 'settings.ai.autoSuggest', hintKey: 'settings.ai.autoSuggestHint' },
  { path: 'ai.model', tab: 'ai', labelKey: 'settings.ai.model' },
  { path: 'ai.effort', tab: 'ai', labelKey: 'settings.ai.effort', hintKey: 'settings.ai.effortHint' },
  { path: 'audio.latencyMs', tab: 'audio', labelKey: 'settings.audio.latency', hintKey: 'settings.audio.latencyHint' },
  { path: 'ai.phraseBars', tab: 'audio', labelKey: 'settings.audio.phraseBars', hintKey: 'music.phraseBars.hint' },
  { path: 'control.midi.enabled', tab: 'control', labelKey: 'settings.midi.enable', contextKey: 'settings.midi.title' },
  { path: 'control.osc.enabled', tab: 'control', labelKey: 'settings.osc.enable', contextKey: 'settings.osc.title' },
  { path: 'control.osc.port', tab: 'control', labelKey: 'settings.osc.port', contextKey: 'settings.osc.title' },
  { path: 'control.osc.bind', tab: 'control', labelKey: 'settings.osc.bind', hintKey: 'settings.osc.bindHint', contextKey: 'settings.osc.title' },
  { path: 'control.osc.ack', tab: 'control', labelKey: 'settings.osc.ackToggle', contextKey: 'settings.osc.title' },
  { path: 'control.remote.enabled', tab: 'control', labelKey: 'settings.remote.enable', contextKey: 'settings.remote.title' },
  { path: 'control.remote.port', tab: 'control', labelKey: 'settings.remote.port', contextKey: 'settings.remote.title' },
  { path: 'control.timecode.source', tab: 'control', labelKey: 'settings.timecode.source', hintKey: 'settings.timecode.sourceHint', contextKey: 'settings.timecode.title' },
  { path: 'logs.level', tab: 'logs', labelKey: 'settings.logs.level' },
];

const DEFAULTS = defaultSettings();

export const getAt = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], o);

/** Immutable copy of `o` with `path` set to `v`. */
export function setAt<T>(o: T, path: string, v: unknown): T {
  const [k, ...rest] = path.split('.');
  const obj = o as Record<string, unknown>;
  return { ...obj, [k!]: rest.length ? setAt(obj[k!], rest.join('.'), v) : v } as T;
}

export const defaultAt = (path: string): unknown => getAt(DEFAULTS, path);
export const isModified = (s: Settings, path: string): boolean => JSON.stringify(getAt(s, path)) !== JSON.stringify(defaultAt(path));

/** Accent-, case- and apostrophe-insensitive form used by the search. */
export const fold = (x: string): string => x.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[’‘]/gu, "'").toLowerCase();

/** Settings and tabs whose translated texts contain every word of `query`. */
export function searchSettings(query: string, tr: (k: MessageKey) => string): { tabs: TabId[]; settings: SettingDef[] } {
  const words = fold(query).split(/\s+/u).filter(Boolean);
  const hit = (texts: (MessageKey | undefined)[]) => {
    const hay = fold(texts.filter((k): k is MessageKey => !!k).map(tr).join(' '));
    return words.length > 0 && words.every((w) => hay.includes(w));
  };
  return {
    tabs: TAB_GROUPS.flatMap((g) => g.tabs).filter((id) => hit([`settings.tab.${id}`, `settings.desc.${id}`])),
    settings: SETTING_DEFS.filter((d) => hit([d.labelKey, d.hintKey, d.contextKey])),
  };
}
