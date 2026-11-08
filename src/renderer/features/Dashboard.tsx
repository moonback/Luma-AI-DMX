import { Bot, Cable, FilePlus, Lightbulb, Palette, SlidersHorizontal, AlertTriangle, Wand2, CheckCircle2, CircleAlert, CircleDashed, ShieldAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { describeScene } from '../sceneActions';
import { TEXT_SCENE_EXAMPLES } from '../../core/visualizer/sceneFromText';
import { useStore } from '../store';
import { newProjectFlow } from '../App';
import { PageHead, Panel, useResolved } from '../components/ui';
import { classifyEngineHealth, evaluateDashboardReadiness, summarizeReadiness, type ReadinessCheck, type ReadinessLevel } from './dashboardReadiness';
import { FirstSteps } from './Onboarding';
import type { EngineMetrics } from '../../core/engine/Engine';
import type { OutputStatus } from '../../core/protocols/config';

type Src = 'persisted' | 'measured' | 'computed' | 'simulated' | 'config' | 'estimate';

function Kpi({ label, value, sub, src, icon, onClick }: { label: string; value: ReactNode; sub?: ReactNode; src: Src; icon?: ReactNode; onClick?: () => void }) {
  const tr = useT();
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`panel kpi${onClick ? ' clickable' : ''}`} {...(onClick && { type: 'button' as const, onClick })}>
      <span className="k">{icon}{label}<span className="grow" /><span className="tag-src" title={tr('dash.src.title')}>{tr(`dash.src.${src}`)}</span></span>
      <span className="v">{value}</span>
      {sub && <span className="s">{sub}</span>}
    </Tag>
  );
}


const READINESS_ICONS: Record<ReadinessLevel, typeof CheckCircle2> = {
  ready: CheckCircle2,
  warning: CircleAlert,
  blocked: ShieldAlert,
  unknown: CircleDashed,
};

function ReadinessChecklist({ checks }: { checks: ReadinessCheck[] }) {
  const tr = useT();
  const ready = checks.filter((check) => check.level === 'ready').length;
  const level = summarizeReadiness(checks);
  const summaryClass = level === 'blocked' ? 'err' : level === 'warning' ? 'warn' : '';
  return (
    <Panel title={tr('dash.readiness.title')} actions={
      <div className="row" style={{ gap: 8 }}>
        <span className={`badge ${summaryClass}`} data-testid="readiness-status">{tr(`dash.readiness.state.${level}`)}</span>
        <span className="small muted mono">{tr('dash.readiness.progress', { ready, total: checks.length })}</span>
      </div>
    }>
      <div className="readiness-list" data-testid="readiness-checklist" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
        {checks.map((check) => {
          const Icon = READINESS_ICONS[check.level];
          const detailVars = check.count === undefined ? undefined : { n: check.count };
          return (
            <div key={check.id} className={`readiness-item readiness-${check.level}`} data-testid={`readiness-${check.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--panel-2)' }}>
              <Icon size={16} aria-hidden="true" color={check.level === 'ready' ? '#22c55e' : check.level === 'warning' ? '#f59e0b' : check.level === 'blocked' ? '#ef4444' : '#94a3b8'} />
              <div className="readiness-copy" style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                <strong>{tr(`dash.readiness.${check.id}`)}</strong>
                <span className="small muted">{tr(`dash.readiness.${check.id}.${check.level}`, detailVars)}</span>
              </div>
              {check.page && <button type="button" className="btn ghost sm" onClick={() => useStore.getState().setPage(check.page!)}>{tr('dash.readiness.open')}</button>}
            </div>
          );
        })}
      </div>
      <p className="small muted" style={{ margin: '10px 0 0' }}>{tr('dash.readiness.disclaimer')}</p>
    </Panel>
  );
}


function EngineHealthPanel({ metrics, outputs }: { metrics: EngineMetrics | null; outputs: readonly OutputStatus[] }) {
  const tr = useT();
  const measuredMetrics = metrics && metrics.ticks > 0 ? metrics : null;
  const measured = measuredMetrics !== null;
  const load = measuredMetrics ? Math.max(0, Math.min(1, measuredMetrics.load)) : 0;
  const loadLevel = classifyEngineHealth(metrics);
  const enabled = outputs.filter((output) => output.enabled);
  const kindLabel = (kind: string) => ({ virtual: tr('dash.proto.virtual'), artnet: 'Art-Net', sacn: 'sACN', 'enttec-pro': 'USB-DMX', 'open-dmx': 'Open DMX' })[kind] ?? kind;
  const stateLabel = (state: string) => tr(`dash.health.outputState.${state}`);
  const format = (value: number, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '—';

  return (
    <Panel title={tr('dash.health.title')} actions={<span className={`badge ${loadLevel === 'blocked' ? 'err' : loadLevel === 'warning' ? 'warn' : ''}`}>{tr(`dash.health.state.${loadLevel}`)}</span>}>
      <div className="grid g4">
        <div className="panel kpi">
          <span className="k">{tr('dash.health.rate')}</span>
          <span className="v">{measured ? format(measuredMetrics!.measuredHz) : '—'} <small className="muted">Hz</small></span>
          <span className="s">{tr('dash.health.target', { n: metrics?.rateHz ?? 0 })}</span>
        </div>
        <div className="panel kpi">
          <span className="k">{tr('dash.health.load')}</span>
          <span className="v">{measured ? `${Math.round(load * 100)} %` : '—'}</span>
          <div role="meter" aria-label={tr('dash.health.load')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={measured ? Math.round(load * 100) : 0} aria-valuetext={measured ? `${Math.round(load * 100)} %` : tr('dash.health.waiting')} style={{ height: 5, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${Math.round(load * 100)}%`, height: '100%', background: load >= 0.85 ? '#ef4444' : load >= 0.65 ? '#f59e0b' : '#22c55e', transition: 'width 180ms ease' }} />
          </div>
        </div>
        <div className="panel kpi">
          <span className="k">{tr('dash.health.jitterP95')}</span>
          <span className="v">{measured ? (metrics?.jitterP95Ms === null || metrics?.jitterP95Ms === undefined ? '—' : format(metrics.jitterP95Ms, 2)) : '—'} <small className="muted">ms</small></span>
          <span className="s">{tr('dash.health.jitterDetail', { p50: metrics?.jitterP50Ms == null ? '—' : format(metrics.jitterP50Ms, 2), p99: metrics?.jitterP99Ms == null ? '—' : format(metrics.jitterP99Ms, 2), samples: metrics?.jitterSamples ?? 0 })}</span>
        </div>
        <div className="panel kpi">
          <span className="k">{tr('dash.health.maxTick')}</span>
          <span className="v">{measured ? format(measuredMetrics!.maxTickMs, 2) : '—'} <small className="muted">ms</small></span>
          <span className="s">{tr('dash.health.overruns', { n: measuredMetrics?.overruns ?? 0 })} · {tr('dash.health.errors', { n: measuredMetrics?.errors ?? 0 })}</span>
        </div>
      </div>
      <div className="col" style={{ gap: 6, marginTop: 12 }}>
        <div className="row"><strong className="small">{tr('dash.health.outputs')}</strong><span className="grow" /><span className="small muted">{tr('dash.health.enabled', { n: enabled.length })}</span></div>
        {outputs.length === 0 ? <p className="small muted">{tr('dash.health.noOutputs')}</p> : outputs.map((output) => (
          <div key={output.id} className="row small" style={{ gap: 10, padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
            <span className={`badge ${output.state === 'error' ? 'err' : output.state === 'ready' && output.enabled ? '' : 'warn'}`}>{stateLabel(output.state)}</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{output.name}</span>
            <span className="grow" />
            <span className="muted">{kindLabel(output.kind)}</span>
            <span className="mono">{format(output.stats.measuredFps, 0)} FPS</span>
            <span className={output.stats.errors > 0 ? 'err' : 'muted'}>{tr('dash.health.outputErrors', { n: output.stats.errors })}</span>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ margin: '10px 0 0' }}>{tr('dash.health.disclaimer')}</p>
    </Panel>
  );
}

/** Home card: describe the stage in words (structures, fixtures, set) and build it in one go. */
function SceneFromText() {
  const tr = useT();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const build = async () => {
    setBusy(true);
    try { if (await describeScene(text)) setText(''); } finally { setBusy(false); }
  };
  return (
    <Panel title={tr('textScene.title')}>
      <div className="col" style={{ gap: 8 }}>
        <div className="chips" role="group" aria-label={tr('textScene.examples')}>
          <span className="small muted">{tr('textScene.examples')}</span>
          {TEXT_SCENE_EXAMPLES.map((ex, i) => (
            <button key={ex.label} className={`chip ${text === ex.text ? 'on' : ''}`} onClick={() => setText(ex.text)} title={ex.text} data-testid={`text-scene-ex-${i}`}>{ex.label}</button>
          ))}
        </div>
        <textarea className="input" rows={3} value={text} placeholder={tr('textScene.example')} aria-label={tr('textScene.title')} data-testid="text-scene"
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) void build(); }} style={{ resize: 'vertical', minHeight: 64, padding: 8 }} />
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary" disabled={!text.trim() || busy} onClick={() => void build()} data-testid="text-scene-build"><Wand2 size={14} />{tr('textScene.build')}</button>
          <span className="small muted grow">{tr('textScene.hint')}</span>
        </div>
      </div>
    </Panel>
  );
}

export function Dashboard() {
  const tr = useT();
  const ps = useStore((s) => s.project)!;
  const rt = useStore((s) => s.runtime);
  const setPage = useStore((s) => s.setPage);
  const visibility = useStore((s) => s.componentVisibility);
  const resolved = useResolved();
  const p = ps.project;
  const outputs = rt?.outputs ?? [];
  const real = outputs.filter((o) => o.real);
  const protocols = [...new Set(outputs.filter((o) => o.enabled).map((o) => ({ virtual: tr('dash.proto.virtual'), artnet: 'Art-Net', sacn: 'sACN', 'enttec-pro': 'USB-DMX', 'open-dmx': 'Open DMX' })[o.kind]))];
  const active = rt?.engine.playbacks.filter((pb) => pb.state !== 'idle') ?? [];
  const universesUsed = new Set(p.patch.map((f) => f.universe)).size;
  const m = rt?.engine.metrics;
  const audio = rt?.audio;
  const readiness = evaluateDashboardReadiness({
    patchCount: p.patch.length,
    patchIssueCount: ps.issues.length,
    resolvedFixtureCount: resolved.fixtures.length,
    outputs: rt ? rt.outputs : null,
    projectPath: ps.path,
    projectDirty: ps.dirty,
    flashGuardViolation: rt ? rt.safety.violation : null,
  });

  return (
    <div className="page">
      <PageHead title={tr('nav.dashboard')} subtitle={`${p.meta.name}${p.meta.show ? ` — ${p.meta.show}` : ''}`} />
      {/* Mandatory operational checklist: independent from optional dashboard card visibility. */}
      <ReadinessChecklist checks={readiness} />
      <EngineHealthPanel metrics={rt?.engine.metrics ?? null} outputs={rt?.outputs ?? []} />
      {visibility.dashboard.firstSteps && <FirstSteps />}
      <div className="grid g2 kpi-groups">
        {visibility.dashboard.hardware && <section className="kpi-group wide" aria-labelledby="kpi-grp-hw">
          <h2 id="kpi-grp-hw">{tr('dash.grp.hardware')}</h2>
          <div className="grid g4">
            <Kpi label={tr('dash.fixtures')} src="persisted" value={p.patch.length} sub={tr('dash.fixturesSub', { groups: p.groups.length, issues: ps.issues.length ? tr('dash.patchIssues', { n: ps.issues.length }) : tr('dash.patchOk') })} icon={<Lightbulb size={13} />} onClick={() => setPage('fixtures')} />
            <Kpi label={tr('dash.universes')} src="persisted" value={p.show.universes} sub={tr('dash.universesSub', { n: universesUsed })} />
            <Kpi label={tr('dash.output')} src="measured" value={rt?.liveMode ? 'LIVE' : tr('dash.simulation')} sub={real.length ? tr('dash.armed', { armed: real.filter((o) => o.armed).length, total: real.length }) : tr('dash.noReal')} icon={<Cable size={13} />} />
            <Kpi label={tr('dash.protocols')} src="config" value={protocols.length ? protocols.join(' · ') : '—'} sub={tr('dash.inError', { n: outputs.filter((o) => o.state === 'error').length })} onClick={() => setPage('output')} />
          </div>
        </section>}
        {visibility.dashboard.show && <section className="kpi-group" aria-labelledby="kpi-grp-show">
          <h2 id="kpi-grp-show">{tr('dash.grp.show')}</h2>
          <div className="grid g2">
            <Kpi label={tr('dash.activeCue')} src="computed" value={active[0]?.cueName ?? '—'} sub={active.length ? `${p.cueLists.find((l) => l.id === active[0]!.cueListId)?.name ?? ''} · ${Math.round(active[0]!.progress * 100)} %` : tr('dash.cuesProgrammed', { n: p.cueLists.reduce((n, l) => n + l.cues.length, 0) })} onClick={() => setPage('cues')} />
            <Kpi label="BPM" src={rt?.engine.bpmSource === 'audio' ? 'estimate' : 'persisted'} value={rt?.engine.bpm.toFixed(0) ?? '–'} sub={rt?.engine.bpmSource === 'audio' ? tr('dash.bpmAudio', { n: Math.round((audio?.bpmConfidence ?? 0) * 100) }) : tr('dash.bpmManual')} />
          </div>
        </section>}
        {visibility.dashboard.system && <section className="kpi-group" aria-labelledby="kpi-grp-sys">
          <h2 id="kpi-grp-sys">{tr('dash.grp.system')}</h2>
          <div className="grid g2">
            <Kpi label={tr('dash.load')} src="measured" value={m ? `${(m.load * 100).toFixed(1)} %` : '–'} sub={m ? tr('dash.loadSub', { hz: m.measuredHz, ms: m.avgTickMs, n: m.overruns }) : ''} />
            <Kpi label={tr('dash.ai')} src="config" value={rt?.ai.provider === 'openrouter' ? (rt.ai.hasKey ? 'OpenRouter' : tr('dash.aiNoKey')) : tr('dash.aiLocal')} sub={rt?.ai.lastError ? tr('dash.aiLastError', { msg: rt.ai.lastError }) : rt?.ai.provider === 'local' ? tr('dash.aiLocalSub') : rt?.ai.model} icon={<Bot size={13} />} />
          </div>
        </section>}
      </div>
      {visibility.dashboard.sceneFromText && <SceneFromText />}
      <div className="grid g2">
        {visibility.dashboard.quickActions && <Panel title={tr('dash.quick')}>
          <div className="grid g3">
            <button className="btn lg" onClick={() => newProjectFlow()}><FilePlus size={16} />{tr('dash.qNew')}</button>
            <button className="btn lg" onClick={() => setPage('fixtures')}><Lightbulb size={16} />{tr('dash.qFixtures')}</button>
            <button className="btn lg" onClick={() => setPage('output')}><Cable size={16} />{tr('dash.qOutput')}</button>
            <button className="btn lg" onClick={() => setPage('programmer')}><Palette size={16} />{tr('dash.qScene')}</button>
            <button className="btn lg primary" onClick={() => setPage('ai')}><Bot size={16} />{tr('dash.qAi')}</button>
            <button className="btn lg" onClick={() => setPage('console')}><SlidersHorizontal size={16} />{tr('dash.qConsole')}</button>
          </div>
          {audio?.active && <p className="small muted" style={{ marginBottom: 0 }}>{tr(audio.source === 'simulated' ? 'dash.audioSim' : 'dash.audioReal')}</p>}
        </Panel>}
        {visibility.dashboard.alerts && <Panel title={tr('dash.alerts')} actions={<button className="btn ghost sm" onClick={() => useStore.getState().toggleDiag()}>{tr('dash.seeAll')}</button>}>
          {rt?.alerts.length ? (
            <div className="col" style={{ gap: 6, maxHeight: 240, overflow: 'auto' }}>
              {[...rt.alerts].reverse().slice(0, 12).map((a) => (
                <div key={a.id} className="row small" style={{ alignItems: 'flex-start' }}>
                  <AlertTriangle size={13} color={a.level === 'error' ? '#ef4444' : '#f59e0b'} style={{ flex: 'none', marginTop: 2 }} />
                  <span className="dim mono">{a.t.slice(11, 19)}</span>
                  <span>{a.message}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>{tr('dash.noAlerts')}</p>
          )}
          {ps.issues.length > 0 && (
            <div className="col small" style={{ marginTop: 10 }}>
              {ps.issues.slice(0, 5).map((i, k) => <span key={k} className="badge err" style={{ height: 'auto', padding: '3px 8px', whiteSpace: 'normal' }}>{i.message}</span>)}
            </div>
          )}
        </Panel>}
      </div>
    </div>
  );
}
