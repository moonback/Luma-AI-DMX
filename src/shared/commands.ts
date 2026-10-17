import { z } from 'zod';
import {
  addressSchema, attributeSchema, audioConfigSchema, cueListSchema, effectSchema, groupSchema, idSchema, nameSchema,
  paletteSchema, sceneSchema, timelineSchema, universeSchema, unitSchema,
} from '../core/model/schemas';
import { outputConfigSchema } from '../core/protocols/config';
import { settingsSchema } from '../core/settings/settings';
import type { AiExecutionReport, AiProposal } from '../core/ai/actions';
import type { Project } from '../core/model/schemas';
import type { PatchIssue } from '../core/fixtures/patch';
import type { EngineSnapshot } from '../core/engine/Engine';
import type { OutputStatus } from '../core/protocols/config';
import type { AudioStatus } from '../core/audio/reactive';
import type { ChannelChange } from '../core/protocols/virtual';
import type { SerialPortInfo } from '../core/protocols/enttec';
import type { RecoveryEntry } from '../core/project/store';
import type { LogEntry } from '../core/log/logger';
import type { Settings } from '../core/settings/settings';

/**
 * Single typed command bus between renderer and main. Every payload is validated with Zod in the main process
 * before reaching the services; results are typed through `CommandResults`.
 */

const empty = <T extends string>(type: T) => z.object({ type: z.literal(type) });
const optPath = z.string().min(1).max(1000).optional();
const fixturePatchSchema = z.object({
  name: nameSchema.optional(),
  profileId: idSchema.optional(),
  mode: z.string().min(1).optional(),
  universe: universeSchema.optional(),
  address: addressSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(16).optional(),
  position: z.object({ x: z.number().min(-100).max(100), y: z.number().min(-100).max(100) }).optional(),
  rotation: z.number().min(-360).max(360).optional(),
  notes: z.string().max(500).optional(),
});

export const commandSchema = z.discriminatedUnion('type', [
  // Project
  empty('project.get'),
  z.object({ type: z.literal('project.new'), name: nameSchema }),
  z.object({ type: z.literal('project.open'), path: optPath }),
  empty('project.save'),
  z.object({ type: z.literal('project.saveAs'), path: optPath }),
  z.object({ type: z.literal('project.export'), path: optPath }),
  z.object({
    type: z.literal('project.update'),
    meta: z.object({ name: nameSchema.optional(), show: z.string().trim().max(80).optional(), notes: z.string().max(5000).optional() }).optional(),
    show: z.object({ bpm: z.number().min(20).max(300).optional(), universes: z.number().int().min(1).max(64).optional() }).optional(),
    visualizer: z.object({ stageWidth: z.number().min(2).max(200).optional(), stageDepth: z.number().min(2).max(200).optional() }).optional(),
  }),
  empty('project.listRecovery'),
  z.object({ type: z.literal('project.openRecovery'), file: z.string().min(1).max(1000) }),
  // Profiles
  z.object({ type: z.literal('profile.import'), path: optPath }),
  z.object({ type: z.literal('profile.remove'), id: idSchema }),
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
  // Groups / palettes
  z.object({ type: z.literal('group.upsert'), group: groupSchema }),
  z.object({ type: z.literal('group.remove'), id: idSchema }),
  z.object({ type: z.literal('group.reorder'), ids: z.array(idSchema).max(500) }),
  z.object({ type: z.literal('palette.upsert'), palette: paletteSchema }),
  z.object({ type: z.literal('palette.remove'), id: idSchema }),
  z.object({ type: z.literal('palette.apply'), id: idSchema, fixtureIds: z.array(idSchema).min(1) }),
  z.object({ type: z.literal('palette.recordFromProgrammer'), name: nameSchema, kind: z.enum(['color', 'position', 'intensity', 'beam']), fixtureId: idSchema }),
  // Programmer (manual)
  z.object({ type: z.literal('programmer.set'), fixtureIds: z.array(idSchema).min(1).max(1024), values: z.record(attributeSchema, unitSchema), confirmSpecial: z.boolean().default(false) }),
  z.object({ type: z.literal('programmer.setColor'), fixtureIds: z.array(idSchema).min(1).max(1024), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  z.object({ type: z.literal('programmer.release'), fixtureIds: z.array(idSchema).optional(), attributes: z.array(attributeSchema).optional() }),
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
  empty('output.interfaces'),
  // AI
  z.object({ type: z.literal('ai.propose'), prompt: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal('ai.revise'), proposalId: z.string().uuid(), actions: z.array(z.unknown()).max(50) }),
  z.object({ type: z.literal('ai.apply'), proposalId: z.string().uuid() }),
  empty('ai.release'),
  z.object({ type: z.literal('ai.setKey'), key: z.string().trim().min(10).max(500).nullable() }),
  // Audio
  z.object({
    type: z.literal('audio.features'),
    source: z.enum(['live', 'simulated']),
    features: z.object({
      t: z.number(), level: z.number().min(0).max(1), levelDb: z.number(), energy: z.number().min(0).max(1), onset: z.boolean(),
      onsetStrength: z.number(), bpm: z.number().min(20).max(300).nullable(), bpmConfidence: z.number().min(0).max(1), energyRise: z.boolean(),
    }),
  }),
  z.object({ type: z.literal('audio.config'), config: audioConfigSchema }),
  // Settings / logs
  empty('settings.get'),
  z.object({ type: z.literal('settings.update'), settings: settingsSchema }),
  empty('logs.recent'),
]);
export type Command = z.infer<typeof commandSchema>;
export type CommandType = Command['type'];
export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;
/** What the renderer sends (Zod input: defaulted fields optional). */
export type CommandInput = z.input<typeof commandSchema>;

export interface ProjectState {
  project: Project;
  path: string | null;
  dirty: boolean;
  revision: number;
  issues: PatchIssue[];
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
  ai: { provider: 'local' | 'anthropic'; hasKey: boolean; busy: boolean; lastError: string | null; model: string };
  audio: AudioStatus;
  alerts: Alert[];
  programmer: Record<string, Record<string, number>>;
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
  'project.update': Void;
  'project.listRecovery': RecoveryEntry[];
  'project.openRecovery': { opened: boolean; migratedFrom: number | null };
  'profile.import': { imported: string[]; errors: string[] };
  'profile.remove': Void;
  'fixture.add': { ids: string[] };
  'fixture.update': Void;
  'fixture.remove': Void;
  'fixture.duplicate': { ids: string[] };
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
  'output.interfaces': string[];
  'ai.propose': AiProposal;
  'ai.revise': AiProposal;
  'ai.apply': AiExecutionReport;
  'ai.release': Void;
  'ai.setKey': Void;
  'audio.features': Void;
  'audio.config': Void;
  'settings.get': Settings;
  'settings.update': Void;
  'logs.recent': LogEntry[];
}

export type CommandResponse<T extends CommandType> = { ok: true; data: CommandResults[T] } | { ok: false; error: string };

export interface AppEvents {
  project: ProjectState;
  runtime: RuntimeState;
  values: ValuesFrame;
  log: LogEntry;
}
