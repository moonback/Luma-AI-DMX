import { z } from 'zod';
import { outputConfigSchema } from '../protocols/config';

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Espace', action: 'GO sur la liste de cues sélectionnée' },
  { keys: 'Maj + Espace', action: 'BACK (cue précédent)' },
  { keys: 'P', action: 'Pause / reprise de la liste sélectionnée' },
  { keys: 'B', action: 'Blackout on/off' },
  { keys: 'Maj + Échap', action: 'STOP OUTPUT : arrêt immédiat des émissions réelles' },
  { keys: 'Échap', action: 'Relâcher le programmeur (reprise des playbacks)' },
  { keys: 'Ctrl + 1 … 9, 0', action: 'Changer d’espace de travail' },
  { keys: 'Ctrl + S / Ctrl + Maj + S', action: 'Enregistrer / Enregistrer sous' },
  { keys: 'Ctrl + O / Ctrl + N', action: 'Ouvrir / Nouveau projet' },
  { keys: 'Ctrl + Z / Ctrl + Y', action: 'Annuler / rétablir (timeline)' },
  { keys: 'Ctrl + `', action: 'Console de diagnostic' },
];

export const settingsSchema = z.object({
  version: z.literal(1).default(1),
  general: z
    .object({
      autosaveMinutes: z.number().int().min(0).max(60).default(2),
      recentProjects: z.array(z.string().max(1000)).max(10).default([]),
      confirmDangerous: z.boolean().default(true),
    })
    .default({ autosaveMinutes: 2, recentProjects: [], confirmDangerous: true }),
  appearance: z
    .object({ reducedMotion: z.boolean().default(false), uiScale: z.number().min(0.8).max(1.4).default(1) })
    .default({ reducedMotion: false, uiScale: 1 }),
  engine: z
    .object({
      rateHz: z.number().int().min(10).max(44).default(40),
      blackoutPolicy: z.enum(['intensity', 'intensity-shutter', 'all-zero']).default('intensity-shutter'),
      maxStrobeHz: z.number().min(1).max(25).default(10),
      priorities: z
        .object({ ai: z.number().int().min(1).max(99).default(60), timeline: z.number().int().min(1).max(99).default(40), audio: z.number().int().min(1).max(99).default(55) })
        .default({ ai: 60, timeline: 40, audio: 55 }),
    })
    .default({ rateHz: 40, blackoutPolicy: 'intensity-shutter', maxStrobeHz: 10, priorities: { ai: 60, timeline: 40, audio: 55 } }),
  outputs: z.array(outputConfigSchema).max(16).default([{ id: 'virtual-1', name: 'Sortie virtuelle', kind: 'virtual', enabled: true, maxFps: 40, universes: [1, 2, 3, 4] }]),
  sacn: z.object({ cid: z.uuid() }).optional(),
  ai: z
    .object({
      provider: z.enum(['local', 'anthropic']).default('local'),
      model: z.string().min(1).max(100).default('claude-opus-5-5'),
      effort: z.enum(['low', 'medium', 'high']).default('medium'),
      timeoutSec: z.number().int().min(5).max(300).default(60),
      allowStrobe: z.boolean().default(false),
      /** Fall back to the local interpreter when the external provider fails. */
      fallbackToLocal: z.boolean().default(true),
    })
    .default({ provider: 'local', model: 'claude-opus-5-5', effort: 'medium', timeoutSec: 60, allowStrobe: false, fallbackToLocal: true }),
  audio: z.object({ deviceId: z.string().max(300).nullable().default(null) }).default({ deviceId: null }),
  logs: z.object({ level: z.enum(['debug', 'info', 'warn', 'error']).default('info') }).default({ level: 'info' }),
});
export type Settings = z.infer<typeof settingsSchema>;

export const defaultSettings = (): Settings => settingsSchema.parse({});
