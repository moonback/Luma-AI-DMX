import { useEffect, useState, useSyncExternalStore } from 'react';
import { FolderOpen, KeyRound, Trash2, X } from 'lucide-react';
import { useStore, confirmAction } from '../store';
import { act } from '../api';
import { Field, NumberInput, PageHead, Panel, Tabs } from '../components/ui';
import { resolveShortcuts, SHORTCUT_ACTIONS, shortcutConflicts, type Settings } from '../../core/settings/settings';
import { comboFromEvent } from '../shortcuts';
import type { RecoveryEntry } from '../../core/project/store';
import type { StorageReport } from '../../core/app/storage';
import type { OpenRouterModel } from '../../core/ai/providers/openrouter';
import { externalControl } from '../control';
import { audioEngine } from '../audioEngine';
import type { UpdateStatus } from '../../core/app/updates';
import { FeedbackPanel, UsagePanel } from './settings/BetaPanel';
import { useT } from '../i18n';
import { openProject } from '../App';
import { splitPath } from './StartScreen';

const TAB_IDS = ['general', 'appearance', 'engine', 'network', 'ai', 'audio', 'shortcuts', 'control', 'logs', 'backups'] as const;
type TabId = (typeof TAB_IDS)[number];

function ShortcutEditor({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const tr = useT();
  const [capturing, setCapturing] = useState<string | null>(null);
  const bindings = resolveShortcuts(value);
  const conflicts = shortcutConflicts(bindings);
  const conflicted = new Set(conflicts.flat());
  useEffect(() => {
    useStore.setState({ capturingShortcut: capturing !== null });
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      const combo = comboFromEvent(e);
      if (!combo) return;
      e.preventDefault();
      e.stopPropagation();
      onChange({ ...value, [capturing]: combo });
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, value, onChange]);
  useEffect(() => () => useStore.setState({ capturingShortcut: false }), []);
  const label = (id: string) => SHORTCUT_ACTIONS.find((a) => a.id === id)?.label ?? id;
  return (
    <div>
      {conflicts.length > 0 && (
        <div className="small" style={{ padding: '8px 12px', color: '#fca5a5' }}>
          {tr('settings.shortcuts.conflicts', { list: conflicts.map((ids) => `« ${bindings[ids[0] as keyof typeof bindings]} » → ${ids.map(label).join(' / ')}`).join(' ; ') })}
        </div>
      )}
      <table className="table" data-testid="shortcut-table">
        <tbody>
          {SHORTCUT_ACTIONS.map((a) => {
            const combo = bindings[a.id];
            const custom = value[a.id] !== undefined;
            return (
              <tr key={a.id}>
                <td>{a.label}</td>
                <td style={{ width: 170 }}>
                  {capturing === a.id ? <span className="badge violet">{tr('settings.shortcuts.press')}</span> : combo ? <span className={`badge mono ${conflicted.has(a.id) ? 'err' : custom ? 'cyan' : ''}`}>{combo}</span> : <span className="dim small">{tr('settings.shortcuts.unassigned')}</span>}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {capturing === a.id ? (
                    <button className="btn ghost sm" onClick={() => setCapturing(null)}>{tr('common.cancel')}</button>
                  ) : (
                    <button className="btn ghost sm" data-testid={`rebind-${a.id}`} onClick={() => setCapturing(a.id)}>{tr('settings.shortcuts.edit')}</button>
                  )}
                  <button className="btn ghost sm" disabled={!combo} onClick={() => onChange({ ...value, [a.id]: '' })}>{tr('settings.shortcuts.clear')}</button>
                  <button className="btn ghost sm" disabled={!custom} onClick={() => { const { [a.id]: _, ...rest } = value; onChange(rest); }}>{tr('settings.shortcuts.default')}</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row" style={{ padding: 12 }}>
        <button className="btn" disabled={!Object.keys(value).length} onClick={() => onChange({})}>{tr('settings.shortcuts.resetAll')}</button>
        <span className="small dim">{tr('settings.shortcuts.hint')}</span>
      </div>
    </div>
  );
}

function ModelPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const tr = useT();
  const [models, setModels] = useState<OpenRouterModel[] | null>(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const load = async (refresh = false) => {
    setLoading(true);
    const m = await act({ type: 'ai.listModels', refresh });
    setLoading(false);
    if (m) setModels(m);
  };
  const shown = (models ?? []).filter((m) => `${m.id} ${m.name}`.toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  const current = models?.find((m) => m.id === value);
  const price = (v: number | null) => (v === null ? '?' : v === 0 ? tr('settings.ai.free') : `${v} $`);
  const info = current && tr('settings.ai.modelInfo', { name: current.name, context: current.contextLength ?? '?', input: price(current.promptPrice), output: price(current.completionPrice) })
    + tr(current.structuredOutputs ? 'settings.ai.infoStructured' : current.jsonMode ? 'settings.ai.infoJson' : 'settings.ai.infoPrompt');
  return (
    <Field label={tr('settings.ai.model')} hint={info || tr('settings.ai.modelHint')}>
      <div className="col">
        <div className="row">
          <input className="input mono" data-testid="ai-model" value={value} onChange={(e) => onChange(e.target.value.trim())} />
          <button className="btn" onClick={() => void load(models !== null)} disabled={loading}>{loading ? tr('common.loading') : models ? tr('settings.ai.refreshList') : tr('settings.ai.loadList')}</button>
        </div>
        {models && (
          <div className="panel" style={{ maxHeight: 260, overflow: 'auto' }}>
            <div style={{ padding: 8, position: 'sticky', top: 0, background: 'var(--panel)' }}><input className="input" placeholder={tr('settings.ai.search', { n: models.length })} value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <table className="table small">
              <thead><tr><th>{tr('settings.ai.model')}</th><th>{tr('settings.ai.context')}</th><th>{tr('settings.ai.price')}</th><th>{tr('settings.ai.format')}</th></tr></thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m.id} className={`clickable ${m.id === value ? 'sel' : ''}`} onClick={() => onChange(m.id)}>
                    <td>{m.name}<div className="dim mono">{m.id}</div></td>
                    <td className="mono">{m.contextLength ?? '?'}</td>
                    <td className="mono">{price(m.promptPrice)} · {price(m.completionPrice)}</td>
                    <td>{m.structuredOutputs ? <span className="badge ok">{tr('settings.ai.structured')}</span> : m.jsonMode ? <span className="badge cyan">{tr('settings.ai.json')}</span> : <span className="badge">{tr('settings.ai.prompt')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Field>
  );
}

const OSC_ADDRESSES = [
  ['/luma/go [liste]', 'go'], ['/luma/back [liste]', 'back'], ['/luma/goto <cue> [liste]', 'goto'],
  ['/luma/pause [liste] · /luma/resume [liste]', 'pause'], ['/luma/blackout [0|1]', 'blackout'],
  ['/luma/master <0..1>', 'master'], ['/luma/bpm <bpm>', 'bpm'], ['/luma/release', 'release'],
  ['/luma/stop', 'stop'], ['/luma/releaseall', 'releaseAll'], ['/luma/timecode <secondes>', 'timecode'],
] as const;

/** Version, update channel and status. Updates install when the application quits, never during a show. */
function UpdatesPanel({ value, onChange }: { value: Settings['general']; onChange: (v: Partial<Settings['general']>) => void }) {
  const tr = useT();
  const [info, setInfo] = useState<{ version: string; updates: UpdateStatus } | null>(null);
  useEffect(() => { void act({ type: 'app.info' }).then((x) => x && setInfo(x)); }, []);
  const u = info?.updates;
  const check = async () => {
    const r = await act({ type: 'app.checkUpdates' });
    if (r && info) setInfo({ ...info, updates: r });
  };
  return (
    <Panel title={tr('settings.updates.title')}>
      <div className="grid g2">
        <Field label={tr('settings.updates.installed')}><span className="mono" data-testid="app-version">{info?.version ?? '…'}</span></Field>
        <Field label={tr('settings.updates.update')}>
          <span className="row" data-testid="update-state">
            <span className={`badge ${u?.state === 'ready' ? 'ok' : u?.state === 'error' ? 'err' : ''}`}>{u ? tr(`settings.updates.state.${u.state}`) : '…'}</span>
            {u?.version && <span className="mono small">v{u.version}{u.state === 'downloading' && u.progress !== null ? ` · ${Math.round(u.progress * 100)} %` : ''}</span>}
          </span>
          {u?.detail && <div className="small dim">{u.detail}</div>}
        </Field>
        <Field label={tr('settings.updates.channel')} hint={tr('settings.updates.channelHint')}>
          <select className="select" value={value.updateChannel} onChange={(e) => onChange({ updateChannel: e.target.value as Settings['general']['updateChannel'] })}>
            <option value="stable">{tr('settings.updates.stable')}</option><option value="beta">{tr('settings.updates.beta')}</option>
          </select>
        </Field>
        <label className="check"><input type="checkbox" checked={value.autoUpdate} onChange={(e) => onChange({ autoUpdate: e.target.checked })} />{tr('settings.updates.auto')}</label>
      </div>
      <div className="row"><button className="btn" disabled={!u || u.state === 'disabled' || u.state === 'checking'} onClick={() => void check()}>{tr('settings.updates.check')}</button></div>
    </Panel>
  );
}

function ControlTab({ value, onChange }: { value: Settings['control']; onChange: (v: Settings['control']) => void }) {
  const tr = useT();
  const status = useSyncExternalStore((l) => externalControl.subscribe(l), () => externalControl.status);
  const [learnFor, setLearnFor] = useState<string | null>(null);
  const [newAction, setNewAction] = useState('go');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [ips, setIps] = useState<string[]>([]);
  useEffect(() => { void audioEngine.devices().then(setDevices); void act({ type: 'output.interfaces' }).then((x) => setIps(x ?? [])); }, []);
  const r = value.remote;
  useEffect(() => () => { externalControl.learn = null; }, []);
  const learn = async () => {
    setLearnFor(newAction);
    externalControl.learn = (key) => {
      setLearnFor(null);
      onChange({ ...value, midi: { ...value.midi, mappings: [...value.midi.mappings.filter((m) => m.key !== key), { key, action: newAction }] } });
    };
    await externalControl.ensureMidi();
  };
  const actionLabel = (id: string) => (id === 'master' ? tr('settings.midi.master') : SHORTCUT_ACTIONS.find((a) => a.id === id)?.label ?? id);
  return (
    <>
      <Panel title={tr('settings.midi.title')}>
        <label className="check"><input type="checkbox" checked={value.midi.enabled} onChange={(e) => onChange({ ...value, midi: { ...value.midi, enabled: e.target.checked } })} />{tr('settings.midi.enable')}</label>
        <p className="small dim">{tr('settings.midi.inputs', { list: status.midiInputs.length ? status.midiInputs.join(', ') : tr('settings.midi.none') })}{status.error ? <span className="badge err" style={{ marginLeft: 6 }}>{status.error}</span> : null}</p>
        <table className="table small" data-testid="midi-mappings"><tbody>
          {value.midi.mappings.map((m) => (
            <tr key={m.key}><td className="mono">{m.key}</td><td>{actionLabel(m.action)}</td>
              <td style={{ textAlign: 'right' }}><button className="btn ghost sm" onClick={() => onChange({ ...value, midi: { ...value.midi, mappings: value.midi.mappings.filter((x) => x.key !== m.key) } })}>{tr('settings.midi.remove')}</button></td></tr>
          ))}
        </tbody></table>
        <div className="row">
          <select className="select" style={{ width: 320 }} value={newAction} onChange={(e) => setNewAction(e.target.value)}>
            <option value="master">{tr('settings.midi.master')}</option>
            {SHORTCUT_ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          {learnFor ? <span className="badge violet">{tr('settings.midi.waiting')}</span> : <button className="btn" onClick={() => void learn()} data-testid="midi-learn">{tr('settings.midi.learn')}</button>}
        </div>
      </Panel>
      <Panel title={tr('settings.osc.title')}>
        <div className="grid g2">
          <label className="check"><input type="checkbox" checked={value.osc.enabled} onChange={(e) => onChange({ ...value, osc: { ...value.osc, enabled: e.target.checked } })} />{tr('settings.osc.enable')}</label>
          <Field label={tr('settings.osc.port')}><NumberInput value={value.osc.port} min={1024} max={65535} onChange={(port) => onChange({ ...value, osc: { ...value.osc, port } })} /></Field>
          <Field label={tr('settings.osc.bind')} hint={tr('settings.osc.bindHint')}>
            <select className="select" value={value.osc.bind} onChange={(e) => onChange({ ...value, osc: { ...value.osc, bind: e.target.value as Settings['control']['osc']['bind'] } })}>
              <option value="127.0.0.1">{tr('settings.bind.local')}</option>
              <option value="0.0.0.0">{tr('settings.bind.lan')}</option>
            </select>
          </Field>
          <Field label={tr('settings.osc.allow')} hint={tr('settings.osc.allowHint')}>
            <input className="input mono" data-testid="osc-allow" defaultValue={value.osc.allow.join(', ')} placeholder="192.168.1.0/24" onBlur={(e) => onChange({ ...value, osc: { ...value.osc, allow: e.target.value.split(/[\s,;]+/u).filter(Boolean) } })} />
          </Field>
          <Field label={tr('settings.osc.feedback')} hint={tr('settings.osc.feedbackHint')}>
            <input className="input mono" data-testid="osc-feedback" defaultValue={value.osc.feedback.map((f) => `${f.host}:${f.port}`).join(', ')} placeholder="192.168.1.20:9000" onBlur={(e) => onChange({ ...value, osc: { ...value.osc, feedback: e.target.value.split(/[\s,;]+/u).filter(Boolean).map((x) => { const [host = '', port = ''] = x.split(':'); return { host, port: Number(port) }; }) } })} />
          </Field>
          <label className="check"><input type="checkbox" checked={value.osc.ack} onChange={(e) => onChange({ ...value, osc: { ...value.osc, ack: e.target.checked } })} />{tr('settings.osc.ackToggle')}</label>
        </div>
        <table className="table small"><tbody>{OSC_ADDRESSES.map(([a, d]) => <tr key={a}><td className="mono">{a}</td><td>{tr(`settings.osc.cmd.${d}`)}</td></tr>)}</tbody></table>
        <p className="small dim" style={{ marginBottom: 0 }}>{tr('settings.osc.ackBefore')}<span className="mono">{tr('settings.osc.ack')}</span>{tr('settings.osc.ackAfter')}</p>
      </Panel>
      <Panel title={tr('settings.remote.title')}>
        <div className="grid g2">
          <label className="check"><input type="checkbox" data-testid="remote-enabled" checked={r.enabled} onChange={(e) => onChange({ ...value, remote: { ...r, enabled: e.target.checked } })} />{tr('settings.remote.enable')}</label>
          <Field label={tr('settings.remote.port')}><NumberInput value={r.port} min={1024} max={65535} onChange={(port) => onChange({ ...value, remote: { ...r, port } })} /></Field>
          <Field label={tr('settings.remote.bind')} hint={tr('settings.remote.bindHint')}>
            <select className="select" data-testid="remote-bind" value={r.bind} onChange={(e) => onChange({ ...value, remote: { ...r, bind: e.target.value } })}>
              <option value="0.0.0.0">{tr('settings.bind.all')}</option>
              {[...new Set([...ips, r.bind])].filter((ip) => ip !== '0.0.0.0' && ip !== '127.0.0.1').map((ip) => <option key={ip} value={ip}>{ip}{ips.includes(ip) ? '' : tr('settings.remote.missing')}</option>)}
              <option value="127.0.0.1">{tr('settings.bind.local')}</option>
            </select>
          </Field>
        </div>
        <p className="small dim">{tr('settings.remote.scope')}</p>
        <p className="small"><span className="badge warn">{tr('settings.remote.private')}</span> {tr('settings.remote.privateHint')}</p>
        {r.enabled && r.token && (
          <table className="table small" data-testid="remote-urls"><tbody>
            {(r.bind === '0.0.0.0' ? (ips.length ? ips : [tr('settings.remote.ipPlaceholder')]) : [r.bind]).map((ip) => <tr key={ip}><td className="mono">{`http://${ip}:${r.port}/?t=${r.token}`}</td></tr>)}
          </tbody></table>
        )}
        <button className="btn" data-testid="remote-new-token" onClick={() => onChange({ ...value, remote: { ...r, token: crypto.randomUUID() } })}>{tr('settings.remote.newToken')}</button>
      </Panel>
      <Panel title={tr('settings.timecode.title')}>
        <div className="grid g2">
          <Field label={tr('settings.timecode.source')} hint={tr('settings.timecode.sourceHint')}>
            <select className="select" value={value.timecode.source} onChange={(e) => onChange({ ...value, timecode: { ...value.timecode, source: e.target.value as Settings['control']['timecode']['source'] } })}>
              <option value="off">{tr('settings.off')}</option><option value="mtc">{tr('settings.timecode.mtc')}</option><option value="ltc">{tr('settings.timecode.ltc')}</option>
            </select>
          </Field>
          {value.timecode.source === 'ltc' && (
            <Field label={tr('settings.timecode.ltcInput')}>
              <select className="select" value={value.timecode.ltcDeviceId ?? ''} onChange={(e) => onChange({ ...value, timecode: { ...value.timecode, ltcDeviceId: e.target.value || null } })}>
                <option value="">{tr('settings.timecode.defaultInput')}</option>
                {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
              </select>
            </Field>
          )}
        </div>
        <p className="small">{tr('settings.timecode.last')}<span className="mono">{status.timecode ?? '—'}</span></p>
      </Panel>
    </>
  );
}

function RecentPanel({ recent, onChange }: { recent: string[]; onChange: (list: string[]) => void }) {
  const tr = useT();
  const clearAll = async () => {
    if (await confirmAction({ title: tr('settings.recent.clearTitle'), message: tr('settings.recent.clearMessage'), confirmLabel: tr('settings.recent.clear'), danger: true })) onChange([]);
  };
  return (
    <Panel title={tr('start.recent')} actions={recent.length > 0 && <button className="btn ghost sm" onClick={() => void clearAll()} data-testid="recent-clear"><Trash2 size={12} />{tr('settings.recent.clear')}</button>}>
      {recent.length ? (
        <div className="start-recent" role="list" style={{ maxHeight: 'none' }}>
          {recent.map((p) => {
            const { name, dir } = splitPath(p);
            return (
              <div key={p} role="listitem" className="row" style={{ gap: 4 }}>
                <button className="start-recent-item grow" onClick={() => void openProject(p)} title={p}>
                  <FolderOpen size={14} className="dim" /><span className="grow col"><b>{name}</b><span className="small dim">{dir}</span></span>
                </button>
                <button className="btn ghost sm icon" onClick={() => onChange(recent.filter((x) => x !== p))} title={tr('settings.recent.remove')} aria-label={`${tr('settings.recent.remove')} : ${name}`} data-testid="recent-remove"><X size={13} /></button>
              </div>
            );
          })}
        </div>
      ) : <p className="small muted" style={{ margin: 0 }}>{tr('start.none')}</p>}
    </Panel>
  );
}

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} Mo`;

/** Disk used by imported audio, the AI cache and recovery copies; purges only what is no longer referenced. */
function StoragePanel() {
  const tr = useT();
  const [r, setR] = useState<StorageReport | null>(null);
  const load = () => void act({ type: 'storage.report' }).then((x) => setR(x ?? null));
  useEffect(load, []);
  const purge = async (what: 'music' | 'aiCache' | 'autosave') => {
    if (!(await confirmAction({ title: tr('settings.storage.purgeTitle'), message: tr(`settings.storage.purge.${what}`), confirmLabel: tr('settings.storage.purge') }))) return;
    await act({ type: 'storage.purge', [what]: true });
    load();
  };
  if (!r) return null;
  const rows = [
    { id: 'music' as const, label: tr('settings.storage.music', { n: r.music.files, size: mb(r.music.bytes), orphans: r.music.orphans, orphanSize: mb(r.music.orphanBytes) }), can: r.music.orphans > 0 },
    { id: 'aiCache' as const, label: tr('settings.storage.aiCache', { n: r.aiCache.files, size: mb(r.aiCache.bytes) }), can: r.aiCache.files > 0 },
    { id: 'autosave' as const, label: tr('settings.storage.autosave', { n: r.autosave.files, size: mb(r.autosave.bytes), stale: r.autosave.stale }), can: r.autosave.stale > 0 },
  ];
  return (
    <Panel title={tr('settings.storage.title')}>
      <table className="table small" data-testid="storage-report"><tbody>
        {rows.map((row) => (
          <tr key={row.id}><td>{row.label}</td><td style={{ textAlign: 'right' }}><button className="btn sm" disabled={!row.can} onClick={() => void purge(row.id)}>{tr('settings.storage.purge')}</button></td></tr>
        ))}
      </tbody></table>
    </Panel>
  );
}

export function SettingsPage() {
  const tr = useT();
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [tab, setTab] = useState<TabId>('general');
  const [key, setKey] = useState('');
  const [recovery, setRecovery] = useState<RecoveryEntry[]>([]);
  const rt = useStore((st) => st.runtime);
  const project = useStore((st) => st.project!);
  useEffect(() => { void act({ type: 'settings.get' }).then((x) => { if (x) { setS(x); setSaved(x); } }); }, []);
  useEffect(() => { if (tab === 'backups') void act({ type: 'project.listRecovery' }).then((x) => setRecovery(x ?? [])); }, [tab]);
  const reduced = !!s?.appearance.reducedMotion;
  const scale = s?.appearance.uiScale ?? 1;
  useEffect(() => { document.documentElement.classList.toggle('reduced-motion', reduced); document.documentElement.style.zoom = String(scale); }, [reduced, scale]);
  if (!s) return <div className="page">{tr('common.loading')}</div>;
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const set = <K extends keyof Settings>(k: K, v: Partial<Settings[K]>) => setS({ ...s, [k]: { ...(s[k] as object), ...v } });
  const save = async () => { if (await act({ type: 'settings.update', settings: s })) { setSaved(s); useStore.setState({ shortcuts: s.shortcuts, language: s.appearance.language, installPlanButton: s.general.installPlanButton }); void externalControl.configure(s.control); useStore.getState().toast({ kind: 'success', title: tr('settings.saved') }); } };
  const tabs = TAB_IDS.map((id) => ({ id, label: tr(`settings.tab.${id}`) }));
  // Removing recent projects is saved at once, without committing the other pending edits.
  const forgetRecent = async (recentProjects: string[]) => {
    const paths = s.general.recentProjects.filter((p) => !recentProjects.includes(p));
    if (!paths.length || !(await act({ type: 'settings.forgetRecent', paths }))) return;
    const next = { ...saved!, general: { ...saved!.general, recentProjects } };
    setSaved(next);
    setS({ ...s, general: { ...s.general, recentProjects } });
  };

  return (
    <div className="page">
      <PageHead title={tr('nav.settings')} subtitle={tr('settings.subtitle')}>
        <button className="btn" disabled={!dirty} onClick={() => setS(saved)}>{tr('settings.discard')}</button>
        <button className="btn primary" disabled={!dirty} onClick={() => void save()} data-testid="settings-save">{tr('common.save')}</button>
      </PageHead>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tab === 'general' && (
          <Panel title={tr('settings.tab.general')}>
            <div className="grid g2" style={{ alignItems: 'start' }}>
              <Field label={tr('settings.general.autosave')} hint={tr('settings.general.autosaveHint')}><NumberInput value={s.general.autosaveMinutes} min={0} max={60} onChange={(v) => set('general', { autosaveMinutes: v })} /></Field>
              <div className="col" style={{ gap: 10, paddingTop: 22 }}>
                <label className="check"><input type="checkbox" checked={s.general.confirmDangerous} onChange={(e) => set('general', { confirmDangerous: e.target.checked })} />{tr('settings.general.confirmDangerous')}</label>
                <label className="check"><input type="checkbox" data-testid="detach-stage3d-on-start" checked={s.general.detachStage3dOnStart} onChange={(e) => set('general', { detachStage3dOnStart: e.target.checked })} />{tr('settings.general.detachStage3d')}</label>
                <label className="check"><input type="checkbox" data-testid="detach-console-on-start" checked={s.general.detachConsoleOnStart} onChange={(e) => set('general', { detachConsoleOnStart: e.target.checked })} />{tr('settings.general.detachConsole')}</label>
                <label className="check" title={tr('settings.general.installPlanHint')}><input type="checkbox" data-testid="install-plan-button" checked={s.general.installPlanButton} onChange={(e) => set('general', { installPlanButton: e.target.checked })} />{tr('settings.general.installPlan')}</label>
              </div>
            </div>
          </Panel>
        )}
        {tab === 'general' && <RecentPanel recent={s.general.recentProjects} onChange={(recentProjects) => void forgetRecent(recentProjects)} />}
        {tab === 'general' && <UpdatesPanel value={s.general} onChange={(v) => set('general', v)} />}
        {tab === 'appearance' && (
          <Panel title={tr('settings.tab.appearance')}>
            <div className="grid g2">
              <label className="check"><input type="checkbox" checked={s.appearance.reducedMotion} onChange={(e) => set('appearance', { reducedMotion: e.target.checked })} />{tr('settings.appearance.reducedMotion')}</label>
              <Field label={tr('settings.appearance.scale')}><NumberInput value={s.appearance.uiScale} min={0.8} max={1.4} step={0.05} onChange={(v) => set('appearance', { uiScale: v })} /></Field>
              <Field label={tr('settings.appearance.language')} hint={tr('settings.appearance.languageHint')}>
                <select className="select" data-testid="language" value={s.appearance.language} onChange={(e) => set('appearance', { language: e.target.value as Settings['appearance']['language'] })}>
                  {/* Language names stay in their own language. */}
                  <option value="fr">Français</option><option value="en">English</option>
                </select>
              </Field>
            </div>
          </Panel>
        )}
        {tab === 'engine' && (
          <Panel title={tr('settings.engine.title')}>
            <div className="grid g2">
              <Field label={tr('settings.engine.rate')} hint={tr('settings.engine.rateHint')}><NumberInput value={s.engine.rateHz} min={10} max={44} onChange={(v) => set('engine', { rateHz: v })} /></Field>
              <Field label={tr('settings.engine.blackout')} hint={tr('settings.engine.blackoutHint')}>
                <select className="select" value={s.engine.blackoutPolicy} onChange={(e) => set('engine', { blackoutPolicy: e.target.value as Settings['engine']['blackoutPolicy'] })}>
                  <option value="intensity">{tr('settings.engine.blackout.intensity')}</option>
                  <option value="intensity-shutter">{tr('settings.engine.blackout.intensity-shutter')}</option>
                  <option value="all-zero">{tr('settings.engine.blackout.all-zero')}</option>
                </select>
              </Field>
              <Field label={tr('settings.engine.maxStrobe')} hint={tr('settings.engine.maxStrobeHint')}><NumberInput value={s.engine.maxStrobeHz} min={1} max={25} onChange={(v) => set('engine', { maxStrobeHz: v })} /></Field>
              <Field label={tr('settings.engine.flashGuard')} hint={tr('settings.engine.flashGuardHint')}>
                <select className="select" data-testid="flash-guard" value={s.engine.flashGuard} onChange={(e) => set('engine', { flashGuard: e.target.value as Settings['engine']['flashGuard'] })}>
                  <option value="off">{tr('settings.off')}</option>
                  <option value="warn">{tr('settings.engine.flashGuard.warn')}</option>
                  <option value="limit">{tr('settings.engine.flashGuard.limit')}</option>
                </select>
              </Field>
              <Field label={tr('settings.engine.priorityAi')}><NumberInput value={s.engine.priorities.ai} min={1} max={99} onChange={(v) => set('engine', { priorities: { ...s.engine.priorities, ai: v } })} /></Field>
              <Field label={tr('settings.engine.priorityTimeline')}><NumberInput value={s.engine.priorities.timeline} min={1} max={99} onChange={(v) => set('engine', { priorities: { ...s.engine.priorities, timeline: v } })} /></Field>
              <Field label={tr('settings.engine.priorityAudio')}><NumberInput value={s.engine.priorities.audio} min={1} max={99} onChange={(v) => set('engine', { priorities: { ...s.engine.priorities, audio: v } })} /></Field>
            </div>
            <p className="small dim" style={{ marginBottom: 0 }}>{tr('settings.engine.merge')}</p>
          </Panel>
        )}
        {tab === 'network' && (
          <Panel title={tr('settings.network.title')}>
            <p className="muted" style={{ marginTop: 0 }}>{tr('settings.network.intro')}<button className="btn sm" onClick={() => useStore.getState().setPage('output')}>{tr('nav.output')}</button>.</p>
            <table className="table small"><tbody>
              <tr><td>{tr('settings.network.outputs')}</td><td>{s.outputs.map((o) => o.name).join(', ')}</td></tr>
              <tr><td>{tr('settings.network.cid')}</td><td className="mono">{s.sacn?.cid ?? '—'}</td></tr>
            </tbody></table>
            <label className="check" style={{ marginTop: 10 }}><input type="checkbox" data-testid="auto-arm-on-start" checked={s.general.autoArmOnStart} onChange={(e) => set('general', { autoArmOnStart: e.target.checked })} />{tr('settings.network.autoArm')}</label>
            <p className="small dim" style={{ marginBottom: 0 }}>{tr('settings.network.armingNever')}</p>
          </Panel>
        )}
        {tab === 'ai' && (
          <Panel title={tr('settings.tab.ai')}>
            <div className="grid g2">
              <Field label={tr('settings.ai.provider')}>
                <select className="select" value={s.ai.provider} data-testid="ai-provider" onChange={(e) => set('ai', { provider: e.target.value as Settings['ai']['provider'] })}>
                  <option value="local">{tr('settings.ai.provider.local')}</option>
                  <option value="openrouter">{tr('settings.ai.provider.openrouter')}</option>
                </select>
              </Field>
              <Field label={tr('settings.ai.timeout')}><NumberInput value={s.ai.timeoutSec} min={5} max={300} onChange={(v) => set('ai', { timeoutSec: v })} /></Field>
              <label className="check"><input type="checkbox" checked={s.ai.fallbackToLocal} onChange={(e) => set('ai', { fallbackToLocal: e.target.checked })} />{tr('settings.ai.fallback')}</label>
              <Field label={tr('settings.ai.budget')} hint={tr('settings.ai.budgetHint')}><NumberInput value={s.ai.monthlyBudget ?? 0} min={0} max={10000} onChange={(v) => set('ai', { monthlyBudget: v > 0 ? v : null })} /></Field>
              <label className="check" title={tr('settings.ai.strobeTitle')}><input type="checkbox" checked={s.ai.allowStrobe} onChange={(e) => set('ai', { allowStrobe: e.target.checked })} />{tr('settings.ai.allowStrobe')}</label>
              <label className="check" title={tr('settings.ai.autoSuggestHint')}><input type="checkbox" checked={s.ai.autoSuggestIntents} onChange={(e) => set('ai', { autoSuggestIntents: e.target.checked })} />{tr('settings.ai.autoSuggest')}</label>
            </div>
            {s.ai.provider === 'openrouter' && (
              <div className="col" style={{ marginTop: 14 }}>
                <ModelPicker value={s.ai.model} onChange={(model) => set('ai', { model })} />
                <Field label={tr('settings.ai.effort')} hint={tr('settings.ai.effortHint')}>
                  <select className="select" style={{ maxWidth: 260 }} value={s.ai.effort} onChange={(e) => set('ai', { effort: e.target.value as Settings['ai']['effort'] })}>
                    <option value="low">{tr('settings.ai.effort.low')}</option><option value="medium">{tr('settings.ai.effort.medium')}</option><option value="high">{tr('settings.ai.effort.high')}</option>
                  </select>
                </Field>
                <Field label={tr('settings.ai.key')} hint={tr('settings.ai.keyHint')}>
                  <div className="row">
                    <input className="input mono" type="password" autoComplete="off" placeholder={rt?.ai.hasKey ? tr('settings.ai.keySaved') : 'sk-or-v1-…'} value={key} onChange={(e) => setKey(e.target.value)} />
                    <button className="btn primary" disabled={key.trim().length < 10} onClick={() => void act({ type: 'ai.setKey', key: key.trim() }).then((r) => r && setKey(''))}><KeyRound size={13} />{tr('common.save')}</button>
                    <button className="btn danger" disabled={!rt?.ai.hasKey} onClick={() => void act({ type: 'ai.setKey', key: null })}>{tr('common.delete')}</button>
                  </div>
                </Field>
                <span className="small">{tr('settings.ai.state')}{rt?.ai.hasKey ? <span className="badge ok">{tr('settings.ai.keySet')}</span> : <span className="badge warn">{tr('settings.ai.noKey')}</span>}{rt?.ai.lastError ? <span className="badge err" style={{ marginLeft: 6 }}>{rt.ai.lastError}</span> : null}</span>
                <p className="small dim" style={{ margin: 0 }}>{tr('settings.ai.privacy')}</p>
              </div>
            )}
          </Panel>
        )}
        {tab === 'audio' && (
          <Panel title={tr('settings.tab.audio')}>
            <p className="muted" style={{ margin: 0 }}>{tr('settings.audio.before')}<button className="btn sm" onClick={() => useStore.getState().setPage('audio')}>{tr('nav.audio')}</button>{tr('settings.audio.after')}</p>
          </Panel>
        )}
        {tab === 'shortcuts' && (
          <Panel title={tr('settings.shortcuts.title')} flush>
            <ShortcutEditor value={s.shortcuts} onChange={(shortcuts) => setS({ ...s, shortcuts })} />
          </Panel>
        )}
        {tab === 'control' && <ControlTab value={s.control} onChange={(control) => setS({ ...s, control })} />}
        {tab === 'logs' && (
          <Panel title={tr('settings.logs.title')}>
            <div className="grid g2">
              <Field label={tr('settings.logs.level')}>
                <select className="select" value={s.logs.level} onChange={(e) => set('logs', { level: e.target.value as Settings['logs']['level'] })}>
                  <option value="debug">{tr('settings.logs.level.debug')}</option><option value="info">{tr('settings.logs.level.info')}</option><option value="warn">{tr('settings.logs.level.warn')}</option><option value="error">{tr('settings.logs.level.error')}</option>
                </select>
              </Field>
              <div className="row"><button className="btn" onClick={() => useStore.getState().toggleDiag()}>{tr('settings.logs.openConsole')}</button></div>
            </div>
            <p className="small muted">{tr('settings.logs.fileBefore')}<span className="mono">{'logs'}</span>{tr('settings.logs.fileAfter')}</p>
            <div className="row"><button className="btn" onClick={() => void act({ type: 'diagnostic.export' })}>{tr('settings.logs.export')}</button></div>
          </Panel>
        )}
        {tab === 'logs' && <FeedbackPanel />}
        {tab === 'logs' && <UsagePanel enabled={s.telemetry.usage} onChange={(usage) => set('telemetry', { usage })} />}
        {tab === 'backups' && (
          <Panel title={tr('settings.backups.title')}>
            <p className="small muted" style={{ marginTop: 0 }}>{tr('settings.backups.intro')}</p>
            {recovery.length === 0 ? <p className="muted">{tr('settings.backups.none')}</p> : (
              <table className="table small"><tbody>
                {recovery.map((r) => (
                  <tr key={r.file}><td>{r.kind === 'backup' ? <span className="badge">.bak</span> : <span className="badge cyan">{tr('settings.backups.auto')}</span>}</td><td className="mono">{r.name}</td><td>{new Date(r.modifiedAt).toLocaleString()}</td>
                    <td><button className="btn sm" onClick={async () => (!project.dirty || (await confirmAction({ title: tr('settings.backups.openTitle'), message: tr('settings.backups.openMessage'), confirmLabel: tr('common.open') }))) && void act({ type: 'project.openRecovery', file: r.file })}>{tr('common.open')}</button></td></tr>
                ))}
              </tbody></table>
            )}
            <div className="row"><button className="btn" onClick={() => void act({ type: 'project.export' })}>{tr('settings.backups.export')}</button></div>
          </Panel>
        )}
        {tab === 'backups' && <StoragePanel />}
      </div>
    </div>
  );
}
