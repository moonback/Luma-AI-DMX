import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export const idSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Identifiant invalide');
export const nameSchema = z.string().trim().min(1, 'Nom requis').max(80);
export const dmxValueSchema = z.number().int().min(0).max(255);
export const unitSchema = z.number().min(0).max(1); // normalized attribute value
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hexadécimale attendue (#RRGGBB)');
export const MAX_UNIVERSES = 64;
export const universeSchema = z.number().int().min(1).max(MAX_UNIVERSES);
export const addressSchema = z.number().int().min(1).max(512);

/* ------------------------------------------------------------------ */
/* Attributes                                                          */
/* ------------------------------------------------------------------ */

export const BUILTIN_ATTRIBUTES = [
  'dimmer', 'red', 'green', 'blue', 'white', 'amber', 'uv', 'cyan', 'magenta', 'yellow', 'cto', 'colorWheel',
  'pan', 'tilt', 'panTiltSpeed',
  'shutter', 'strobe', 'gobo', 'goboRotation', 'prism', 'focus', 'zoom', 'iris', 'frost',
  'speed', 'macro', 'control',
] as const;
export type BuiltinAttribute = (typeof BUILTIN_ATTRIBUTES)[number];
export const attributeSchema = z.union([
  z.enum(BUILTIN_ATTRIBUTES),
  z.string().regex(/^custom:[a-z0-9][a-z0-9-]{0,31}$/, 'Attribut personnalisé: custom:<nom>'),
]);
export type Attribute = z.infer<typeof attributeSchema>;

/* ------------------------------------------------------------------ */
/* Fixture profiles                                                    */
/* ------------------------------------------------------------------ */

export const RANGE_KINDS = ['open', 'closed', 'strobe', 'pulse', 'random', 'color', 'gobo', 'shake', 'rotation', 'reset', 'lamp-on', 'lamp-off', 'other'] as const;

export const channelRangeSchema = z
  .object({
    from: dmxValueSchema,
    to: dmxValueSchema,
    label: z.string().min(1).max(64),
    kind: z.enum(RANGE_KINDS).default('other'),
    color: hexColorSchema.optional(),
    /** Values in a dangerous range (reset, lamp off…) are only emitted after explicit manual confirmation. */
    dangerous: z.boolean().default(false),
  })
  .refine((r) => r.from <= r.to, { message: 'Plage DMX inversée (from > to)' });
export type ChannelRange = z.infer<typeof channelRangeSchema>;

export const channelSchema = z.object({
  name: z.string().min(1).max(48),
  attribute: attributeSchema,
  /** true = low byte of the 16-bit attribute whose coarse channel is also in the mode. */
  fine: z.boolean().default(false),
  default: dmxValueSchema.default(0),
  ranges: z.array(channelRangeSchema).default([]),
});
export type Channel = z.infer<typeof channelSchema>;

export const modeSchema = z
  .object({
    name: z.string().min(1).max(48),
    channels: z.array(channelSchema).min(1).max(512),
  })
  .superRefine((mode, ctx) => {
    const coarse = new Set<string>();
    const fine = new Set<string>();
    for (const [i, ch] of mode.channels.entries()) {
      const set = ch.fine ? fine : coarse;
      if (set.has(ch.attribute)) {
        ctx.addIssue({ code: 'custom', path: ['channels', i, 'attribute'], message: `Attribut « ${ch.attribute} » déclaré deux fois dans le mode « ${mode.name} »` });
      }
      set.add(ch.attribute);
    }
    for (const a of fine) {
      if (!coarse.has(a)) ctx.addIssue({ code: 'custom', path: ['channels'], message: `Canal fin « ${a} » sans canal principal` });
    }
  });
export type FixtureMode = z.infer<typeof modeSchema>;

export const FIXTURE_TYPES = ['par', 'moving-head-spot', 'moving-head-wash', 'strobe', 'dimmer', 'led-bar', 'other'] as const;
export type FixtureType = (typeof FIXTURE_TYPES)[number];
export const profileSchema = z.object({
  id: idSchema,
  name: nameSchema,
  manufacturer: z.string().trim().min(1).max(80),
  type: z.enum(FIXTURE_TYPES),
  /** Fictional demo profiles must never be presented as certified commercial profiles. */
  fictional: z.boolean().default(false),
  physical: z
    .object({
      panRange: z.number().min(0).max(720).default(540),
      tiltRange: z.number().min(0).max(360).default(270),
      beamAngle: z.number().min(1).max(90).default(25),
    })
    .default({ panRange: 540, tiltRange: 270, beamAngle: 25 }),
  modes: z.array(modeSchema).min(1),
});
export type FixtureProfile = z.infer<typeof profileSchema>;

/* ------------------------------------------------------------------ */
/* Patch, groups, palettes                                             */
/* ------------------------------------------------------------------ */

export const fixtureSchema = z.object({
  id: idSchema,
  name: nameSchema,
  profileId: idSchema,
  mode: z.string().min(1),
  universe: universeSchema,
  address: addressSchema,
  tags: z.array(z.string().trim().min(1).max(32)).max(16).default([]),
  /** Stage position in meters, origin = downstage centre, y grows upstage. */
  position: z.object({ x: z.number().min(-100).max(100), y: z.number().min(-100).max(100) }).default({ x: 0, y: 0 }),
  /** Mounting rotation in degrees (0 = facing audience). */
  rotation: z.number().min(-360).max(360).default(0),
  notes: z.string().max(500).default(''),
});
export type Fixture = z.infer<typeof fixtureSchema>;

export const groupSchema = z.object({
  id: idSchema,
  name: nameSchema,
  color: hexColorSchema.default('#8B5CF6'),
  fixtureIds: z.array(idSchema),
});
export type Group = z.infer<typeof groupSchema>;

export const PALETTE_KINDS = ['color', 'position', 'intensity', 'beam'] as const;
export const attributeValuesSchema = z.record(z.string(), unitSchema);
export type AttributeValues = Record<string, number>;
export const paletteSchema = z.object({
  id: idSchema,
  name: nameSchema,
  kind: z.enum(PALETTE_KINDS),
  /** For color palettes: converted per fixture capabilities (RGB, RGBW, color wheel…). */
  color: hexColorSchema.optional(),
  values: attributeValuesSchema.default({}),
});
export type Palette = z.infer<typeof paletteSchema>;

/* ------------------------------------------------------------------ */
/* Scenes, cues, effects, timeline                                     */
/* ------------------------------------------------------------------ */

export const fixtureValuesSchema = z.record(z.string(), attributeValuesSchema);
export type FixtureValues = Record<string, AttributeValues>;

export const sceneSchema = z.object({
  id: idSchema,
  name: nameSchema,
  notes: z.string().max(500).default(''),
  values: fixtureValuesSchema,
  origin: z.enum(['user', 'ai']).default('user'),
});
export type Scene = z.infer<typeof sceneSchema>;

export const curveSchema = z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut', 'snap']);
export const cueTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('manual') }),
  /** Auto-GO `wait` seconds after the previous cue completed. */
  z.object({ type: z.literal('follow'), wait: z.number().min(0).max(3600) }),
]);
export const cueSchema = z.object({
  id: idSchema,
  number: z.number().min(0).max(9999),
  name: nameSchema,
  description: z.string().max(500).default(''),
  /** null = cue releases this list's look (fades intensities to 0). */
  sceneId: idSchema.nullable(),
  fade: z.number().min(0).max(600).default(2),
  delay: z.number().min(0).max(600).default(0),
  curve: curveSchema.default('linear'),
  trigger: cueTriggerSchema.default({ type: 'manual' }),
  /** Effects started when the cue fires and stopped when the list leaves the cue. */
  effectIds: z.array(idSchema).default([]),
});
export type Cue = z.infer<typeof cueSchema>;

export const cueListSchema = z.object({
  id: idSchema,
  name: nameSchema,
  priority: z.number().int().min(1).max(99).default(50),
  loop: z.boolean().default(false),
  cues: z.array(cueSchema).max(999),
});
export type CueList = z.infer<typeof cueListSchema>;

export const EFFECT_TYPES = ['fade', 'pulse', 'chase', 'wave', 'rainbow', 'strobe', 'dimmerWave', 'colorCycle', 'panTilt', 'randomMove'] as const;
export type EffectType = (typeof EFFECT_TYPES)[number];
export const targetSchema = z.object({
  fixtureIds: z.array(idSchema).default([]),
  groupIds: z.array(idSchema).default([]),
});
export type Target = z.infer<typeof targetSchema>;
export const effectParamsSchema = z.object({
  /** Cycles per second when not BPM-synced. */
  speed: z.number().min(0.01).max(30).default(0.5),
  bpmSync: z.boolean().default(false),
  beatsPerCycle: z.number().min(0.25).max(64).default(4),
  amplitude: unitSchema.default(1),
  /** Centre / base level. */
  offset: unitSchema.default(0.5),
  /** Fraction of a cycle spread across target fixtures (0 = all in sync). */
  phaseSpread: unitSchema.default(0),
  direction: z.enum(['forward', 'reverse', 'pingpong']).default('forward'),
  colors: z.array(hexColorSchema).max(16).default([]),
  attribute: attributeSchema.default('dimmer'),
  shape: z.enum(['circle', 'figure8', 'pan', 'tilt']).default('circle'),
  width: z.number().int().min(1).max(64).default(1),
  duty: z.number().min(0.05).max(0.95).default(0.5),
  seed: z.number().int().min(0).max(2 ** 31).default(1),
});
export type EffectParams = z.infer<typeof effectParamsSchema>;
export const effectSchema = z.object({
  id: idSchema,
  name: nameSchema,
  type: z.enum(EFFECT_TYPES),
  targets: targetSchema,
  params: effectParamsSchema,
  priority: z.number().int().min(1).max(99).default(50),
  /** override = replaces values; scale = multiplies the underlying value (intensity modulation). */
  blend: z.enum(['override', 'scale']).default('override'),
  /** Seconds; null = runs until stopped. */
  duration: z.number().min(0.1).max(86400).nullable().default(null),
  trigger: z.enum(['manual', 'cue', 'beat']).default('manual'),
  origin: z.enum(['user', 'ai']).default('user'),
});
export type Effect = z.infer<typeof effectSchema>;

export const timelineEventSchema = z
  .object({
    id: idSchema,
    kind: z.enum(['scene', 'effect', 'cue', 'marker']),
    start: z.number().min(0).max(86400),
    duration: z.number().min(0).max(86400).default(0),
    /** scene id / effect id / cue list id */
    refId: idSchema.nullable().default(null),
    /** For `cue` events: cue index in the list. */
    cueIndex: z.number().int().min(0).default(0),
    fade: z.number().min(0).max(60).default(0),
    label: z.string().max(80).default(''),
    lane: z.number().int().min(0).max(31).default(0),
  })
  .refine((e) => e.kind === 'marker' || e.refId !== null, { message: 'Un événement doit référencer une scène, un effet ou une liste de cues' });
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export const timelineSchema = z.object({
  id: idSchema,
  name: nameSchema,
  duration: z.number().min(1).max(86400).default(120),
  loop: z.boolean().default(false),
  events: z.array(timelineEventSchema).max(5000),
});
export type Timeline = z.infer<typeof timelineSchema>;

/* ------------------------------------------------------------------ */
/* Audio reactive configuration (stored in the project)                */
/* ------------------------------------------------------------------ */

const emptyTarget = { fixtureIds: [], groupIds: [] };
export const audioReactionsSchema = z.object({
  bpmFollow: z.object({ enabled: z.boolean(), minConfidence: unitSchema }),
  levelToIntensity: z.object({ enabled: z.boolean(), floor: unitSchema, targets: targetSchema }),
  beatFlash: z.object({ enabled: z.boolean(), decay: z.number().min(0.02).max(2), targets: targetSchema }),
  energyToColor: z.object({ enabled: z.boolean(), lowColor: hexColorSchema, highColor: hexColorSchema, targets: targetSchema }),
  energyRiseGo: z.object({ enabled: z.boolean(), cueListId: idSchema.nullable(), ratio: z.number().min(1.1).max(5) }),
});
export type AudioReactions = z.infer<typeof audioReactionsSchema>;
export const DEFAULT_AUDIO_REACTIONS: AudioReactions = {
  bpmFollow: { enabled: false, minConfidence: 0.5 },
  levelToIntensity: { enabled: false, floor: 0.2, targets: emptyTarget },
  beatFlash: { enabled: false, decay: 0.25, targets: emptyTarget },
  energyToColor: { enabled: false, lowColor: '#2244FF', highColor: '#FF2266', targets: emptyTarget },
  energyRiseGo: { enabled: false, cueListId: null, ratio: 1.8 },
};
export const audioConfigSchema = z.object({
  sensitivity: z.number().min(0.1).max(10).default(1),
  smoothing: unitSchema.default(0.6),
  /** Onset strength relative to the adaptive threshold needed to count as a beat. */
  onsetThreshold: z.number().min(1).max(5).default(1.5),
  reactions: audioReactionsSchema.default(DEFAULT_AUDIO_REACTIONS),
});
export type AudioConfig = z.infer<typeof audioConfigSchema>;

/* ------------------------------------------------------------------ */
/* Project                                                             */
/* ------------------------------------------------------------------ */

export const PROJECT_FORMAT_VERSION = 2;

export const projectSchema = z.object({
  format: z.literal('luma-ai-dmx-project'),
  version: z.literal(PROJECT_FORMAT_VERSION),
  id: idSchema,
  meta: z.object({
    name: nameSchema,
    show: z.string().trim().max(80).default(''),
    createdAt: z.string(),
    modifiedAt: z.string(),
    notes: z.string().max(5000).default(''),
  }),
  show: z.object({ bpm: z.number().min(20).max(300).default(120), universes: z.number().int().min(1).max(MAX_UNIVERSES).default(1) }),
  /** Custom / imported profiles. Built-in profiles are referenced by id and not embedded. */
  profiles: z.array(profileSchema).default([]),
  patch: z.array(fixtureSchema).default([]),
  groups: z.array(groupSchema).default([]),
  palettes: z.array(paletteSchema).default([]),
  scenes: z.array(sceneSchema).default([]),
  cueLists: z.array(cueListSchema).default([]),
  effects: z.array(effectSchema).default([]),
  timelines: z.array(timelineSchema).default([]),
  audio: audioConfigSchema.default({ sensitivity: 1, smoothing: 0.6, onsetThreshold: 1.5, reactions: DEFAULT_AUDIO_REACTIONS }),
  visualizer: z
    .object({ stageWidth: z.number().min(2).max(200).default(12), stageDepth: z.number().min(2).max(200).default(8) })
    .default({ stageWidth: 12, stageDepth: 8 }),
  ai: z
    .object({ notes: z.string().max(2000).default(''), recentPrompts: z.array(z.string().max(500)).max(20).default([]) })
    .default({ notes: '', recentPrompts: [] }),
});
export type Project = z.infer<typeof projectSchema>;
export type ProjectInput = z.input<typeof projectSchema>;
