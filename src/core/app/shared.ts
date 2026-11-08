import type { Fixture, Project } from '../model/schemas';

import type { CoreMessageKey } from '../../shared/i18n';

/** Expected refusal. The French fallback remains useful in logs and for older consumers. */
export class UserError extends Error {
  constructor(message: string, readonly messageKey?: CoreMessageKey, readonly messageVars?: Record<string, string | number>) {
    super(message);
    this.name = 'UserError';
  }
}

/** Fixture fields that make up the scene layout (undone/redone together with the visualizer settings). */
export const SCENE_FIELDS = ['position', 'height', 'rotation', 'mount', 'mountTilt', 'trussId'] as const;
export type SceneFields = Pick<Fixture, (typeof SCENE_FIELDS)[number]>;
export interface SceneSnapshot { visualizer: Project['visualizer']; fixtures: Record<string, SceneFields> }
export const SCENE_HISTORY_MAX = 100;

export const OPENROUTER_KEY = 'openrouter-api-key';
export const GEMINI_KEY = 'gemini-api-key';
/** Gemini Live model of the voice assistant. */
export const VOICE_MODEL = 'gemini-3.8-live';
