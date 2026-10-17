import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { projectSchema, type FixtureValues, type Project } from '../model/schemas';
import { ProjectIndex } from '../engine/resolve';
import { Engine, type EngineSettings } from '../engine/Engine';
import { OutputManager, createAdapter, type AdapterFactory } from '../protocols/OutputManager';
import { localIpv4Addresses } from '../protocols/artnet';
import { listSerialPorts } from '../protocols/enttec';
import { VirtualOutput } from '../protocols/virtual';
import type { OutputState } from '../protocols/types';
import { attributeClass } from '../fixtures/attributes';
import { colorToAttributes } from '../fixtures/color';
import { channelCount, parseProfileFile } from '../fixtures/profiles';
import { BUILTIN_PROFILES } from '../fixtures/builtinProfiles';
import { findFreeAddress, validatePatch } from '../fixtures/patch';
import { createProject, ProjectLoadError, serializeProject } from '../project/format';
import { listRecovery, loadProjectFile, saveProjectFile, writeFileAtomic } from '../project/store';
import { defaultSettings, settingsSchema, type Settings } from '../settings/settings';
import { Logger, type LogEntry } from '../log/logger';
import { AudioReactive } from '../audio/reactive';
import { hexToRgb } from '../util/math';
import type { AiProposal } from '../ai/actions';
import { buildProposal, executeProposal, interpreterContext, proposeLocally } from '../ai/director';
import { interpretLocally } from '../ai/local/interpreter';
import { DEFAULT_ANTHROPIC_MODEL, describeClaudeError, describeRig, proposeWithClaude } from '../ai/providers/anthropic';
import type { Alert, Command, CommandOf, CommandResults, CommandType, ProjectState, RuntimeState, UniverseView, ValuesFrame } from '../../shared/commands';

export interface Dialogs {
  openProject(): Promise<string | null>;
  saveProject(defaultName: string): Promise<string | null>;
  openProfile(): Promise<string | null>;
}

export interface SecretStore {
  get(name: string): string | null;
  set(name: string, value: string | null): void;
}

export interface AppServiceOptions {
  dataDir: string;
  dialogs: Dialogs;
  secrets: SecretStore;
  adapterFactory?: AdapterFactory;
  /** Start the real-time scheduler. Tests drive `engine.tick()` manually instead. */
  autoStart?: boolean;
}

export class UserError extends Error {}

const ANTHROPIC_KEY = 'anthropic-api-key';

/**
 * Application service: owns the project document, the engine, the outputs, AI and audio.
 * Independent from Electron (dialogs and secrets are injected), so the whole workflow is testable headless.
 */
export class AppService extends EventEmitter<{ project: [ProjectState]; runtime: [RuntimeState]; values: [ValuesFrame]; log: [LogEntry] }> {
  readonly logger = new Logger();
  readonly outputs: OutputManager;
  readonly engine: Engine;
  private readonly audio: AudioReactive;
  private project: Project;
  private index: ProjectIndex;
  private projectPath: string | null = null;
  private revision = 0;
  private savedRevision = 0;
  private settings: Settings = defaultSettings();
  private readonly proposals = new Map<string, AiProposal>();
  private aiBusy = false;
  private aiLastError: string | null = null;
  private lastAiApply = 0;
  private readonly alerts: Alert[] = [];
  private readonly timers: NodeJS.Timeout[] = [];
  private lastAutosave = Date.now();
  private lastValuesEmit = 0;
  private lastSourcesEmit = 0;
  private lastRuntimeEmit = 0;
  private readonly outputStates = new Map<string, OutputState>();

  constructor(private readonly opts: AppServiceOptions) {
    super();
    this.project = createProject('Nouveau projet');
    this.index = new ProjectIndex(this.project);
    this.outputs = new OutputManager(opts.adapterFactory ?? ((c) => createAdapter(c, this.settings.sacn?.cid)));
    this.engine = new Engine(this.index, this.outputs, this.engineSettings());
    this.audio = new AudioReactive(this.engine, () => this.index, () => this.project.audio, () => this.settings.engine.priorities.audio);
    this.logger.on('entry', (e) => {
      if (e.level === 'warn' || e.level === 'error') {
        this.alerts.push({ id: e.id, t: e.t, level: e.level, message: `${e.source} : ${e.message}` });
        if (this.alerts.length > 30) this.alerts.shift();
      }
      this.emit('log', e);
    });
    this.engine.on('error', (err) => this.logger.error('Moteur', err.message));
    this.engine.on('frame', () => this.onFrame());
    this.outputs.on('status', () => this.onOutputStatus());
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  private get settingsFile() { return path.join(this.opts.dataDir, 'settings.json'); }
  private get autosaveDir() { return path.join(this.opts.dataDir, 'autosave'); }

  async init(): Promise<void> {
    await fs.mkdir(this.opts.dataDir, { recursive: true });
    try {
      const raw = JSON.parse(await fs.readFile(this.settingsFile, 'utf8')) as unknown;
      const parsed = settingsSchema.safeParse(raw);
      if (parsed.success) this.settings = parsed.data;
      else {
        await fs.copyFile(this.settingsFile, `${this.settingsFile}.invalid`).catch(() => undefined);
        this.logger.warn('Paramètres', `Fichier de paramètres invalide, valeurs par défaut utilisées (copie : settings.json.invalid) — ${parsed.error.issues[0]?.message ?? ''}`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') this.logger.warn('Paramètres', `Lecture impossible : ${(err as Error).message}`);
    }
    if (!this.settings.sacn) this.settings.sacn = { cid: randomUUID() };
    await this.persistSettings();
    this.logger.level = this.settings.logs.level;
    this.engine.updateSettings(this.engineSettings());
    await this.outputs.configure(this.settings.outputs);
    if (this.opts.autoStart !== false) this.engine.start();
    this.timers.push(setInterval(() => void this.autosave(), 15000));
    this.logger.info('Application', 'Démarrage terminé — sorties réelles désarmées par défaut');
    this.emitProject();
  }

  async dispose(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    this.engine.stop();
    await this.outputs.closeAll();
  }

  get dirty(): boolean {
    return this.revision !== this.savedRevision;
  }

  private engineSettings(): EngineSettings {
    const e = this.settings.engine;
    return { rateHz: e.rateHz, blackoutPolicy: e.blackoutPolicy, maxStrobeHz: e.maxStrobeHz, priorities: e.priorities };
  }

  private async persistSettings(): Promise<void> {
    await writeFileAtomic(this.settingsFile, JSON.stringify(this.settings, null, 2), false);
  }

  getSettings(): Settings {
    return structuredClone(this.settings);
  }

  /* ------------------------------------------------------------------ */
  /* State & events                                                      */
  /* ------------------------------------------------------------------ */

  projectState(): ProjectState {
    return { project: this.project, path: this.projectPath, dirty: this.dirty, revision: this.revision, issues: validatePatch(this.index.lib, this.project.patch) };
  }

  runtimeState(): RuntimeState {
    return {
      engine: this.engine.snapshot(),
      outputs: this.outputs.status(),
      transmitting: this.outputs.transmitting,
      liveMode: this.outputs.liveMode,
      ai: { provider: this.settings.ai.provider, hasKey: !!this.opts.secrets.get(ANTHROPIC_KEY), busy: this.aiBusy, lastError: this.aiLastError, model: this.settings.ai.model },
      audio: this.audio.status(),
      alerts: [...this.alerts],
      programmer: this.engine.getProgrammer(),
    };
  }

  private emitProject(): void {
    this.emit('project', this.projectState());
  }

  private onFrame(): void {
    const now = Date.now();
    if (now - this.lastValuesEmit >= 40) {
      this.lastValuesEmit = now;
      const frame: ValuesFrame = { values: this.engine.values };
      if (now - this.lastSourcesEmit >= 200) {
        this.lastSourcesEmit = now;
        frame.sources = this.engine.sources;
      }
      this.emit('values', frame);
    }
    if (now - this.lastRuntimeEmit >= 100) {
      this.lastRuntimeEmit = now;
      this.emit('runtime', this.runtimeState());
    }
  }

  private onOutputStatus(): void {
    for (const s of this.outputs.status()) {
      const prev = this.outputStates.get(s.id);
      if (prev === s.state) continue;
      this.outputStates.set(s.id, s.state);
      if (s.state === 'error') this.logger.error(`Sortie ${s.name}`, `${s.detail} — reconnexion automatique programmée`);
      else if (s.state === 'ready' && prev === 'error') this.logger.info(`Sortie ${s.name}`, 'Connexion rétablie');
      else if (s.state === 'ready' && s.real) this.logger.warn(`Sortie ${s.name}`, 'Sortie réelle ARMÉE : les valeurs DMX sont émises vers le matériel');
      else if (s.state === 'disarmed' && s.real && prev === 'ready') this.logger.info(`Sortie ${s.name}`, 'Sortie réelle désarmée');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Project mutation                                                    */
  /* ------------------------------------------------------------------ */

  /** Applies a mutation on a draft, re-validates the whole document, then swaps it in. Invalid drafts are rejected. */
  private mutate(fn: (draft: Project) => void): void {
    const draft = structuredClone(this.project);
    fn(draft);
    draft.meta.modifiedAt = new Date().toISOString();
    const parsed = projectSchema.safeParse(draft);
    if (!parsed.success) throw new UserError(`Modification refusée : ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join(' ; ')}`);
    this.setProject(parsed.data, false);
  }

  private setProject(p: Project, reset: boolean): void {
    this.project = p;
    this.index = new ProjectIndex(p);
    if (reset) {
      this.engine.stopAllPlaybacks();
      this.engine.stopAllEffects();
      this.engine.timelineStop();
      this.engine.releaseAi();
      this.engine.releaseProgrammer();
      this.engine.bpm = p.show.bpm;
      this.proposals.clear();
    }
    this.engine.setIndex(this.index);
    this.revision++;
    if (reset) this.savedRevision = this.revision;
    this.emitProject();
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

  private async handle(cmd: Command): Promise<unknown> {
    const ok = { ok: true } as const;
    const e = this.engine;
    switch (cmd.type) {
      /* ---------- project ---------- */
      case 'project.get': return this.projectState();
      case 'project.new':
        this.setProject(createProject(cmd.name), true);
        this.projectPath = null;
        this.logger.info('Projet', `Nouveau projet « ${cmd.name} »`);
        this.emitProject();
        return ok;
      case 'project.open':
      case 'project.openRecovery': {
        const file = cmd.type === 'project.open' ? cmd.path ?? (await this.opts.dialogs.openProject()) : cmd.file;
        if (!file) return { opened: false, migratedFrom: null };
        try {
          const { project, migratedFrom } = await loadProjectFile(file);
          this.setProject(project, true);
          this.projectPath = cmd.type === 'project.open' ? file : null;
          if (cmd.type === 'project.open') this.addRecent(file);
          this.logger.info('Projet', `Ouvert : ${path.basename(file)}${migratedFrom ? ` (migré depuis le format v${migratedFrom})` : ''}`);
          if (cmd.type === 'project.openRecovery') this.revision++; // recovered data is unsaved until saved explicitly
          this.emitProject();
          return { opened: true, migratedFrom };
        } catch (err) {
          if (err instanceof ProjectLoadError) {
            this.logger.error('Projet', `${err.message}${err.details.length ? ` — ${err.details.slice(0, 3).join(' ; ')}` : ''}`);
            throw new UserError(`${err.message}${err.kind === 'corrupt-json' || err.kind === 'invalid-format' ? '. Une copie de récupération est peut-être disponible (Paramètres › Sauvegardes).' : ''}`);
          }
          throw err;
        }
      }
      case 'project.save':
        if (!this.projectPath) return this.handle({ type: 'project.saveAs' });
        await saveProjectFile(this.projectPath, this.project);
        this.savedRevision = this.revision;
        await this.clearAutosave();
        this.logger.info('Projet', `Enregistré : ${path.basename(this.projectPath)}`);
        this.emitProject();
        return { path: this.projectPath };
      case 'project.saveAs':
      case 'project.export': {
        const file = cmd.path ?? (await this.opts.dialogs.saveProject(this.project.meta.name));
        if (!file) return { path: null };
        await saveProjectFile(file, this.project);
        if (cmd.type === 'project.saveAs') {
          this.projectPath = file;
          this.savedRevision = this.revision;
          this.addRecent(file);
          await this.clearAutosave();
        }
        this.logger.info('Projet', `${cmd.type === 'project.export' ? 'Exporté' : 'Enregistré'} : ${path.basename(file)}`);
        this.emitProject();
        return { path: file };
      }
      case 'project.update':
        this.mutate((d) => {
          if (cmd.meta) Object.assign(d.meta, Object.fromEntries(Object.entries(cmd.meta).filter(([, v]) => v !== undefined)));
          if (cmd.show) Object.assign(d.show, Object.fromEntries(Object.entries(cmd.show).filter(([, v]) => v !== undefined)));
          if (cmd.visualizer) Object.assign(d.visualizer, Object.fromEntries(Object.entries(cmd.visualizer).filter(([, v]) => v !== undefined)));
        });
        if (cmd.show?.bpm) e.bpm = cmd.show.bpm;
        return ok;
      case 'project.listRecovery':
        return listRecovery(this.autosaveDir, this.projectPath);

      /* ---------- profiles ---------- */
      case 'profile.import': {
        const file = cmd.path ?? (await this.opts.dialogs.openProfile());
        if (!file) return { imported: [], errors: [] };
        let json: unknown;
        try {
          json = JSON.parse(await fs.readFile(file, 'utf8'));
        } catch (err) {
          throw new UserError(`Fichier de profil illisible : ${(err as Error).message}`);
        }
        const { profiles, errors } = parseProfileFile(json);
        const accepted = profiles.filter((p) => {
          if (BUILTIN_PROFILES.some((b) => b.id === p.id)) {
            errors.push(`Profil « ${p.id} » : identifiant réservé à un profil intégré`);
            return false;
          }
          return true;
        });
        if (accepted.length) this.mutate((d) => {
          for (const p of accepted) d.profiles = [...d.profiles.filter((x) => x.id !== p.id), p];
        });
        for (const er of errors) this.logger.warn('Profils', er);
        if (accepted.length) this.logger.info('Profils', `${accepted.length} profil(s) importé(s)`);
        return { imported: accepted.map((p) => p.name), errors };
      }
      case 'profile.remove': {
        const used = this.project.patch.filter((f) => f.profileId === cmd.id);
        if (used.length) throw new UserError(`Profil utilisé par ${used.length} projecteur(s)`);
        this.mutate((d) => { d.profiles = d.profiles.filter((p) => p.id !== cmd.id); });
        return ok;
      }

      /* ---------- patch ---------- */
      case 'fixture.add': {
        const profile = this.index.lib.get(cmd.profileId);
        if (!profile) throw new UserError('Profil inconnu');
        const count = channelCount(profile, cmd.mode);
        if (!count) throw new UserError(`Mode « ${cmd.mode} » inconnu pour ce profil`);
        const ids: string[] = [];
        const existingNames = new Set(this.project.patch.map((f) => f.name));
        this.mutate((d) => {
          let next = cmd.address ?? 1;
          const moving = profile.type.startsWith('moving');
          let n = 1;
          for (let i = 0; i < cmd.count; i++) {
            const addr = cmd.address !== null && i === 0 ? cmd.address : findFreeAddress(this.index.lib, d.patch, cmd.universe, count, next);
            if (addr === undefined || addr + count - 1 > 512) throw new UserError(`Plus de place dans l’univers ${cmd.universe} pour ${count} canaux (projecteur ${i + 1}/${cmd.count})`);
            while (existingNames.has(`${cmd.namePrefix} ${n}`)) n++;
            const name = `${cmd.namePrefix} ${n}`;
            existingNames.add(name);
            const id = randomUUID();
            ids.push(id);
            const w = d.visualizer.stageWidth;
            d.patch.push({
              id, name, profileId: profile.id, mode: cmd.mode, universe: cmd.universe, address: addr, tags: cmd.tags,
              position: { x: Math.round((-w / 2 + ((i + 0.5) * w) / cmd.count) * 10) / 10, y: moving ? d.visualizer.stageDepth * 0.7 : d.visualizer.stageDepth * 0.25 },
              rotation: 0, notes: '',
            });
            next = addr + count;
          }
          const overlaps = validatePatch(this.index.lib, d.patch).filter((iss) => iss.kind === 'overlap' && iss.fixtureIds.some((x) => ids.includes(x)));
          if (overlaps.length) throw new UserError(overlaps[0]!.message);
        });
        this.logger.info('Patch', `${ids.length} × ${profile.name} ajouté(s) (univers ${cmd.universe})`);
        return { ids };
      }
      case 'fixture.update':
        this.mutate((d) => {
          const f = d.patch.find((x) => x.id === cmd.id);
          if (!f) throw new UserError('Projecteur introuvable');
          Object.assign(f, Object.fromEntries(Object.entries(cmd.patch).filter(([, v]) => v !== undefined)));
          const profile = this.index.lib.get(f.profileId);
          if (!profile || !profile.modes.some((m) => m.name === f.mode)) throw new UserError('Profil ou mode invalide');
          const issues = validatePatch(this.index.lib, d.patch).filter((i) => i.fixtureIds.includes(f.id));
          if (issues.length) throw new UserError(issues[0]!.message);
        });
        return ok;
      case 'fixture.remove': {
        const ids = new Set(cmd.ids);
        this.engine.releaseProgrammer(cmd.ids);
        this.mutate((d) => {
          d.patch = d.patch.filter((f) => !ids.has(f.id));
          for (const g of d.groups) g.fixtureIds = g.fixtureIds.filter((x) => !ids.has(x));
          for (const s of d.scenes) for (const id of ids) delete s.values[id];
          for (const ef of d.effects) ef.targets.fixtureIds = ef.targets.fixtureIds.filter((x) => !ids.has(x));
        });
        return ok;
      }
      case 'fixture.duplicate': {
        const out: string[] = [];
        this.mutate((d) => {
          for (const id of cmd.ids) {
            const src = d.patch.find((f) => f.id === id);
            if (!src) continue;
            const profile = this.index.lib.get(src.profileId)!;
            const addr = findFreeAddress(this.index.lib, d.patch, src.universe, channelCount(profile, src.mode), src.address);
            if (addr === undefined) throw new UserError(`Plus de place dans l’univers ${src.universe}`);
            const nid = randomUUID();
            out.push(nid);
            d.patch.push({ ...structuredClone(src), id: nid, name: `${src.name} (copie)`.slice(0, 80), address: addr, position: { x: src.position.x + 0.5, y: src.position.y } });
          }
        });
        return { ids: out };
      }

      /* ---------- groups & palettes ---------- */
      case 'group.upsert':
        this.mutate((d) => {
          const g = { ...cmd.group, fixtureIds: cmd.group.fixtureIds.filter((id) => this.index.fixtures.has(id)) };
          d.groups = d.groups.some((x) => x.id === g.id) ? d.groups.map((x) => (x.id === g.id ? g : x)) : [...d.groups, g];
        });
        return ok;
      case 'group.remove':
        this.mutate((d) => {
          d.groups = d.groups.filter((g) => g.id !== cmd.id);
          for (const ef of d.effects) ef.targets.groupIds = ef.targets.groupIds.filter((x) => x !== cmd.id);
        });
        return ok;
      case 'group.reorder':
        this.mutate((d) => {
          const rank = new Map(cmd.ids.map((id, i) => [id, i]));
          d.groups.sort((x, y) => (rank.get(x.id) ?? 1e9) - (rank.get(y.id) ?? 1e9));
        });
        return ok;
      case 'palette.upsert':
        this.mutate((d) => { d.palettes = d.palettes.some((x) => x.id === cmd.palette.id) ? d.palettes.map((x) => (x.id === cmd.palette.id ? cmd.palette : x)) : [...d.palettes, cmd.palette]; });
        return ok;
      case 'palette.remove':
        this.mutate((d) => { d.palettes = d.palettes.filter((p) => p.id !== cmd.id); });
        return ok;
      case 'palette.apply': {
        const pal = this.project.palettes.find((p) => p.id === cmd.id);
        if (!pal) throw new UserError('Palette introuvable');
        let applied = 0;
        for (const fid of cmd.fixtureIds) {
          const rf = this.index.fixtures.get(fid);
          if (!rf) continue;
          const vals: Record<string, number> = {};
          if (pal.color) Object.assign(vals, colorToAttributes(rf, hexToRgb(pal.color)));
          for (const [a, v] of Object.entries(pal.values)) if (a === 'dimmer' || rf.attributes.includes(a)) vals[a] = v;
          applied += e.setProgrammer([fid], vals).applied;
        }
        return { applied };
      }
      case 'palette.recordFromProgrammer': {
        const prog = e.getProgrammer()[cmd.fixtureId];
        if (!prog) throw new UserError('Ce projecteur n’a aucune valeur dans le programmeur');
        const cls = cmd.kind === 'color' ? ['color'] : cmd.kind === 'position' ? ['position'] : cmd.kind === 'intensity' ? ['intensity'] : ['beam'];
        const values = Object.fromEntries(Object.entries(prog).filter(([a]) => cls.includes(attributeClass(a))));
        if (!Object.keys(values).length) throw new UserError('Aucune valeur de ce type dans le programmeur pour ce projecteur');
        const id = randomUUID();
        this.mutate((d) => { d.palettes.push({ id, name: cmd.name, kind: cmd.kind, values }); });
        return { id };
      }

      /* ---------- programmer ---------- */
      case 'programmer.set':
        return e.setProgrammer(cmd.fixtureIds, cmd.values, { confirmSpecial: cmd.confirmSpecial });
      case 'programmer.setColor': {
        let applied = 0;
        for (const fid of cmd.fixtureIds) {
          const rf = this.index.fixtures.get(fid);
          if (rf) applied += e.setProgrammer([fid], colorToAttributes(rf, hexToRgb(cmd.color))).applied;
        }
        return { applied };
      }
      case 'programmer.release':
        e.releaseProgrammer(cmd.fixtureIds, cmd.attributes);
        return ok;

      /* ---------- scenes ---------- */
      case 'scene.record': {
        const prog = e.getProgrammer();
        const values: FixtureValues = cmd.fixtureIds ? Object.fromEntries(Object.entries(prog).filter(([id]) => cmd.fixtureIds!.includes(id))) : prog;
        if (!Object.keys(values).length) throw new UserError('Le programmeur est vide : réglez des projecteurs dans la Live Console avant d’enregistrer.');
        const id = randomUUID();
        this.mutate((d) => { d.scenes.push({ id, name: cmd.name, notes: '', values, origin: 'user' }); });
        this.logger.info('Scènes', `Scène « ${cmd.name} » enregistrée (${Object.keys(values).length} projecteurs)`);
        return { id };
      }
      case 'scene.upsert':
        this.mutate((d) => { d.scenes = d.scenes.some((s) => s.id === cmd.scene.id) ? d.scenes.map((s) => (s.id === cmd.scene.id ? cmd.scene : s)) : [...d.scenes, cmd.scene]; });
        return ok;
      case 'scene.remove':
        this.mutate((d) => {
          d.scenes = d.scenes.filter((s) => s.id !== cmd.id);
          for (const l of d.cueLists) for (const c of l.cues) if (c.sceneId === cmd.id) c.sceneId = null;
          for (const t of d.timelines) t.events = t.events.filter((ev) => !(ev.kind === 'scene' && ev.refId === cmd.id));
        });
        return ok;
      case 'scene.duplicate': {
        const src = this.project.scenes.find((s) => s.id === cmd.id);
        if (!src) throw new UserError('Scène introuvable');
        const id = randomUUID();
        this.mutate((d) => { d.scenes.push({ ...structuredClone(src), id, name: `${src.name} (copie)`.slice(0, 80) }); });
        return { id };
      }
      case 'scene.load': {
        const s = this.index.scenes.get(cmd.id);
        if (!s) throw new UserError('Scène introuvable');
        for (const [fid, vals] of Object.entries(s.values)) e.setProgrammer([fid], vals);
        return ok;
      }
      case 'scene.preview': {
        const s = this.index.scenes.get(cmd.id);
        if (!s) throw new UserError('Scène introuvable');
        return { values: e.compute(s.values).values };
      }

      /* ---------- cues ---------- */
      case 'cueList.upsert':
        for (const c of cmd.cueList.cues) {
          if (c.sceneId && !this.index.scenes.has(c.sceneId)) throw new UserError(`Cue « ${c.name} » : scène inconnue`);
          for (const fx of c.effectIds) if (!this.index.effects.has(fx)) throw new UserError(`Cue « ${c.name} » : effet inconnu`);
        }
        this.mutate((d) => { d.cueLists = d.cueLists.some((l) => l.id === cmd.cueList.id) ? d.cueLists.map((l) => (l.id === cmd.cueList.id ? cmd.cueList : l)) : [...d.cueLists, cmd.cueList]; });
        return ok;
      case 'cueList.remove':
        e.cueStop(cmd.id);
        this.mutate((d) => {
          d.cueLists = d.cueLists.filter((l) => l.id !== cmd.id);
          for (const t of d.timelines) t.events = t.events.filter((ev) => !(ev.kind === 'cue' && ev.refId === cmd.id));
        });
        return ok;
      case 'cue.go': return { ok: e.cueGo(cmd.listId) };
      case 'cue.back': return { ok: e.cueBack(cmd.listId) };
      case 'cue.goto': return { ok: e.cueGoto(cmd.listId, cmd.index) };
      case 'cue.pause': e.cuePause(cmd.listId); return ok;
      case 'cue.resume': e.cueResume(cmd.listId); return ok;
      case 'cue.stop': e.cueStop(cmd.listId); return ok;

      /* ---------- effects ---------- */
      case 'effect.upsert':
        this.mutate((d) => { d.effects = d.effects.some((x) => x.id === cmd.effect.id) ? d.effects.map((x) => (x.id === cmd.effect.id ? cmd.effect : x)) : [...d.effects, cmd.effect]; });
        return ok;
      case 'effect.remove':
        e.stopEffectById(cmd.id);
        this.mutate((d) => {
          d.effects = d.effects.filter((x) => x.id !== cmd.id);
          for (const l of d.cueLists) for (const c of l.cues) c.effectIds = c.effectIds.filter((x) => x !== cmd.id);
          for (const t of d.timelines) t.events = t.events.filter((ev) => !(ev.kind === 'effect' && ev.refId === cmd.id));
          if (d.audio.reactions.energyRiseGo.cueListId && !d.cueLists.some((l) => l.id === d.audio.reactions.energyRiseGo.cueListId)) d.audio.reactions.energyRiseGo.cueListId = null;
        });
        return ok;
      case 'effect.start': {
        const id = e.startEffect(cmd.id, 'manual');
        if (!id) throw new UserError('Effet introuvable');
        return { instanceId: id };
      }
      case 'effect.stop': e.stopEffect(cmd.instanceId); return ok;
      case 'effect.pause': e.setEffectPaused(cmd.instanceId, cmd.paused); return ok;
      case 'effect.stopAll': e.stopAllEffects(); return ok;

      /* ---------- timeline ---------- */
      case 'timeline.upsert':
        for (const ev of cmd.timeline.events) {
          const exists = ev.kind === 'marker' || (ev.kind === 'scene' ? this.index.scenes.has(ev.refId!) : ev.kind === 'effect' ? this.index.effects.has(ev.refId!) : this.index.cueLists.has(ev.refId!));
          if (!exists) throw new UserError(`Événement « ${ev.label || ev.kind} » : référence inconnue`);
        }
        this.mutate((d) => { d.timelines = d.timelines.some((t) => t.id === cmd.timeline.id) ? d.timelines.map((t) => (t.id === cmd.timeline.id ? cmd.timeline : t)) : [...d.timelines, cmd.timeline]; });
        return ok;
      case 'timeline.remove':
        e.timelineStop();
        this.mutate((d) => { d.timelines = d.timelines.filter((t) => t.id !== cmd.id); });
        return ok;
      case 'timeline.play':
        if (!e.timelinePlay(cmd.id)) throw new UserError('Timeline introuvable');
        return ok;
      case 'timeline.pause': e.timelinePause(); return ok;
      case 'timeline.stop': e.timelineStop(); return ok;
      case 'timeline.seek': e.timelineSeek(cmd.seconds); return ok;

      /* ---------- engine ---------- */
      case 'engine.master': e.master = cmd.value; return ok;
      case 'engine.blackout':
        e.blackout = cmd.on;
        this.logger.info('Moteur', cmd.on ? `Blackout activé (politique : ${this.settings.engine.blackoutPolicy})` : 'Blackout désactivé');
        return ok;
      case 'engine.bpm':
        e.bpm = cmd.bpm;
        e.bpmSource = 'manual';
        return ok;
      case 'engine.releaseAll':
        e.releaseProgrammer();
        e.releaseAi();
        e.stopAllEffects();
        e.stopAllPlaybacks();
        e.timelineStop();
        this.logger.info('Moteur', 'Tout relâché (programmeur, IA, effets, playbacks, timeline)');
        return ok;

      /* ---------- outputs ---------- */
      case 'output.configure':
        this.settings.outputs = cmd.outputs;
        await this.persistSettings();
        await this.outputs.configure(cmd.outputs);
        this.logger.info('Sorties', 'Configuration des sorties mise à jour');
        return ok;
      case 'output.arm':
        await this.outputs.arm(cmd.id);
        return ok;
      case 'output.disarm':
        await this.outputs.disarm(cmd.id);
        return ok;
      case 'output.transmit':
        this.outputs.setTransmitting(cmd.on);
        if (!cmd.on) this.logger.warn('Sorties', 'STOP OUTPUT : émissions réelles arrêtées. Les projecteurs appliquent leur propre comportement de perte de signal (maintien ou extinction selon le modèle).');
        else this.logger.info('Sorties', 'Émissions reprises');
        return ok;
      case 'output.universe': {
        const view: UniverseView = { universe: cmd.universe, computed: Array.from(e.universes.get(cmd.universe) ?? new Uint8Array(512)), transmitted: [] };
        for (const s of this.outputs.status()) {
          const fr = this.outputs.transmitted.get(s.id)?.get(cmd.universe);
          if (fr) view.transmitted.push({ outputId: s.id, outputName: s.name, at: fr.at, data: Array.from(fr.data) });
        }
        return view;
      }
      case 'output.virtualHistory':
        return (this.outputs.virtual()?.history ?? []).slice(-cmd.limit);
      case 'output.inject': {
        let v: VirtualOutput | undefined;
        for (const s of this.outputs.status()) {
          const a = this.outputs.get(s.id);
          if (a instanceof VirtualOutput) v = a;
        }
        if (!v) throw new UserError('Aucune sortie virtuelle configurée');
        v.inject(cmd.injection);
        if (cmd.injection.type === 'reconnect') await v.open();
        this.logger.warn('Diagnostic', `Injection de test sur la sortie virtuelle : ${cmd.injection.type}`);
        return ok;
      }
      case 'output.listSerial': return listSerialPorts();
      case 'output.interfaces': return localIpv4Addresses();

      /* ---------- AI ---------- */
      case 'ai.propose': return this.aiPropose(cmd.prompt);
      case 'ai.revise': {
        const prev = this.proposals.get(cmd.proposalId);
        if (!prev) throw new UserError('Proposition expirée');
        const p = buildProposal({ prompt: prev.prompt, provider: prev.provider, model: prev.model, understanding: `${prev.understanding} (modifiée par l’utilisateur)`, notices: [], rawActions: cmd.actions, ctx: this.validationCtx() });
        this.storeProposal(p);
        return p;
      }
      case 'ai.apply': {
        const p = this.proposals.get(cmd.proposalId);
        if (!p) throw new UserError('Proposition expirée ou inconnue');
        if (Date.now() - this.lastAiApply < 300) throw new UserError('Applications IA trop rapprochées (protection anti-boucle)');
        this.lastAiApply = Date.now();
        this.proposals.delete(cmd.proposalId); // a proposal is applied at most once
        const report = executeProposal(p, { index: () => this.index, mutate: (fn) => this.mutate(fn), engine: e, maxStrobeHz: this.settings.engine.maxStrobeHz });
        this.logger.info('IA', `Proposition appliquée : ${report.executed.length} action(s) exécutée(s), ${report.skipped.length} ignorée(s)`);
        for (const s of report.skipped) this.logger.warn('IA', `Ignorée — ${s.summary} : ${s.reason}`);
        return report;
      }
      case 'ai.release':
        e.releaseAi();
        for (const fx of e.snapshot().effects) if (fx.owner === 'ai') e.stopEffect(fx.instanceId);
        return ok;
      case 'ai.setKey':
        this.opts.secrets.set(ANTHROPIC_KEY, cmd.key);
        this.logger.info('IA', cmd.key ? 'Clé API enregistrée (stockage chiffré du système)' : 'Clé API supprimée');
        return ok;

      /* ---------- audio ---------- */
      case 'audio.features':
        this.audio.push(cmd.features, cmd.source);
        return ok;
      case 'audio.config':
        this.mutate((d) => { d.audio = cmd.config; });
        return ok;

      /* ---------- settings / logs ---------- */
      case 'settings.get': return this.getSettings();
      case 'settings.update': {
        const outputsChanged = JSON.stringify(cmd.settings.outputs) !== JSON.stringify(this.settings.outputs);
        this.settings = { ...cmd.settings, sacn: this.settings.sacn };
        await this.persistSettings();
        this.logger.level = this.settings.logs.level;
        this.engine.updateSettings(this.engineSettings());
        if (outputsChanged) await this.outputs.configure(this.settings.outputs);
        this.logger.info('Paramètres', 'Paramètres enregistrés');
        return ok;
      }
      case 'logs.recent': return this.logger.recent();
    }
  }

  /* ------------------------------------------------------------------ */
  /* AI                                                                  */
  /* ------------------------------------------------------------------ */

  private validationCtx() {
    return { index: this.index, allowStrobe: this.settings.ai.allowStrobe, maxStrobeHz: this.settings.engine.maxStrobeHz };
  }

  private storeProposal(p: AiProposal): void {
    this.proposals.set(p.id, p);
    while (this.proposals.size > 20) this.proposals.delete(this.proposals.keys().next().value!);
  }

  private async aiPropose(prompt: string): Promise<AiProposal> {
    if (this.aiBusy) throw new UserError('Une demande IA est déjà en cours');
    this.aiBusy = true;
    try {
      const ctx = this.validationCtx();
      const ai = this.settings.ai;
      const key = this.opts.secrets.get(ANTHROPIC_KEY);
      let proposal: AiProposal;
      if (ai.provider === 'anthropic' && key) {
        try {
          const r = await proposeWithClaude(prompt, describeRig(this.index, ai.allowStrobe, this.engine.bpm), { apiKey: key, model: ai.model || DEFAULT_ANTHROPIC_MODEL, effort: ai.effort, timeoutMs: ai.timeoutSec * 1000 });
          proposal = buildProposal({ prompt, provider: 'anthropic', model: r.model, understanding: r.understanding, notices: r.notices, rawActions: r.actions, ctx });
          this.aiLastError = null;
        } catch (err) {
          const msg = describeClaudeError(err);
          this.aiLastError = msg;
          this.logger.error('IA', `Fournisseur Claude indisponible : ${msg}`);
          if (!ai.fallbackToLocal) throw new UserError(`Fournisseur IA indisponible : ${msg}`);
          proposal = proposeLocally(prompt, ctx, this.engine);
          proposal.notices.unshift(`Fournisseur Claude indisponible (${msg}) : proposition générée par le mode local déterministe.`);
        }
      } else {
        proposal = proposeLocally(prompt, ctx, this.engine);
        if (ai.provider === 'anthropic') proposal.notices.unshift('Aucune clé API configurée : mode local déterministe utilisé.');
      }
      this.storeProposal(proposal);
      this.mutate((d) => { d.ai.recentPrompts = [prompt.slice(0, 500), ...d.ai.recentPrompts.filter((x) => x !== prompt)].slice(0, 20); });
      return proposal;
    } finally {
      this.aiBusy = false;
    }
  }

  /** Exposed for tests: local interpretation without storing a proposal. */
  interpretForTest(prompt: string) {
    return interpretLocally(prompt, interpreterContext(this.index, this.engine, this.settings.ai.allowStrobe));
  }

  /* ------------------------------------------------------------------ */
  /* Files                                                               */
  /* ------------------------------------------------------------------ */

  private addRecent(file: string): void {
    this.settings.general.recentProjects = [file, ...this.settings.general.recentProjects.filter((f) => f !== file)].slice(0, 10);
    void this.persistSettings().catch((err: Error) => this.logger.warn('Paramètres', err.message));
  }

  private autosaveFile(): string {
    return path.join(this.autosaveDir, `${this.project.id}.luma.json`);
  }

  async autosave(force = false): Promise<void> {
    const minutes = this.settings.general.autosaveMinutes;
    if (!this.dirty || (!force && (minutes === 0 || Date.now() - this.lastAutosave < minutes * 60000))) return;
    this.lastAutosave = Date.now();
    try {
      await writeFileAtomic(this.autosaveFile(), serializeProject(this.project), false);
      this.logger.debug('Projet', 'Sauvegarde automatique de récupération écrite');
    } catch (err) {
      this.logger.error('Projet', `Sauvegarde automatique impossible : ${(err as Error).message}`);
    }
  }

  private async clearAutosave(): Promise<void> {
    await fs.rm(this.autosaveFile(), { force: true });
  }
}
