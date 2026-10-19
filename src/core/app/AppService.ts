import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { projectSchema, type FixtureProfile, type Project } from '../model/schemas';
import { ProjectIndex } from '../engine/resolve';
import { Engine, type EngineSettings } from '../engine/Engine';
import { OutputManager, createAdapter, type AdapterFactory } from '../protocols/OutputManager';
import type { OutputState } from '../protocols/types';
import { validatePatch } from '../fixtures/patch';
import { createProject } from '../project/format';
import { embedUsedProfiles, loadLibrary } from './library';
import { writeFileAtomic } from '../project/store';
import { defaultSettings, salvageSettings, settingsSchema, type Settings } from '../settings/settings';
import { Logger, type LogEntry } from '../log/logger';
import { FileLogSink } from '../log/fileSink';
import type { AppInfo } from '../log/diagnostic';
import type { Updater } from './updates';
import { UsageStats } from '../telemetry/usage';
import { HardwareSession } from './hardware';
import { AudioReactive } from '../audio/reactive';
import type { AiProposal } from '../ai/actions';
import { interpreterContext } from '../ai/director';
import { FlashDetector, type FlashStatus } from '../safety/flashGuard';
import { OscServer } from '../control/osc';
import { RemoteServer } from '../control/remote';
import type { Sequence } from '../vision/locate';
import { interpretLocally } from '../ai/local/interpreter';
import type { OpenRouterModel } from '../ai/providers/openrouter';
import { OPENROUTER_KEY, SCENE_FIELDS, SCENE_HISTORY_MAX, UserError, type SceneFields, type SceneSnapshot } from './shared';
import { endLocate, onLocatePhoto } from './handlers/locate';
import { configureUpdates } from './handlers/system';
import { ROUTES, UNCOUNTED, type CommandDomain } from './routes';
import { applyControl, onOsc, remoteState } from './control';
import { onEngineError, onFrame, onOutputStatus, rendererLost } from './monitor';
import { autosave } from './files';
import type { Alert, Command, CommandOf, CommandResults, CommandType, LocatePhoto, Progress, ProjectState, RuntimeState, ValuesFrame } from '../../shared/commands';

export interface Dialogs {
  openProject(): Promise<string | null>;
  saveProject(defaultName: string): Promise<string | null>;
  openProfile(): Promise<string | null>;
  saveDiagnostic?(defaultName: string): Promise<string | null>;
  savePatchSheet?(defaultName: string, format: 'csv' | 'pdf'): Promise<string | null>;
  saveFeedback?(defaultName: string): Promise<string | null>;
  saveMvr?(defaultName: string): Promise<string | null>;
}

export interface SecretStore {
  get(name: string): string | null;
  set(name: string, value: string | null): void;
  /** Presence without decryption (polled 10× per second by the runtime state). */
  has?(name: string): boolean;
}

export interface AppServiceOptions {
  dataDir: string;
  dialogs: Dialogs;
  secrets: SecretStore;
  adapterFactory?: AdapterFactory;
  /** Start the real-time scheduler. Tests drive `engine.tick()` manually instead. */
  autoStart?: boolean;
  /** RDM over Art-Net ports (tests use a simulated node on other ports). */
  rdm?: { listenPort: number; nodePort: number; timeoutMs?: number };
  /** Persistent log directory (default `<dataDir>/logs`); `false` keeps the log in memory only. */
  logDir?: string | false;
  /** Where Electron's crashReporter writes its dumps, listed in the diagnostic. */
  crashDir?: string;
  appInfo?: AppInfo;
  updater?: Updater;
  /** HTML → PDF (Electron's printToPDF); absent in tests, where only the CSV export is available. */
  renderPdf?(html: string): Promise<Uint8Array>;
}

export { UserError };
export type { CommandDomain, CommandIn } from './routes';

/**
 * Application service: owns the project document, the engine, the outputs, AI and audio.
 * Independent from Electron (dialogs and secrets are injected), so the whole workflow is testable headless.
 * Commands are handled per domain in `./handlers/*`; the fields below are the shared state those handlers work on,
 * not an API for other layers (main and renderer only use `execute`, the events and the lifecycle methods).
 */
export class AppService extends EventEmitter<{ project: [ProjectState]; runtime: [RuntimeState]; values: [ValuesFrame]; log: [LogEntry]; locatePhoto: [LocatePhoto]; progress: [Progress] }> {
  readonly logger = new Logger();
  readonly outputs: OutputManager;
  readonly engine: Engine;
  readonly audio: AudioReactive;
  project: Project;
  index: ProjectIndex;
  /** User profile library (data folder), shared by every project. */
  userProfiles: FixtureProfile[] = [];
  projectPath: string | null = null;
  revision = 0;
  savedRevision = 0;
  /** Scene-layout history: positions/mounting of the fixtures and the visualizer settings before each scene edit. */
  sceneUndo: SceneSnapshot[] = [];
  sceneRedo: SceneSnapshot[] = [];
  settings: Settings = defaultSettings();
  readonly proposals = new Map<string, AiProposal>();
  aiBusy = false;
  aiLastError: string | null = null;
  /** Cancels the AI request in flight (`ai.cancel`). */
  aiAbort: AbortController | null = null;
  /** Project before the last applied AI proposal, for `ai.undoApply` (valid while nothing else changed). */
  lastAiUndo: { proposalId: string; project: Project; revision: number } | null = null;
  lastAiApply = 0;
  readonly alerts: Alert[] = [];
  readonly timers: NodeJS.Timeout[] = [];
  lastAutosave = Date.now();
  lastValuesEmit = 0;
  lastSourcesEmit = 0;
  lastRuntimeEmit = 0;
  readonly outputStates = new Map<string, OutputState>();
  flashDetector = new FlashDetector();
  flash: FlashStatus = { flashesPerSecond: 0, redFlashesPerSecond: 0, violation: false, reason: null };
  lastFlashLog = 0;
  readonly osc = new OscServer();
  oscConfig = '';
  readonly remote = new RemoteServer({
    state: () => remoteState(this),
    execute: (cmd) => this.handle(cmd),
    listId: (i) => this.project.cueLists[i - 1]?.id,
    locatePhoto: (frame, jpeg) => onLocatePhoto(this, frame, jpeg),
  });
  locate: { seq: Sequence; level: number; frame: number; photo: boolean; awaitingPhoto: boolean } | null = null;
  remoteConfig = '';
  timecodeAt = 0;
  logSink: FileLogSink | null = null;
  readonly usage: UsageStats;
  readonly hardware = new HardwareSession();

  constructor(readonly opts: AppServiceOptions) {
    super();
    this.usage = new UsageStats(path.join(opts.dataDir, 'usage.json'));
    this.project = createProject('Nouveau projet');
    this.index = new ProjectIndex(this.project);
    this.outputs = new OutputManager(opts.adapterFactory ?? ((c) => createAdapter(c, this.settings.sacn?.cid)));
    this.engine = new Engine(this.index, this.outputs, this.engineSettings());
    this.audio = new AudioReactive(this.engine, () => this.index, () => this.project.audio, () => this.settings.engine.priorities.audio);
    this.audio.onDropFired = (id) => this.logger.info('Audio', `Drop prédit : GO sur « ${this.project.cueLists.find((l) => l.id === id)?.name ?? id} » (désarmé)`);
    this.logger.on('entry', (e) => {
      if (e.level === 'error') this.usage.error(e.source);
      if (e.level === 'warn' || e.level === 'error') {
        this.alerts.push({ id: e.id, t: e.t, level: e.level, message: `${e.source} : ${e.message}` });
        if (this.alerts.length > 30) this.alerts.shift();
      }
      this.emit('log', e);
    });
    this.audio.onStale = (source) => this.logger.warn('Audio', `Données audio interrompues (source ${source}) : réactions audio relâchées. Fenêtre principale masquée, entrée débranchée ?`);
    this.engine.on('error', (err) => onEngineError(this, err.message));
    this.engine.on('frame', () => onFrame(this));
    this.outputs.on('status', () => onOutputStatus(this));
    this.osc.on('message', (m, ack) => void onOsc(this, m).then(ack, (err: Error) => { this.logger.warn('OSC', `${m.address} : ${err.message}`); ack(false); }));
    this.osc.on('error', (err) => this.logger.warn('OSC', err.message));
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  get settingsFile() { return path.join(this.opts.dataDir, 'settings.json'); }
  get autosaveDir() { return path.join(this.opts.dataDir, 'autosave'); }

  async init(): Promise<void> {
    await fs.mkdir(this.opts.dataDir, { recursive: true });
    if (this.opts.logDir !== false) {
      try {
        this.logSink = new FileLogSink(this.opts.logDir ?? path.join(this.opts.dataDir, 'logs'));
        this.logSink.attach(this.logger);
      } catch (err) {
        this.logger.warn('Journal', `Journal persistant indisponible : ${(err as Error).message}`);
      }
    }
    try {
      const raw = JSON.parse(await fs.readFile(this.settingsFile, 'utf8')) as unknown;
      const parsed = settingsSchema.safeParse(raw);
      if (parsed.success) this.settings = parsed.data;
      else {
        await fs.copyFile(this.settingsFile, `${this.settingsFile}.invalid`).catch(() => undefined);
        // Only the invalid sections fall back to their defaults: one bad value must not wipe the outputs or the token.
        const { settings, reset } = salvageSettings(raw);
        this.settings = settings;
        this.logger.warn('Paramètres', `Fichier de paramètres invalide (copie : settings.json.invalid) : section(s) réinitialisée(s) : ${reset.join(', ') || '—'}`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        await fs.copyFile(this.settingsFile, `${this.settingsFile}.invalid`).catch(() => undefined);
        this.logger.warn('Paramètres', `Lecture impossible, valeurs par défaut utilisées (copie : settings.json.invalid) : ${(err as Error).message}`);
      }
    }
    if (!this.settings.sacn) this.settings.sacn = { cid: randomUUID() };
    this.settings.control.remote.token ??= randomUUID();
    await this.persistSettings();
    await loadLibrary(this);
    this.setProject(this.project, true);
    this.logger.level = this.settings.logs.level;
    this.engine.updateSettings(this.engineSettings());
    await this.outputs.configure(this.settings.outputs);
    configureUpdates(this);
    await applyControl(this);
    if (this.opts.autoStart !== false) this.engine.start();
    this.timers.push(setInterval(() => void autosave(this), 15000));
    await this.usage.load();
    this.usage.enabled = this.settings.telemetry.usage;
    this.usage.session();
    this.timers.push(setInterval(() => void this.usage.flush().catch(() => undefined), 60_000));
    this.logger.info('Application', 'Démarrage terminé — sorties réelles désarmées par défaut');
    this.emitProject();
  }

  /** The main window crashed or reloaded (see `rendererLost`). */
  onRendererLost(reason: string): void {
    rendererLost(this, reason);
  }

  async dispose(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    this.engine.stop();
    endLocate(this);
    await this.osc.stop();
    await this.remote.stop();
    await this.outputs.closeAll();
    await this.usage.flush().catch(() => undefined);
  }

  get dirty(): boolean {
    return this.revision !== this.savedRevision;
  }

  engineSettings(): EngineSettings {
    const e = this.settings.engine;
    return { rateHz: e.rateHz, blackoutPolicy: e.blackoutPolicy, maxStrobeHz: e.maxStrobeHz, flashGuard: e.flashGuard, priorities: e.priorities };
  }

  async persistSettings(): Promise<void> {
    await writeFileAtomic(this.settingsFile, JSON.stringify(this.settings, null, 2), false);
  }

  getSettings(): Settings {
    return structuredClone(this.settings);
  }

  /* ------------------------------------------------------------------ */
  /* State & events                                                      */
  /* ------------------------------------------------------------------ */

  projectState(): ProjectState {
    return {
      project: this.project, library: this.userProfiles, path: this.projectPath, dirty: this.dirty, revision: this.revision, issues: validatePatch(this.index.lib, this.project.patch),
      sceneHistory: { undo: this.sceneUndo.length, redo: this.sceneRedo.length },
    };
  }

  runtimeState(): RuntimeState {
    return {
      engine: this.engine.snapshot(),
      outputs: this.outputs.status(),
      transmitting: this.outputs.transmitting,
      liveMode: this.outputs.liveMode,
      ai: { provider: this.settings.ai.provider, hasKey: this.opts.secrets.has?.(OPENROUTER_KEY) ?? !!this.opts.secrets.get(OPENROUTER_KEY), busy: this.aiBusy, lastError: this.aiLastError, model: this.settings.ai.model },
      audio: this.audio.status(),
      alerts: [...this.alerts],
      safety: { flashGuard: this.settings.engine.flashGuard, ...this.flash },
      locate: this.locate ? { active: true, frame: this.locate.frame, total: this.locate.seq.frames.length, label: this.locate.seq.frames[this.locate.frame]?.label ?? '', awaitingPhoto: this.locate.awaitingPhoto } : null,
      programmer: this.engine.getProgrammer(),
      testPattern: this.engine.testPattern ? { kind: this.engine.testPattern.kind, universes: this.engine.testPattern.universes } : null,
    };
  }

  emitProject(): void {
    this.emit('project', this.projectState());
  }

  /* ------------------------------------------------------------------ */
  /* Project mutation                                                    */
  /* ------------------------------------------------------------------ */

  /** Applies a mutation on a draft, re-validates the whole document, then swaps it in. Invalid drafts are rejected. */
  mutate(fn: (draft: Project) => void): void {
    const draft = structuredClone(this.project);
    fn(draft);
    embedUsedProfiles(draft, this.userProfiles);
    draft.meta.modifiedAt = new Date().toISOString();
    const parsed = projectSchema.safeParse(draft);
    if (!parsed.success) throw new UserError(`Modification refusée : ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join(' ; ')}`);
    this.setProject(parsed.data, false);
  }

  setProject(p: Project, reset: boolean): void {
    this.project = p;
    this.index = new ProjectIndex(p, this.userProfiles);
    if (reset) {
      this.sceneUndo = [];
      this.sceneRedo = [];
      this.engine.stopAllPlaybacks();
      this.engine.stopAllEffects();
      this.engine.timelineStop();
      this.engine.releaseAi();
      this.engine.releaseProgrammer();
      this.engine.bpm = p.show.bpm;
      this.proposals.clear();
      this.lastAiUndo = null;
    }
    this.engine.setIndex(this.index);
    this.revision++;
    if (reset) this.savedRevision = this.revision;
    this.emitProject();
  }

  sceneSnapshot(): SceneSnapshot {
    const fixtures: SceneSnapshot['fixtures'] = {};
    for (const f of this.project.patch) fixtures[f.id] = structuredClone(Object.fromEntries(SCENE_FIELDS.map((k) => [k, f[k]])) as SceneFields);
    return { visualizer: structuredClone(this.project.visualizer), fixtures };
  }

  /** Mutation recorded in the scene history (undoable); the history is untouched when the mutation is refused. */
  sceneMutate(fn: (draft: Project) => void): void {
    const undo = this.sceneUndo, redo = this.sceneRedo;
    this.sceneUndo = [...undo, this.sceneSnapshot()].slice(-SCENE_HISTORY_MAX);
    this.sceneRedo = [];
    try {
      this.mutate(fn);
    } catch (err) {
      this.sceneUndo = undo;
      this.sceneRedo = redo;
      throw err;
    }
  }

  /** Restores a scene snapshot; fixtures added since keep their placement, removed ones are ignored. */
  restoreScene(snap: SceneSnapshot): void {
    this.mutate((d) => {
      d.visualizer = structuredClone(snap.visualizer);
      for (const f of d.patch) {
        const prev = snap.fixtures[f.id];
        if (!prev) continue;
        for (const k of SCENE_FIELDS) {
          if (prev[k] === undefined) delete f[k];
          else Object.assign(f, { [k]: structuredClone(prev[k]) });
        }
        if (f.trussId && !d.visualizer.trusses.some((t) => t.id === f.trussId)) f.trussId = null;
      }
    });
  }

  getProject(): Project {
    return this.project;
  }

  /* ------------------------------------------------------------------ */
  /* Commands                                                            */
  /* ------------------------------------------------------------------ */

  async execute<T extends CommandType>(cmd: CommandOf<T>): Promise<CommandResults[T]> {
    return (await this.handle(cmd as Command)) as CommandResults[T];
  }

  /** Routes a command to the handler of its domain (the part of the type before the dot). */
  async handle(cmd: Command): Promise<unknown> {
    if (!UNCOUNTED.has(cmd.type)) this.usage.command(cmd.type);
    const domain = cmd.type.slice(0, cmd.type.indexOf('.')) as CommandDomain;
    return (ROUTES[domain] as (app: AppService, c: Command) => unknown)(this, cmd);
  }

  /* ------------------------------------------------------------------ */
  /* Music (Song-to-Show)                                                */
  /* ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ */
  /* External control (OSC)                                              */
  /* ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ */
  /* AI                                                                  */
  /* ------------------------------------------------------------------ */

  modelCache: { at: number; models: Promise<OpenRouterModel[]> } | null = null;

  /** Exposed for tests: local interpretation without storing a proposal. */
  interpretForTest(prompt: string) {
    return interpretLocally(prompt, interpreterContext(this.index, this.engine, this.settings.ai.allowStrobe));
  }

  /* ------------------------------------------------------------------ */
  /* Files                                                               */
  /* ------------------------------------------------------------------ */

}
