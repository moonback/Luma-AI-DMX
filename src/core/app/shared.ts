import type { Fixture, Project } from '../model/schemas';

/** An error caused by the user's input or the current state, shown as is (never logged as an internal failure). */
export class UserError extends Error {}

/** Fixture fields that make up the scene layout (undone/redone together with the visualizer settings). */
export const SCENE_FIELDS = ['position', 'height', 'rotation', 'mount', 'mountTilt', 'trussId'] as const;
export type SceneFields = Pick<Fixture, (typeof SCENE_FIELDS)[number]>;
export interface SceneSnapshot { visualizer: Project['visualizer']; fixtures: Record<string, SceneFields> }
export const SCENE_HISTORY_MAX = 100;

export const OPENROUTER_KEY = 'openrouter-api-key';
export const GEMINI_KEY = 'gemini-api-key';
/** Gemini Live model of the voice assistant. */
export const VOICE_MODEL = 'gemini-3.8-live';
