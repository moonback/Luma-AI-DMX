import { z } from 'zod';
import {
  addressSchema, attributeKeySchema, audioConfigSchema, cueListSchema, effectSchema, groupSchema, idSchema, nameSchema,
  paletteSchema, sceneSchema, timelineSchema, universeSchema, unitSchema, songAnalysisSchema, SECTION_LABELS,
  stageShapeSchema, thrustSchema, stageMarkerSchema, stageViewSchema, trussSchema, fixtureMountSchema, performerSchema, screenSchema, propSchema,
  hexColorSchema, moodSchema, SHOW_BEAMS, SHOW_EFFECTS, SHOW_EXTRAS, SHOW_MOVEMENTS, profileSchema,
} from '../core/model/schemas';
import { outputConfigSchema } from '../core/protocols/config';
import { settingsSchema } from '../core/settings/settings';
import type { AiExecutionReport, AiProposal } from '../core/ai/actions';
import type { FixtureProfile, Project } from '../core/model/schemas';
import type { PatchIssue } from '../core/fixtures/patch';
import type { EngineSnapshot } from '../core/engine/Engine';
import type { OutputStatus } from '../core/protocols/config';
import type { AudioStatus } from '../core/audio/reactive';
import type { ChannelChange } from '../core/protocols/virtual';
import type { SerialPortInfo } from '../core/protocols/enttec';
import type { RdmDevice } from '../core/protocols/rdm';
import type { RecoveryEntry } from '../core/project/store';
import type { LogEntry } from '../core/log/logger';
import type { Settings } from '../core/settings/settings';
import type { UpdateStatus } from '../core/app/updates';
import type { UsageData } from '../core/telemetry/usage';
import type { TestPatternKind } from '../core/engine/testPattern';
import type { OpenRouterModel } from '../core/ai/providers/openrouter';
import type { PhotoScene } from '../core/ai/sceneFromPhoto';
import type { PhotoProfile } from '../core/ai/profileFromPhoto';
import type { StorageReport } from '../core/app/storage';
import type { LicenseStatus } from '../core/license/license';
import type { AiUsageDay } from '../core/ai/usage';
import type { HardwareSession } from '../core/app/hardware';

/**
 * Single typed command bus between renderer and main. Every payload is validated with Zod in the main process
 * before reaching the services; results are typed through `CommandResults`.
 */

const empty = <T extends string>(type: T) => z.object({ type: z.literal(type) });
const optPath = z.string().min(1).max(1000).optional();
/** Downscaled photo as a data URL. */
const photoSchema = z.string().max(8_000_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);
const fixturePatchSchema = z.object({
  name: nameSchema.optional(),
  profileId: idSchema.optional(),
  mode: z.string().min(1).optional(),
  universe: universeSchema.optional(),
  address: addressSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(16).optional(),
  position: z.object({ x: z.number().min(-100).max(100), y: z.number().min(-100).max(100) }).optional(),
  rotation: z.number().min(-360).max(360).optional(),
  height: z.number().min(0).max(50).optional(),
  notes: z.string().max(500).optional(),
  mount: fixtureMountSchema.optional(),
  mountTilt: z.number().min(-90).max(90).optional(),
  /** null detaches the fixture from its truss. */
  trussId: idSchema.nullable().optional(),
});

export const commandSchema = z.discriminatedUnion('type', [
  // Project
  empty('project.get'),
  z.object({ type: z.literal('project.new'), name: nameSchema }),
  z.object({ type: z.literal('project.open'), path: optPath }),
  empty('project.save'),
  z.object({ type: z.literal('project.saveAs'), path: optPath }),
  z.object({ type: z.literal('project.export'), path: optPath }),
  /** Patch and positions as MVR (Capture, Vectorworks, grandMA3…). */
  z.object({ type: z.literal('project.exportMvr'), path: optPath }),
  z.object({
    type: z.literal('project.update'),
    meta: z.object({ name: nameSchema.optional(), show: z.string().trim().max(80).optional(), notes: z.string().max(5000).optional() }).optional(),
    show: z.object({ bpm: z.number().min(20).max(300).optional(), universes: z.number().int().min(1).max(64).optional() }).optional(),
    // No `.default()` here: absent fields must stay absent so a partial update never resets the others.
    visualizer: z.object({
      stageWidth: z.number().min(2).max(200).optional(),
      stageDepth: z.number().min(2).max(200).optional(),
      shape: stageShapeSchema.optional(),
      thrust: thrustSchema.optional(),
      cyclo: z.boolean().optional(),
      markers: z.array(stageMarkerSchema).max(64).optional(),
      views: z.array(stageViewSchema).max(20).optional(),
      trusses: z.array(trussSchema).max(64).optional(),
      performers: z.array(performerSchema).max(64).optional(),
      screens: z.array(screenSchema).max(16).optional(),
      props: z.array(propSchema).max(256).optional(),
    }).optional(),
  }),
  /** Scene-layout history (positions, mounting, trusses, stage settings): independent from the other edits. */
  empty('scene.undo'),
  empty('scene.redo'),
  /** Project-wide history: every edit of the show (patch, scenes, cues, effects, timelines, AI, layout). */
  empty('project.undo'),
  empty('project.redo'),
  empty('project.listRecovery'),
  /** Autosaves newer than their saved file (offered at start-up after a crash). */
  empty('project.recoveryCandidates'),
  z.object({ type: z.literal('project.openRecovery'), file: z.string().min(1).max(1000) }),
  /** Opens one of the built-in fictional demonstration projects (unsaved copy). */
  z.object({ type: z.literal('project.openDemo'), id: z.string().min(1).max(40) }),
  z.object({ type: z.literal('onboarding.update'), completed: z.boolean().optional(), checklistHidden: z.boolean().optional() }),
  // Profiles
  z.object({ type: z.literal('profile.import'), path: optPath }),
  z.object({ type: z.literal('profile.remove'), id: idSchema }),
  /** Writes library profiles (all when `ids` is omitted) as a Luma JSON file `{ profiles: [...] }`, re-importable by `profile.import`. */
  z.object({ type: z.literal('profile.export'), ids: z.array(idSchema).min(1).max(500).optional(), path: optPath }),
  /** Saves a profile built in the app (photo of the manual) to the library and the project. */
  z.object({ type: z.literal('profile.save'), profile: profileSchema }),
  empty('ofl.manufacturers'),
  z.object({ type: z.literal('ofl.fixtures'), manufacturer: z.string().regex(/^[a-z0-9-]+$/) }),
  z.object({
    type: z.literal('profile.importOfl'),
    source: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('online'), manufacturer: z.string().regex(/^[a-z0-9-]+$/), key: z.string().regex(/^[a-z0-9-]+$/) }),
      z.object({ kind: z.literal('file'), path: optPath, manufacturerName: z.string().trim().min(1).max(80).default('Open Fixture Library') }),
    ]),
  }),
  /** MA Fixture Share library installed with grandMA2 onPC (keys are the library file name parts, looked up in its index). */
  empty('ma2lib.manufacturers'),
  z.object({ type: z.literal('ma2lib.fixtures'), manufacturer: z.string().min(1).max(200) }),
  z.object({ type: z.literal('profile.importMa2Lib'), manufacturer: z.string().min(1).max(200), fixture: z.string().min(1).max(200) }),
  // Patch
  z.object({
    type: z.literal('fixture.add'),
    profileId: idSchema,
    mode: z.string().min(1),
    universe: universeSchema,
    address: addressSchema.nullable(),
    count: z.number().int().min(1).max(128),
    namePrefix: nameSchema,
    tags: z.array(z.string().trim().min(1).max(32)).max(16).default([]),
  }),
  z.object({ type: z.literal('fixture.update'), id: idSchema, patch: fixturePatchSchema }),
  z.object({ type: z.literal('fixture.remove'), ids: z.array(idSchema).min(1) }),
  z.object({ type: z.literal('fixture.duplicate'), ids: z.array(idSchema).min(1) }),
  /** Places several fixtures in one scene-history step (e.g. hanging the rig on its trusses). */
  z.object({
    type: z.literal('fixture.place'),
    placements: z.array(z.object({
      id: idSchema,
      position: z.object({ x: z.number().min(-100).max(100), y: z.number().min(-100).max(100) }),
      height: z.number().min(0).max(50),
      trussId: idSchema.nullable(),
      mount: fixtureMountSchema.optional(),
      /** Mounting rotation in degrees (0 = facing audience). Applied only when present. */
      rotation: z.number().min(-360).max(360).optional(),
    })).min(1).max(4096),
  }),
  // Groups / palettes
  z.object({ type: z.literal('group.upsert'), group: groupSchema }),
  z.object({ type: z.literal('group.remove'), id: idSchema }),
  z.object({ type: z.literal('group.reorder'), ids: z.array(idSchema).max(500) }),
  z.object({ type: z.literal('palette.upsert'), palette: paletteSchema }),
  z.object({ type: z.literal('palette.remove'), id: idSchema }),
  z.object({ type: z.literal('palette.apply'), id: idSchema, fixtureIds: z.array(idSchema).min(1) }),
  z.object({ type: z.literal('palette.recordFromProgrammer'), name: nameSchema, kind: z.enum(['color', 'position', 'intensity', 'beam']), fixtureId: idSchema }),
  // Programmer (manual)
  z.object({ type: z.literal('programmer.set'), fixtureIds: z.array(idSchema).min(1).max(1024), values: z.record(attributeKeySchema, unitSchema), confirmSpecial: z.boolean().default(false) }),
  z.object({ type: z.literal('programmer.setColor'), fixtureIds: z.array(idSchema).min(1).max(1024), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), cell: z.number().int().min(1).max(512).optional(), module: z.string().trim().min(1).max(48).optional() }),
  z.object({ type: z.literal('programmer.release'), fixtureIds: z.array(idSchema).optional(), attributes: z.array(attributeKeySchema).optional() }),
  // Scenes
  z.object({ type: z.literal('scene.record'), name: nameSchema, fixtureIds: z.array(idSchema).optional() }),
  z.object({ type: z.literal('scene.upsert'), scene: sceneSchema }),
  z.object({ type: z.literal('scene.remove'), id: idSchema }),
  z.object({ type: z.literal('scene.duplicate'), id: idSchema }),
  z.object({ type: z.literal('scene.load'), id: idSchema }),
  z.object({ type: z.literal('scene.preview'), id: idSchema }),
  // Cue lists
  z.object({ type: z.literal('cueList.upsert'), cueList: cueListSchema }),
  z.object({ type: z.literal('cueList.remove'), id: idSchema }),
  z.object({ type: z.literal('cue.go'), listId: idSchema }),
  z.object({ type: z.literal('cue.back'), listId: idSchema }),
  z.object({ type: z.literal('cue.goto'), listId: idSchema, index: z.number().int().min(0) }),
  z.object({ type: z.literal('cue.pause'), listId: idSchema }),
  z.object({ type: z.literal('cue.resume'), listId: idSchema }),
  z.object({ type: z.literal('cue.stop'), listId: idSchema }),
  // Effects
  z.object({ type: z.literal('effect.upsert'), effect: effectSchema }),
  z.object({ type: z.literal('effect.remove'), id: idSchema }),
  z.object({ type: z.literal('effect.start'), id: idSchema }),
  z.object({ type: z.literal('effect.stop'), instanceId: z.string().min(1).max(64) }),
  z.object({ type: z.literal('effect.pause'), instanceId: z.string().min(1).max(64), paused: z.boolean() }),
  empty('effect.stopAll'),
  // Timeline
  z.object({ type: z.literal('timeline.upsert'), timeline: timelineSchema }),
  z.object({ type: z.literal('timeline.remove'), id: idSchema }),
  z.object({ type: z.literal('timeline.play'), id: idSchema }),
  empty('timeline.pause'),
  /** External timecode position (MTC/LTC decoded in the renderer, or OSC): the timeline chases it. */
  z.object({ type: z.literal('timeline.timecode'), seconds: z.number().min(0).max(86400), timelineId: idSchema.optional() }),
  // Camera localisation
  z.object({
    type: z.literal('locate.begin'),
    confirmed: z.literal(true),
    mode: z.enum(['binary', 'sequential']),
    /** Intensity of lit fixtures: capped at 60 % (people may be on stage, cameras saturate anyway). */
    level: z.number().min(0.05).max(0.6),
    fixtureIds: z.array(idSchema).max(2048).optional(),
    /** Photos come from a smartphone through the remote page instead of a local webcam. */
    photo: z.boolean().default(false),
  }),
  z.object({ type: z.literal('locate.frame'), index: z.number().int().min(0).max(5000) }),
  empty('locate.end'),
  z.object({ type: z.literal('locate.apply'), updates: z.array(z.object({ fixtureId: idSchema, x: z.number().min(-100).max(100), y: z.number().min(-100).max(100), height: z.number().min(0).max(50).optional() })).min(1).max(2048) }),
  // Music (Song-to-Show)
  z.object({ type: z.literal('music.addTrack'), name: z.string().trim().min(1).max(200), hash: z.string().regex(/^[0-9a-f]{64}$/), analysis: songAnalysisSchema }),
  z.object({ type: z.literal('music.storeAudio'), hash: z.string().regex(/^[0-9a-f]{64}$/), data: z.instanceof(Uint8Array).refine((d) => d.byteLength > 0 && d.byteLength <= 500 * 1024 * 1024, 'fichier audio vide ou trop volumineux (500 Mo max)') }),
  z.object({ type: z.literal('music.loadAudio'), hash: z.string().regex(/^[0-9a-f]{64}$/) }),
  z.object({ type: z.literal('music.removeTrack'), id: idSchema }),
  z.object({ type: z.literal('music.setSection'), trackId: idSchema, index: z.number().int().min(0).max(300), label: z.enum(SECTION_LABELS).optional(), locked: z.boolean().optional() }),
  z.object({ type: z.literal('music.generate'), trackId: idSchema, intent: z.string().max(500), nextVariant: z.boolean().default(false), mood: moodSchema.optional() }),
  /** Hand edit of one section of the plan (only the fields given change). */
  z.object({
    type: z.literal('music.updateSection'), trackId: idSchema, index: z.number().int().min(0).max(300),
    patch: z.object({
      energy: z.number().int().min(0).max(5), palette: z.array(hexColorSchema).min(1).max(4), effect: z.enum(SHOW_EFFECTS), effectBeats: z.number().min(0.5).max(16),
      movement: z.enum(SHOW_MOVEMENTS), beam: z.enum(SHOW_BEAMS), extras: z.array(z.enum(SHOW_EXTRAS)).max(SHOW_EXTRAS.length), accents: z.boolean(), locked: z.boolean(),
    }).partial(),
  }),
  z.object({ type: z.literal('music.regenerateSection'), trackId: idSchema, index: z.number().int().min(0).max(300), instruction: z.string().max(200).default('') }),
  /** Back to the plan before the last change (calling it again swaps back). */
  z.object({ type: z.literal('music.restorePrevious'), trackId: idSchema }),
  /** Intention suggestions for a track: with OpenRouter when configured, else from the measured sound. */
  z.object({ type: z.literal('music.suggestIntents'), trackId: idSchema, intent: z.string().max(500).default('') }),
  empty('timeline.stop'),
  z.object({ type: z.literal('timeline.seek'), seconds: z.number().min(0).max(86400) }),
  // Engine
  z.object({ type: z.literal('engine.master'), value: unitSchema }),
  z.object({ type: z.literal('engine.blackout'), on: z.boolean() }),
  z.object({ type: z.literal('engine.bpm'), bpm: z.number().min(20).max(300) }),
  empty('engine.releaseAll'),
  // Outputs
  z.object({ type: z.literal('output.configure'), outputs: z.array(outputConfigSchema).max(16) }),
  z.object({ type: z.literal('output.arm'), id: z.string().min(1).max(64), confirmed: z.literal(true) }),
  z.object({ type: z.literal('output.disarm'), id: z.string().min(1).max(64) }),
  z.object({ type: z.literal('output.transmit'), on: z.boolean() }),
  z.object({ type: z.literal('output.universe'), universe: universeSchema }),
  z.object({ type: z.literal('output.virtualHistory'), limit: z.number().int().min(1).max(2000).default(200) }),
  z.object({ type: z.literal('output.inject'), injection: z.discriminatedUnion('type', [z.object({ type: z.literal('fail-next'), count: z.number().int().min(1).max(1000) }), z.object({ type: z.literal('disconnect') }), z.object({ type: z.literal('reconnect') })]) }),
  empty('output.listSerial'),
  // RDM (Art-Net outputs): universe = local universe of the output's universe map.
  z.object({ type: z.literal('rdm.discover'), outputId: z.string().min(1).max(64), universe: universeSchema }),
  z.object({ type: z.literal('rdm.identify'), outputId: z.string().min(1).max(64), universe: universeSchema, uid: z.string().regex(/^[0-9A-Fa-f]{4}:[0-9A-Fa-f]{8}$/), on: z.boolean() }),
  z.object({ type: z.literal('rdm.setAddress'), outputId: z.string().min(1).max(64), universe: universeSchema, uid: z.string().regex(/^[0-9A-Fa-f]{4}:[0-9A-Fa-f]{8}$/), address: addressSchema, confirmed: z.literal(true) }),
  empty('output.interfaces'),
  // AI
  /** `continueThread`: the last exchanges are sent to the remote model (follow-up requests). */
  z.object({ type: z.literal('ai.propose'), prompt: z.string().trim().min(1).max(2000), continueThread: z.boolean().optional() }),
  empty('ai.resetThread'),
  /** OpenRouter tokens and cost of today and of the month, with the monthly budget. */
  empty('ai.usage'),
  z.object({ type: z.literal('ai.revise'), proposalId: z.string().uuid(), actions: z.array(z.unknown()).max(50) }),
  z.object({ type: z.literal('ai.apply'), proposalId: z.string().uuid() }),
  empty('ai.release'),
  /** Cancels the AI request in flight (proposal, photo, show planning): nothing is applied. */
  empty('ai.cancel'),
  /** Restores the project as it was before the last applied proposal and releases its AI layer and effects. */
  empty('ai.undoApply'),
  z.object({ type: z.literal('ai.listModels'), refresh: z.boolean().default(false) }),
  /** Photo of a real stage (downscaled JPEG/PNG data URL) → trusses, set pieces and screens, for review before applying. */
  z.object({ type: z.literal('ai.sceneFromPhoto'), image: photoSchema }),
  /** Photos of a manual's DMX chart (consecutive pages) → fixture profile, for review before `profile.save`. */
  z.object({ type: z.literal('ai.profileFromPhoto'), images: z.array(photoSchema).min(1).max(4) }),
  z.object({ type: z.literal('ai.setKey'), key: z.string().trim().min(10).max(500).nullable() }),
  /** Gemini API key of the voice assistant (encrypted in the OS keychain, never sent to the renderer). */
  z.object({ type: z.literal('ai.voiceKey'), key: z.string().trim().min(10).max(500).nullable() }),
  /** Single-use ephemeral token for one Gemini Live session: the renderer never holds the real key. */
  empty('ai.voiceToken'),
  // Audio
  z.object({
    type: z.literal('audio.features'),
    source: z.enum(['live', 'simulated', 'track']),
    features: z.object({
      t: z.number(), level: z.number().min(0).max(1), levelDb: z.number(), energy: z.number().min(0).max(1), onset: z.boolean(),
      onsetStrength: z.number(), bpm: z.number().min(20).max(300).nullable(), bpmConfidence: z.number().min(0).max(1), energyRise: z.boolean(),
      beat: z.boolean().default(false), barPosition: z.number().int().min(0).max(3).nullable().default(null), tempoLocked: z.boolean().default(false),
      bass: unitSchema.default(0), brightness: unitSchema.default(0), onsetDensity: unitSchema.default(0),
      prediction: z.object({ kind: z.enum(['drop', 'chorus']), confidence: unitSchema, at: z.number(), inBeats: z.number().min(0).max(64), source: z.enum(['live', 'track']) }).nullable().default(null),
    }),
  }),
  /** Arms (or disarms) the predicted-drop GO for one shot. Never armed at start-up. */
  z.object({ type: z.literal('audio.armDrop'), on: z.boolean() }),
  /** The renderer stopped its audio source on purpose (not an interruption). */
  empty('audio.release'),
  z.object({ type: z.literal('audio.config'), config: audioConfigSchema }),
  // Settings / logs
  empty('settings.get'),
  /** Recent projects and onboarding state are owned by the main process: the values sent here for them are ignored. */
  z.object({ type: z.literal('settings.update'), settings: settingsSchema }),
  z.object({ type: z.literal('settings.forgetRecent'), paths: z.array(z.string().max(1000)).min(1).max(10) }),
  empty('logs.recent'),
  z.object({ type: z.literal('diagnostic.export'), path: optPath }),
  /**
   * Raw test pattern on some universes (hardware validation with a DMX tester). Starting one needs `confirmed`:
   * every channel is driven, reset and lamp channels included. `pattern: null` stops it.
   */
  z.object({ type: z.literal('output.testPattern'), pattern: z.enum(['signature', 'walk', 'ramp', 'zero']).nullable(), universes: z.array(universeSchema).min(1).max(64).default([1]), confirmed: z.boolean().default(false) }),
  empty('hardware.report'),
  /** Patch sheet for the crew: CSV (spreadsheet) or PDF (print). */
  z.object({ type: z.literal('patch.exportSheet'), format: z.enum(['csv', 'pdf']), path: optPath }),
  /** Installation plan (PDF): equipment, power, DMX cabling, rigging, checks and commissioning steps. */
  z.object({ type: z.literal('patch.exportPlan'), path: optPath }),
  // Beta programme: local usage statistics and feedback files
  empty('usage.get'),
  empty('usage.clear'),
  z.object({
    type: z.literal('feedback.export'),
    kind: z.enum(['bug', 'idea', 'show-report', 'other']),
    message: z.string().trim().min(1).max(5000),
    contact: z.string().trim().max(200).default(''),
    includeDiagnostic: z.boolean().default(true),
    includeUsage: z.boolean().default(true),
    path: optPath,
  }),
  // Licence
  empty('license.get'),
  z.object({ type: z.literal('license.activate'), key: z.string().trim().min(10).max(2000) }),
  empty('license.remove'),
  // Application
  empty('app.info'),
  empty('app.checkUpdates'),
  // Local data (imported audio, AI cache, recovery copies)
  empty('storage.report'),
  z.object({ type: z.literal('storage.purge'), music: z.boolean().default(false), aiCache: z.boolean().default(false), autosave: z.boolean().default(false) }),
]);
export type Command = z.infer<typeof commandSchema>;
export type CommandType = Command['type'];
export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;
/** What the renderer sends (Zod input: defaulted fields optional). */
export type CommandInput = z.input<typeof commandSchema>;

export interface ProjectState {
  project: Project;
  /** User profile library (imported profiles, available in every project). */
  library: FixtureProfile[];
  path: string | null;
  dirty: boolean;
  revision: number;
  issues: PatchIssue[];
  /** Number of scene-layout steps that can be undone / redone. */
  sceneHistory: { undo: number; redo: number };
  /** Project-wide undo / redo, with the label of the next step each way. */
  history?: { undo: number; redo: number; undoLabel: string | null; redoLabel: string | null };
}

export interface Alert {
  id: number;
  t: string;
  level: 'warn' | 'error';
  message: string;
}

export interface RuntimeState {
  engine: EngineSnapshot;
  outputs: OutputStatus[];
  transmitting: boolean;
  liveMode: boolean;
  ai: { provider: 'local' | 'openrouter'; hasKey: boolean; hasVoiceKey: boolean; busy: boolean; lastError: string | null; model: string };
  audio: AudioStatus;
  alerts: Alert[];
  /** Camera localisation in progress (frame shown, photo awaited from the smartphone). */
  locate: { active: boolean; frame: number; total: number; label: string; awaitingPhoto: boolean } | null;
  /** Photosensitive flash guard state (estimate from the computed state). */
  safety: { flashGuard: 'off' | 'warn' | 'limit'; flashesPerSecond: number; redFlashesPerSecond: number; violation: boolean; reason: string | null };
  programmer: Record<string, Record<string, number>>;
  /** Raw DMX test pattern overriding some universes (hardware validation). */
  testPattern: { kind: TestPatternKind; universes: number[] } | null;
}

export interface ValuesFrame {
  values: Record<string, Record<string, number>>;
  sources?: Record<string, Record<string, string>>;
}

export interface UniverseView {
  universe: number;
  computed: number[];
  transmitted: { outputId: string; outputName: string; at: number; data: number[] }[];
}

type Void = { ok: true };
export interface CommandResults {
  'project.get': ProjectState;
  'project.new': Void;
  'project.open': { opened: boolean; migratedFrom: number | null };
  'project.save': { path: string | null };
  'project.saveAs': { path: string | null };
  'project.export': { path: string | null };
  'project.exportMvr': { path: string | null };
  'project.update': Void;
  'scene.undo': Void;
  'scene.redo': Void;
  'project.undo': { label: string | null };
  'project.redo': { label: string | null };
  'project.listRecovery': RecoveryEntry[];
  'project.recoveryCandidates': RecoveryEntry[];
  'project.openRecovery': { opened: boolean; migratedFrom: number | null };
  'project.openDemo': Void;
  'onboarding.update': Void;
  'profile.import': { imported: string[]; errors: string[]; warnings: string[] };
  'profile.remove': Void;
  'profile.export': { path: string | null; count: number };
  'profile.save': { profileId: string };
  'ofl.manufacturers': { key: string; name: string }[];
  'ofl.fixtures': string[];
  'profile.importOfl': { imported: string | null; profileId: string | null; warnings: string[]; errors: string[] };
  'ma2lib.manufacturers': { dir: string | null; manufacturers: string[] };
  'ma2lib.fixtures': { key: string; modes: number }[];
  'profile.importMa2Lib': { imported: string | null; profileId: string | null; warnings: string[]; errors: string[] };
  'fixture.add': { ids: string[] };
  'fixture.update': Void;
  'fixture.remove': Void;
  'fixture.duplicate': { ids: string[] };
  'fixture.place': Void;
  'group.upsert': Void;
  'group.remove': Void;
  'group.reorder': Void;
  'palette.upsert': Void;
  'palette.remove': Void;
  'palette.apply': { applied: number };
  'palette.recordFromProgrammer': { id: string };
  'programmer.set': { applied: number; rejected: { fixtureId: string; attribute: string; reason: string }[] };
  'programmer.setColor': { applied: number };
  'programmer.release': Void;
  'scene.record': { id: string };
  'scene.upsert': Void;
  'scene.remove': Void;
  'scene.duplicate': { id: string };
  'scene.load': Void;
  'scene.preview': ValuesFrame;
  'cueList.upsert': Void;
  'cueList.remove': Void;
  'cue.go': { ok: boolean };
  'cue.back': { ok: boolean };
  'cue.goto': { ok: boolean };
  'cue.pause': Void;
  'cue.resume': Void;
  'cue.stop': Void;
  'effect.upsert': Void;
  'effect.remove': Void;
  'effect.start': { instanceId: string };
  'effect.stop': Void;
  'effect.pause': Void;
  'effect.stopAll': Void;
  'timeline.upsert': Void;
  'timeline.remove': Void;
  'timeline.play': Void;
  'timeline.pause': Void;
  'timeline.timecode': { chasing: boolean };
  'locate.begin': { fixtureIds: string[]; frames: { label: string; lit: string[] }[]; codes: Record<string, number>; mode: 'binary' | 'sequential'; bits: number; settleMs: number; captureMs: number };
  'locate.frame': Void;
  'locate.end': Void;
  'locate.apply': { updated: number };
  'music.addTrack': { id: string; cached: boolean };
  'music.storeAudio': Void;
  'music.loadAudio': Uint8Array | null;
  'music.removeTrack': Void;
  'music.setSection': Void;
  'music.generate': { timelineId: string; notices: string[]; provider: 'local' | 'openrouter' };
  'music.regenerateSection': { timelineId: string; notices: string[]; provider: 'local' | 'openrouter' };
  'music.updateSection': { timelineId: string; notices: string[]; provider: 'local' | 'openrouter' };
  'music.restorePrevious': { timelineId: string; notices: string[]; provider: 'local' | 'openrouter' };
  'music.suggestIntents': { suggestions: string[]; provider: 'local' | 'openrouter'; model: string | null; notices: string[] };
  'timeline.stop': Void;
  'timeline.seek': Void;
  'engine.master': Void;
  'engine.blackout': Void;
  'engine.bpm': Void;
  'engine.releaseAll': Void;
  'output.configure': Void;
  'output.arm': Void;
  'output.disarm': Void;
  'output.transmit': Void;
  'output.universe': UniverseView;
  'output.virtualHistory': ChannelChange[];
  'output.inject': Void;
  'output.listSerial': { ports: SerialPortInfo[]; error: string | null };
  'rdm.discover': { devices: RdmDevice[] };
  'rdm.identify': Void;
  'rdm.setAddress': Void;
  'output.interfaces': string[];
  'ai.propose': AiProposal;
  'ai.revise': AiProposal;
  'ai.apply': AiExecutionReport;
  'ai.release': Void;
  'ai.cancel': Void;
  'ai.resetThread': Void;
  'ai.usage': { today: AiUsageDay; month: AiUsageDay; budget: number | null };
  'ai.undoApply': Void;
  'ai.listModels': OpenRouterModel[];
  'ai.setKey': Void;
  'ai.voiceKey': Void;
  'ai.voiceToken': { token: string; model: string };
  'ai.sceneFromPhoto': PhotoScene & { model: string; notices: string[] };
  'ai.profileFromPhoto': PhotoProfile & { model: string; notices: string[] };
  'audio.features': Void;
  'audio.config': Void;
  'audio.armDrop': Void;
  'audio.release': Void;
  'settings.get': Settings;
  'settings.update': Void;
  'settings.forgetRecent': Void;
  'logs.recent': LogEntry[];
  'diagnostic.export': { path: string | null };
  'patch.exportSheet': { path: string | null };
  'patch.exportPlan': { path: string | null };
  'output.testPattern': Void;
  'hardware.report': { markdown: string; json: ReturnType<HardwareSession['reportJson']> };
  'usage.get': { enabled: boolean; data: UsageData };
  'usage.clear': Void;
  'feedback.export': { path: string | null };
  'license.get': LicenseStatus;
  'license.activate': LicenseStatus;
  'license.remove': LicenseStatus;
  'app.info': { name: string; version: string; updates: UpdateStatus };
  'app.checkUpdates': UpdateStatus;
  'storage.report': StorageReport;
  'storage.purge': { removed: number };
}

export type CommandResponse<T extends CommandType> = { ok: true; data: CommandResults[T] } | { ok: false; error: string };

/** Photo of one localisation frame uploaded from the smartphone (JPEG, base64). */
export interface LocatePhoto {
  frame: number;
  jpeg: string;
}

/** Real step of a long operation (show generation), for the progress dialog. */
export interface Progress {
  op: 'music';
  step: 'plan' | 'cache' | 'request' | 'compile';
}

export interface AppEvents {
  progress: Progress;
  project: ProjectState;
  runtime: RuntimeState;
  values: ValuesFrame;
  log: LogEntry;
  locatePhoto: LocatePhoto;
}
