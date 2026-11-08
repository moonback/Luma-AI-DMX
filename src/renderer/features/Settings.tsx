import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AudioLines, Bot, Check, Cpu, DatabaseBackup, Keyboard, KeyRound, LayoutTemplate, Network, Palette, ScrollText, Search, Settings2, ShieldAlert, SlidersHorizontal, Sparkles, type LucideIcon } from 'lucide-react';
import { useStore, confirmAction } from '../store';
import { act } from '../api';
import { Field, Modal, NumberInput, PageHead, Panel } from '../components/ui';
import { DEFAULT_COMPONENT_VISIBILITY, workspaceProfilesFileSchema, type Settings, type WorkspaceProfile } from '../../core/settings/settings';
import type { RecoveryEntry } from '../../core/project/store';
import { externalControl } from '../control';
import { audioEngine } from '../audioEngine';
import { FeedbackPanel, UsagePanel } from './settings/BetaPanel';
import { LicensePanel } from './settings/LicensePanel';
import { AssistantPanel } from './settings/AssistantPanel';
import { ShortcutEditor } from './settings/ShortcutEditor';
import { ModelPicker } from './settings/ModelPicker';
import { ControlTab } from './settings/ControlTab';
import { RecentPanel, StoragePanel, UpdatesPanel } from './settings/SystemPanels';
import { SafetyPanel } from './settings/SafetyPanel';
import { Setting, SettingsDraft, SettingsSearchResults } from './settings/Setting';
import { TAB_GROUPS, type TabId } from './settings/registry';
import { useT } from '../i18n';

const TAB_ICONS: Record<TabId, LucideIcon> = {
  general: Settings2, appearance: Palette, shortcuts: Keyboard, safety: ShieldAlert, engine: Cpu, network: Network, audio: AudioLines,
  control: SlidersHorizontal, ai: Sparkles, assistant: Bot, logs: ScrollText, backups: DatabaseBackup,
};

export function SettingsPage() {
  const tr = useT();
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [tab, setTab] = useState<TabId>('general');
  const [query, setQuery] = useState('');
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [workspaceProfileName, setWorkspaceProfileName] = useState('');
  const [profilesOpen, setProfilesOpen] = useState(false);
  const workspaceProfileFile = useRef<HTMLInputElement>(null);
  const [key, setKey] = useState('');
  const [voiceKey, setVoiceKey] = useState('');
  const [recovery, setRecovery] = useState<RecoveryEntry[]>([]);
  const rt = useStore((st) => st.runtime);
  const project = useStore((st) => st.project!);
  useEffect(() => { void act({ type: 'settings.get' }).then((x) => { if (x) { setS(x); setSaved(x); } }); }, []);
  useEffect(() => { if (tab === 'backups') void act({ type: 'project.listRecovery' }).then((x) => setRecovery(x ?? [])); }, [tab]);
  const reduced = !!s?.appearance.reducedMotion;
  const scale = s?.appearance.uiScale ?? 1;
  useEffect(() => { document.documentElement.classList.toggle('reduced-motion', reduced); document.documentElement.style.zoom = String(scale); }, [reduced, scale]);
  // A search hit opens its tab, then scrolls to the setting and highlights it briefly.
  useEffect(() => {
    if (!focusPath) return;
    const el = document.querySelector<HTMLElement>(`[data-setting="${focusPath}"]`);
    el?.scrollIntoView?.({ block: 'center' });
    el?.classList.add('flash');
    const id = window.setTimeout(() => { el?.classList.remove('flash'); setFocusPath(null); }, 1600);
    return () => window.clearTimeout(id);
  }, [focusPath, tab]);
  if (!s) return <div className="page">{tr('common.loading')}</div>;
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const commitWorkspaceSettings = async (nextSettings: Settings, successKey: 'settings.components.profileSaved' | 'settings.components.profileApplied' | 'settings.components.profileImported' = 'settings.components.profileSaved') => {
    if (!(await act({ type: 'settings.update', settings: nextSettings }))) return false;
    setS(nextSettings);
    setSaved(nextSettings);
    useStore.setState({ componentVisibility: nextSettings.appearance.components });
    const current = useStore.getState().page;
    if (current !== 'settings' && !nextSettings.appearance.components.pages[current as keyof typeof nextSettings.appearance.components.pages]) {
      const fallback = (Object.keys(nextSettings.appearance.components.pages) as Array<keyof typeof nextSettings.appearance.components.pages>).find((id) => nextSettings.appearance.components.pages[id]) ?? 'settings';
      useStore.getState().setPage(fallback);
    }
    useStore.getState().toast({ kind: 'success', title: tr(successKey) });
    return true;
  };
  const saveWorkspaceProfile = async (replaceActive = false) => {
    const activeIndex = s.appearance.workspaceProfiles.findIndex((p) => p.id === s.appearance.activeWorkspaceProfileId);
    const activeProfile = activeIndex >= 0 ? s.appearance.workspaceProfiles[activeIndex] : undefined;
    const name = replaceActive && activeProfile ? activeProfile.name : workspaceProfileName.trim();
    if (!name) return;
    const profiles = [...s.appearance.workspaceProfiles];
    let uniqueName = name;
    if (!replaceActive) {
      let suffix = 2;
      while (profiles.some((p) => p.name.toLocaleLowerCase() === uniqueName.toLocaleLowerCase())) uniqueName = name.slice(0, 54) + ' (' + suffix++ + ')';
    }
    const profile: WorkspaceProfile = { id: replaceActive && activeProfile ? activeProfile.id : crypto.randomUUID(), name: uniqueName, components: s.appearance.components };
    if (replaceActive && activeIndex >= 0) profiles[activeIndex] = profile;
    else profiles.push(profile);
    if (profiles.length > 30) {
      useStore.getState().toast({ kind: 'error', title: tr('settings.components.profileLimit') });
      return;
    }
    const nextSettings = { ...s, appearance: { ...s.appearance, workspaceProfiles: profiles, activeWorkspaceProfileId: profile.id } };
    if (await commitWorkspaceSettings(nextSettings)) setWorkspaceProfileName('');
  };
  const applyWorkspaceProfile = async (id: string) => {
    const profile = saved!.appearance.workspaceProfiles.find((p) => p.id === id);
    if (!profile) return;
    const nextSettings = { ...saved!, appearance: { ...saved!.appearance, components: profile.components, activeWorkspaceProfileId: profile.id } };
    await commitWorkspaceSettings(nextSettings, 'settings.components.profileApplied');
  };
  const exportWorkspaceProfiles = () => {
    const profiles = s.appearance.workspaceProfiles;
    if (!profiles.length) return;
    const payload = JSON.stringify({ format: 'luma-workspace-presets', version: 1, profiles }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'luma-workspace-profiles.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importWorkspaceProfiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error(tr('settings.components.profileInvalidFile'));
      const parsed = workspaceProfilesFileSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error(tr('settings.components.profileInvalidFile'));
      const existing = [...s.appearance.workspaceProfiles];
      const remaining = 30 - existing.length;
      if (remaining <= 0 || parsed.data.profiles.length > remaining) throw new Error(tr('settings.components.profileLimit'));
      parsed.data.profiles.forEach((item) => {
        let name = item.name;
        let suffix = 2;
        while (existing.some((p) => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
          name = item.name.slice(0, 54) + ' (' + suffix++ + ')';
        }
        const profile = { ...item, id: crypto.randomUUID(), name };
        existing.push(profile);
      });
      const nextSettings = { ...s, appearance: { ...s.appearance, workspaceProfiles: existing } };
      await commitWorkspaceSettings(nextSettings, 'settings.components.profileImported');
    } catch (error) {
      useStore.getState().toast({ kind: 'error', title: tr('settings.components.profileImportFailed'), detail: error instanceof Error ? error.message : String(error) });
    }
  };
  const set = <K extends keyof Settings>(k: K, v: Partial<Settings[K]>) => setS({ ...s, [k]: { ...(s[k] as object), ...v } });
  const save = async (n: Settings = s) => {
    if (await act({ type: 'settings.update', settings: n })) {
      setS(n);
      setSaved(n);
      useStore.setState({ shortcuts: n.shortcuts, componentVisibility: n.appearance.components, language: n.appearance.language, installPlanButton: n.general.installPlanButton });
      const current = useStore.getState().page;
      if (current !== 'settings' && !n.appearance.components.pages[current as keyof typeof n.appearance.components.pages]) {
        const fallback = (Object.keys(n.appearance.components.pages) as Array<keyof typeof n.appearance.components.pages>).find((id) => n.appearance.components.pages[id]) ?? 'settings';
        useStore.getState().setPage(fallback);
      }
      void externalControl.configure(n.control);
      audioEngine.setLatency(n.audio.latencyMs);
      useStore.getState().toast({ kind: 'success', title: tr('settings.saved') });
    }
  };
  const activeProfile = s.appearance.workspaceProfiles.find((p) => p.id === s.appearance.activeWorkspaceProfileId);
  // Saves every pending edit and copies the current layout into the active workspace profile.
  const saveToActiveProfile = () => activeProfile && void save({
    ...s,
    appearance: { ...s.appearance, workspaceProfiles: s.appearance.workspaceProfiles.map((p) => (p.id === activeProfile.id ? { ...p, components: s.appearance.components } : p)) },
  });
  const TabIcon = TAB_ICONS[tab];
  // Removing recent projects is saved at once, without committing the other pending edits.
  const forgetRecent = async (recentProjects: string[]) => {
    const paths = s.general.recentProjects.filter((p) => !recentProjects.includes(p));
    if (!paths.length || !(await act({ type: 'settings.forgetRecent', paths }))) return;
    const next = { ...saved!, general: { ...saved!.general, recentProjects } };
    setSaved(next);
    setS({ ...s, general: { ...s.general, recentProjects } });
  };

  return (
    <div className="page settings-page">
      <PageHead title={tr('nav.settings')} subtitle={tr('settings.subtitle')} />
      <div className="settings-layout">
        <nav className="settings-nav" role="tablist" aria-orientation="vertical" aria-label={tr('nav.settings')}>
          <div className="settings-search" role="presentation">
            <Search size={14} className="dim" />
            <input className="input" type="search" data-testid="settings-search" aria-label={tr('settings.search.label')} placeholder={tr('settings.search.placeholder')} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQuery('')} />
          </div>
          {TAB_GROUPS.map((g) => (
            <div key={g.id} className="settings-nav-group" role="presentation">
              <div className="settings-nav-title" aria-hidden="true">{tr(`settings.group.${g.id}`)}</div>
              {g.tabs.map((id) => {
                const Icon = TAB_ICONS[id];
                return (
                  <button key={id} role="tab" aria-selected={tab === id} className={`settings-nav-item ${tab === id ? 'active' : ''}`} onClick={() => { setTab(id); setQuery(''); }}>
                    <span className="settings-nav-icon"><Icon size={15} /></span>
                    <span className="settings-nav-text">
                      <span className="settings-nav-label">{tr(`settings.tab.${id}`)}</span>
                      {/* Kept out of the accessible name, which stays the bare tab label. */}
                      <span className="settings-nav-desc" aria-hidden="true">{tr(`settings.desc.${id}`)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="settings-main">
      <SettingsDraft.Provider value={{ s, setS }}>
      {query.trim() ? <SettingsSearchResults query={query} onPick={(id, def) => { setTab(id); setQuery(''); setFocusPath(def?.path ?? null); }} /> : (
      <div key={tab} className="settings-content" role="tabpanel">
        <header className="settings-hero">
          <span className="settings-hero-icon"><TabIcon size={22} /></span>
          <div>
            <h2>{tr(`settings.tab.${tab}`)}</h2>
            <p>{tr(`settings.desc.${tab}`)}</p>
          </div>
        </header>
        {tab === 'general' && (
          <Panel title={tr('settings.general.startup')}>
            <div className="grid g2" style={{ alignItems: 'start' }}>
              <Setting path="general.autosaveMinutes"><Field label={tr('settings.general.autosave')} hint={tr('settings.general.autosaveHint')}><NumberInput value={s.general.autosaveMinutes} min={0} max={60} onChange={(v) => set('general', { autosaveMinutes: v })} /></Field></Setting>
              <div className="col" style={{ gap: 10, paddingTop: 22 }}>
                <Setting path="general.confirmDangerous"><label className="check"><input type="checkbox" checked={s.general.confirmDangerous} onChange={(e) => set('general', { confirmDangerous: e.target.checked })} />{tr('settings.general.confirmDangerous')}</label></Setting>
                <Setting path="general.detachStage3dOnStart"><label className="check"><input type="checkbox" data-testid="detach-stage3d-on-start" checked={s.general.detachStage3dOnStart} onChange={(e) => set('general', { detachStage3dOnStart: e.target.checked })} />{tr('settings.general.detachStage3d')}</label></Setting>
                <Setting path="general.detachConsoleOnStart"><label className="check"><input type="checkbox" data-testid="detach-console-on-start" checked={s.general.detachConsoleOnStart} onChange={(e) => set('general', { detachConsoleOnStart: e.target.checked })} />{tr('settings.general.detachConsole')}</label></Setting>
                <Setting path="general.simpleConsoleOnStart"><label className="check" title={tr('settings.general.simpleConsoleHint')}><input type="checkbox" data-testid="simple-console-on-start" checked={s.general.simpleConsoleOnStart} onChange={(e) => set('general', { simpleConsoleOnStart: e.target.checked })} />{tr('settings.general.simpleConsole')}</label></Setting>
                <Setting path="general.installPlanButton"><label className="check" title={tr('settings.general.installPlanHint')}><input type="checkbox" data-testid="install-plan-button" checked={s.general.installPlanButton} onChange={(e) => set('general', { installPlanButton: e.target.checked })} />{tr('settings.general.installPlan')}</label></Setting>
              </div>
            </div>
          </Panel>
        )}
        {tab === 'general' && <RecentPanel recent={s.general.recentProjects} onChange={(recentProjects) => void forgetRecent(recentProjects)} />}
        {tab === 'general' && (
          <div className="grid g2 settings-cards">
            <LicensePanel />
            <UpdatesPanel value={s.general} onChange={(v) => set('general', v)} />
          </div>
        )}
        {tab === 'appearance' && (
          <Panel title={tr('settings.components.profilesTitle')}>
            <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
              <span className="grow small muted">{tr('settings.components.profilesHint')}</span>
              <span className="badge cyan">{s.appearance.workspaceProfiles.find((p) => p.id === s.appearance.activeWorkspaceProfileId)?.name ?? tr('settings.components.profileSelectPlaceholder')}</span>
              <span className="badge">{s.appearance.workspaceProfiles.length} / 30</span>
              <button className="btn primary sm" onClick={() => setProfilesOpen(true)} data-testid="workspace-profiles-open"><LayoutTemplate size={13} />{tr('settings.components.profilesOpen')}</button>
            </div>
          </Panel>
        )}
        {tab === 'appearance' && profilesOpen && (
          <Modal title={tr('settings.components.profilesTitle')} onClose={() => setProfilesOpen(false)} footer={<button className="btn" onClick={() => setProfilesOpen(false)}>{tr('common.close')}</button>}>
            <p className="small muted" style={{ marginTop: 0 }}>{tr('settings.components.profilesHint')}</p>
            <div className="grid g2" style={{ alignItems: 'end' }}>
              <Field label={tr('settings.components.profileSelector')}>
                <select className="select" value={s.appearance.activeWorkspaceProfileId ?? ''} disabled={dirty || s.appearance.workspaceProfiles.length === 0} onChange={(e) => void applyWorkspaceProfile(e.target.value)} data-testid="workspace-profile-select">
                  <option value="">{tr('settings.components.profileSelectPlaceholder')}</option>
                  {s.appearance.workspaceProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                </select>
              </Field>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button className="btn sm" disabled={!s.appearance.activeWorkspaceProfileId} onClick={() => void saveWorkspaceProfile(true)}>{tr('settings.components.profileUpdate')}</button>
                <button className="btn sm" disabled={!s.appearance.activeWorkspaceProfileId || dirty} onClick={() => {
                  const profiles = s.appearance.workspaceProfiles.filter((p) => p.id !== s.appearance.activeWorkspaceProfileId);
                  setS({ ...s, appearance: { ...s.appearance, workspaceProfiles: profiles, activeWorkspaceProfileId: null } });
                }}>{tr('settings.components.profileDelete')}</button>
              </div>
            </div>
            <div className="row" style={{ alignItems: 'end', marginTop: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <Field label={tr('settings.components.profileName')}>
                  <input className="input" maxLength={60} value={workspaceProfileName} onChange={(e) => setWorkspaceProfileName(e.target.value)} placeholder={tr('settings.components.profileNamePlaceholder')} />
                </Field>
              </div>
              <button className="btn primary sm" disabled={!workspaceProfileName.trim() || s.appearance.workspaceProfiles.length >= 30} onClick={() => void saveWorkspaceProfile()} data-testid="workspace-profile-save">{tr('settings.components.profileSave')}</button>
            </div>
            <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
              <button className="btn sm" disabled={!s.appearance.workspaceProfiles.length} onClick={exportWorkspaceProfiles} data-testid="workspace-profile-export">{tr('settings.components.profileExport')}</button>
              <button className="btn sm" onClick={() => workspaceProfileFile.current?.click()} data-testid="workspace-profile-import">{tr('settings.components.profileImport')}</button>
              <input ref={workspaceProfileFile} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => void importWorkspaceProfiles(e)} />
            </div>
            {dirty && <p className="small muted">{tr('settings.components.profileSavePending')}</p>}
          </Modal>
        )}
        {tab === 'appearance' && (
          <Panel title={tr('settings.tab.appearance')}>
            <div className="grid g2">
              <Setting path="appearance.reducedMotion"><label className="check"><input type="checkbox" checked={s.appearance.reducedMotion} onChange={(e) => set('appearance', { reducedMotion: e.target.checked })} />{tr('settings.appearance.reducedMotion')}</label></Setting>
              <Setting path="appearance.uiScale"><Field label={tr('settings.appearance.scale')}><NumberInput value={s.appearance.uiScale} min={0.8} max={1.4} step={0.05} onChange={(v) => set('appearance', { uiScale: v })} /></Field></Setting>
              <Setting path="appearance.language"><Field label={tr('settings.appearance.language')} hint={tr('settings.appearance.languageHint')}>
                <select className="select" data-testid="language" value={s.appearance.language} onChange={(e) => set('appearance', { language: e.target.value as Settings['appearance']['language'] })}>
                  {/* Language names stay in their own language. */}
                  <option value="fr">Français</option><option value="en">English</option>
                </select>
              </Field></Setting>
            </div>
          </Panel>
        )}
        {tab === 'appearance' && (
          <>
            <Panel title={tr('settings.components.navigationTitle')}>
              <p className="small muted" style={{ marginTop: 0 }}>{tr('settings.components.navigationHint')}</p>
              <div className="grid g2">
                {([
                  'dashboard', 'fixtures', 'console', 'pantilt', 'programmer', 'cues', 'effects',
                  'quick', 'timeline', 'ai', 'visualizer', 'audio', 'music', 'output',
                ] as const).map((id) => (
                  <label className="check" key={id}>
                    <input type="checkbox" checked={s.appearance.components.pages[id]} onChange={(e) => setS({
                      ...s,
                      appearance: { ...s.appearance, components: { ...s.appearance.components, pages: { ...s.appearance.components.pages, [id]: e.target.checked } } },
                    })} />
                    {tr(`nav.${id}`)}
                  </label>
                ))}
                <div className="small dim">{tr('settings.components.settingsAlwaysVisible')}</div>
              </div>
            </Panel>
            <Panel title={tr('settings.components.stageTitle')}>
              <p className="small muted" style={{ marginTop: 0 }}>{tr('settings.components.stageHint')}</p>
              <div className="grid g2">
                {([
                  ['stage2d', 'settings.components.stage2d'],
                  ['stage3d', 'settings.components.stage3d'],
                  ['stageBuildPanel', 'settings.components.stageBuildPanel'],
                  ['stageInspectorPanel', 'settings.components.stageInspectorPanel'],
                  ['statusBar', 'settings.components.statusBar'],
                  ['diagnosticsButton', 'settings.components.diagnosticsButton'],
                  ['miniPlayer', 'settings.components.miniPlayer'],
                ] as const).map(([id, label]) => (
                  <label className="check" key={id}>
                    <input type="checkbox" checked={s.appearance.components[id]} onChange={(e) => setS({
                      ...s,
                      appearance: { ...s.appearance, components: { ...s.appearance.components, [id]: e.target.checked } },
                    })} />
                    {tr(label)}
                  </label>
                ))}
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn sm" onClick={() => setS({ ...s, appearance: { ...s.appearance, components: DEFAULT_COMPONENT_VISIBILITY } })}>{tr('settings.components.reset')}</button>
              </div>
            </Panel>
            <Panel title={tr('settings.components.dashboardTitle')}>
              <p className="small muted" style={{ marginTop: 0 }}>{tr('settings.components.dashboardHint')}</p>
              <div className="grid g2">
                {([
                  ['firstSteps', 'settings.components.dashboardFirstSteps'],
                  ['hardware', 'settings.components.dashboardHardware'],
                  ['show', 'settings.components.dashboardShow'],
                  ['system', 'settings.components.dashboardSystem'],
                  ['sceneFromText', 'settings.components.dashboardSceneFromText'],
                  ['quickActions', 'settings.components.dashboardQuickActions'],
                  ['alerts', 'settings.components.dashboardAlerts'],
                ] as const).map(([id, label]) => (
                  <label className="check" key={id}>
                    <input type="checkbox" checked={s.appearance.components.dashboard[id]} onChange={(e) => setS({
                      ...s,
                      appearance: { ...s.appearance, components: { ...s.appearance.components, dashboard: { ...s.appearance.components.dashboard, [id]: e.target.checked } } },
                    })} />
                    {tr(label)}
                  </label>
                ))}
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn sm" onClick={() => setS({ ...s, appearance: { ...s.appearance, components: DEFAULT_COMPONENT_VISIBILITY } })}>{tr('settings.components.reset')}</button>
              </div>
            </Panel>
          </>
        )}
        {tab === 'engine' && (
          <Panel title={tr('settings.engine.title')}>
            <div className="grid g2">
              <Setting path="engine.rateHz"><Field label={tr('settings.engine.rate')} hint={tr('settings.engine.rateHint')}><NumberInput value={s.engine.rateHz} min={10} max={44} onChange={(v) => set('engine', { rateHz: v })} /></Field></Setting>
              <Setting path="engine.priorities.ai"><Field label={tr('settings.engine.priorityAi')}><NumberInput value={s.engine.priorities.ai} min={1} max={99} onChange={(v) => set('engine', { priorities: { ...s.engine.priorities, ai: v } })} /></Field></Setting>
              <Setting path="engine.priorities.timeline"><Field label={tr('settings.engine.priorityTimeline')}><NumberInput value={s.engine.priorities.timeline} min={1} max={99} onChange={(v) => set('engine', { priorities: { ...s.engine.priorities, timeline: v } })} /></Field></Setting>
              <Setting path="engine.priorities.audio"><Field label={tr('settings.engine.priorityAudio')}><NumberInput value={s.engine.priorities.audio} min={1} max={99} onChange={(v) => set('engine', { priorities: { ...s.engine.priorities, audio: v } })} /></Field></Setting>
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
          </Panel>
        )}
        {tab === 'ai' && (
          <Panel title={tr('settings.tab.ai')}>
            <div className="grid g2">
              <Setting path="ai.provider"><Field label={tr('settings.ai.provider')}>
                <select className="select" value={s.ai.provider} data-testid="ai-provider" onChange={(e) => set('ai', { provider: e.target.value as Settings['ai']['provider'] })}>
                  <option value="local">{tr('settings.ai.provider.local')}</option>
                  <option value="openrouter">{tr('settings.ai.provider.openrouter')}</option>
                </select>
              </Field></Setting>
              <Setting path="ai.timeoutSec"><Field label={tr('settings.ai.timeout')}><NumberInput value={s.ai.timeoutSec} min={5} max={300} onChange={(v) => set('ai', { timeoutSec: v })} /></Field></Setting>
              <Setting path="ai.fallbackToLocal"><label className="check"><input type="checkbox" checked={s.ai.fallbackToLocal} onChange={(e) => set('ai', { fallbackToLocal: e.target.checked })} />{tr('settings.ai.fallback')}</label></Setting>
              <Setting path="ai.monthlyBudget"><Field label={tr('settings.ai.budget')} hint={tr('settings.ai.budgetHint')}><NumberInput value={s.ai.monthlyBudget ?? 0} min={0} max={10000} onChange={(v) => set('ai', { monthlyBudget: v > 0 ? v : null })} /></Field></Setting>
              <Setting path="ai.autoSuggestIntents"><label className="check" title={tr('settings.ai.autoSuggestHint')}><input type="checkbox" checked={s.ai.autoSuggestIntents} onChange={(e) => set('ai', { autoSuggestIntents: e.target.checked })} />{tr('settings.ai.autoSuggest')}</label></Setting>
            </div>
            {s.ai.provider === 'openrouter' && (
              <div className="col" style={{ marginTop: 14 }}>
                <Setting path="ai.model"><ModelPicker value={s.ai.model} onChange={(model) => set('ai', { model })} /></Setting>
                <Setting path="ai.effort"><Field label={tr('settings.ai.effort')} hint={tr('settings.ai.effortHint')}>
                  <select className="select" style={{ maxWidth: 260 }} value={s.ai.effort} onChange={(e) => set('ai', { effort: e.target.value as Settings['ai']['effort'] })}>
                    <option value="low">{tr('settings.ai.effort.low')}</option><option value="medium">{tr('settings.ai.effort.medium')}</option><option value="high">{tr('settings.ai.effort.high')}</option>
                  </select>
                </Field></Setting>
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
            <Field label={tr('settings.ai.voiceKey')} hint={tr('settings.ai.voiceKeyHint')}>
              <div className="row">
                <input className="input mono" type="password" autoComplete="off" placeholder={rt?.ai.hasVoiceKey ? tr('settings.ai.keySaved') : 'AIza…'} value={voiceKey} onChange={(e) => setVoiceKey(e.target.value)} />
                <button className="btn primary" disabled={voiceKey.trim().length < 10} onClick={() => void act({ type: 'ai.voiceKey', key: voiceKey.trim() }).then((r) => r && setVoiceKey(''))}><KeyRound size={13} />{tr('common.save')}</button>
                <button className="btn danger" disabled={!rt?.ai.hasVoiceKey} onClick={() => void act({ type: 'ai.voiceKey', key: null })}>{tr('common.delete')}</button>
              </div>
            </Field>
          </Panel>
        )}
        {tab === 'assistant' && <AssistantPanel value={s.assistant} onChange={(v) => set('assistant', v)} />}
        {tab === 'audio' && (
          <Panel title={tr('settings.tab.audio')}>
            <p className="muted" style={{ margin: 0 }}>{tr('settings.audio.before')}<button className="btn sm" onClick={() => useStore.getState().setPage('audio')}>{tr('nav.audio')}</button>{tr('settings.audio.after')}</p>
          </Panel>
        )}
        {tab === 'audio' && (
          <Panel title={tr('settings.audio.advanced')}>
            <div className="grid g2" style={{ alignItems: 'start' }}>
              <Setting path="audio.latencyMs"><Field label={tr('settings.audio.latency')} hint={tr('settings.audio.latencyHint')}><NumberInput value={s.audio.latencyMs} min={0} max={250} onChange={(v) => set('audio', { latencyMs: Math.round(v) })} /></Field></Setting>
              <Setting path="ai.phraseBars"><Field label={tr('settings.audio.phraseBars')} hint={tr('music.phraseBars.hint')}><NumberInput value={s.ai.phraseBars} min={2} max={32} onChange={(v) => set('ai', { phraseBars: Math.round(v) })} /></Field></Setting>
            </div>
          </Panel>
        )}
        {tab === 'safety' && <SafetyPanel s={s} onChange={setS} />}
        {tab === 'shortcuts' && (
          <Panel title={tr('settings.shortcuts.title')} flush>
            <ShortcutEditor value={s.shortcuts} onChange={(shortcuts) => setS({ ...s, shortcuts })} />
          </Panel>
        )}
        {tab === 'control' && <ControlTab value={s.control} onChange={(control) => setS({ ...s, control })} />}
        {tab === 'logs' && (
          <Panel title={tr('settings.logs.title')}>
            <div className="grid g2">
              <Setting path="logs.level"><Field label={tr('settings.logs.level')}>
                <select className="select" value={s.logs.level} onChange={(e) => set('logs', { level: e.target.value as Settings['logs']['level'] })}>
                  <option value="debug">{tr('settings.logs.level.debug')}</option><option value="info">{tr('settings.logs.level.info')}</option><option value="warn">{tr('settings.logs.level.warn')}</option><option value="error">{tr('settings.logs.level.error')}</option>
                </select>
              </Field></Setting>
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
      )}
      </SettingsDraft.Provider>
          <div className={`settings-bar ${dirty ? 'dirty' : ''}`}>
            <span className="settings-bar-state" role="status">
              {dirty ? <span className="settings-bar-dot" /> : <Check size={14} />}
              {tr(dirty ? 'settings.bar.dirty' : 'settings.bar.clean')}
            </span>
            <span className="grow" />
            <button className="btn" disabled={!dirty} onClick={() => setS(saved)}>{tr('settings.discard')}</button>
            {dirty && activeProfile && (
              <button className="btn settings-bar-profile" onClick={saveToActiveProfile} data-testid="settings-save-profile" title={tr('settings.bar.saveProfileHint')}>
                <LayoutTemplate size={13} />{tr('settings.bar.saveProfile', { name: activeProfile.name })}
              </button>
            )}
            <button className="btn primary" disabled={!dirty} onClick={() => void save()} data-testid="settings-save">{tr('common.save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
