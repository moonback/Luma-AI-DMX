import type { Command, CommandType } from '../../shared/commands';
import { handleProject } from './handlers/project';
import { handleFixtures } from './handlers/fixtures';
import { handleProgramming } from './handlers/programming';
import { handleMusic } from './handlers/music';
import { handleLocate } from './handlers/locate';
import { handleOutput } from './handlers/output';
import { handleAi } from './handlers/ai';
import { handleSystem } from './handlers/system';
import type { AppService } from './AppService';

type Prefix<T> = T extends `${infer P}.${string}` ? P : never;
/** Part of a command type before the dot (`project`, `fixture`, `cue`…): one handler per domain. */
export type CommandDomain = Prefix<CommandType>;
export type CommandIn<D extends CommandDomain> = Extract<Command, { type: `${D}.${string}` }>;

/** Polling and streaming commands, left out of the usage statistics (they say nothing about what is used). */
export const UNCOUNTED = new Set<CommandType>(['audio.features', 'output.universe', 'output.virtualHistory', 'project.get', 'settings.get', 'logs.recent', 'app.info', 'usage.get', 'license.get', 'music.loadAudio']);

/** Exhaustive at compile time: a new command prefix without a handler does not build. */
export const ROUTES: { [D in CommandDomain]: (app: AppService, cmd: CommandIn<D>) => unknown } = {
  project: handleProject, onboarding: handleProject,
  profile: handleFixtures, ofl: handleFixtures, fixture: handleFixtures, patch: handleFixtures,
  group: handleProgramming, palette: handleProgramming, programmer: handleProgramming, scene: handleProgramming,
  cue: handleProgramming, cueList: handleProgramming, effect: handleProgramming, timeline: handleProgramming,
  music: handleMusic, locate: handleLocate,
  engine: handleOutput, output: handleOutput, rdm: handleOutput, hardware: handleOutput,
  ai: handleAi,
  audio: handleSystem, settings: handleSystem, logs: handleSystem, diagnostic: handleSystem, app: handleSystem,
  usage: handleSystem, license: handleSystem, feedback: handleSystem, storage: handleSystem,
};
