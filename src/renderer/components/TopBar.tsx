import { useEffect, useRef, useState } from 'react';
import {
  Bell, ChevronDown, ClipboardList, FilePlus, FolderOpen, Mic,
  Moon, OctagonX, Play, Redo2, Save, Undo2,
} from 'lucide-react';
import { BRAND } from '../../shared/brand';
import logo from '../../../public/logo.png';
import { useStore } from '../store';
import { act } from '../api';
import { Modal, Field } from './ui';
import { LicenseBadge } from '../features/LicenseBadge';
import { HelpButton } from '../features/Onboarding';
import { t, useT } from '../i18n';
import { startVoice, type VoiceState } from '../voice/session';
import {
  guardUnsaved,
  openProject,
  historyStep,
  releaseAllFlow,
  detachStageIfWanted,
} from '../projectActions';

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const [name, setName] = useState(() => t('project.defaultName'));
  const create = async () => {
    if (!(await guardUnsaved())) return;
    if (!(await act({ type: 'project.new', name: name.trim() || t('project.defaultName') }))) return;
    detachStageIfWanted();
    onClose();
  };
  return (
    <Modal title={tr('project.new')} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{tr('common.cancel')}</button><button className="btn primary" onClick={() => void create()}>{tr('common.create')}</button></>}>
      <Field label={tr('project.name')}><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} /></Field>
    </Modal>
  );
}

/** Dropdown menu for project actions (New / Open / Save / Undo / Redo). */
export function ProjectMenu({ onNew }: { onNew: () => void }) {
  const tr = useT();
  const project = useStore((s) => s.project);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const dirty = project?.dirty ?? false;

  return (
    <div className="proj-menu-wrap" ref={ref}>
      <button
        className="proj-menu-btn btn ghost"
        onClick={() => setOpen((v) => !v)}
        title={project?.project.meta.name ?? '…'}
      >
        <span className="proj-menu-name">
          <b>{project?.project.meta.name ?? '…'}{dirty ? ' •' : ''}</b>
        </span>
        <ChevronDown size={13} className={`proj-menu-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="proj-menu-dropdown">
          <button className="proj-menu-item" onClick={() => { setOpen(false); onNew(); }}>
            <FilePlus size={14} />{tr('project.newShortcut')}
          </button>
          <button className="proj-menu-item" onClick={() => { setOpen(false); void openProject(); }}>
            <FolderOpen size={14} />{tr('project.openShortcut')}
          </button>
          <div className="proj-menu-sep" />
          <button className="proj-menu-item" data-testid="save" onClick={() => { setOpen(false); void act({ type: 'project.save' }); }}>
            <Save size={14} />{tr('project.saveShortcut')}
          </button>
          <div className="proj-menu-sep" />
          <button
            className="proj-menu-item"
            data-testid="undo"
            disabled={!project?.history?.undo}
            onClick={() => { setOpen(false); void historyStep('undo'); }}
          >
            <Undo2 size={14} />{project?.history?.undoLabel ? tr('history.undoTitle', { label: project.history.undoLabel }) : tr('history.nothing')}
          </button>
          <button
            className="proj-menu-item"
            data-testid="redo"
            disabled={!project?.history?.redo}
            onClick={() => { setOpen(false); void historyStep('redo'); }}
          >
            <Redo2 size={14} />{project?.history?.redoLabel ? tr('history.redoTitle', { label: project.history.redoLabel }) : tr('history.nothing')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Compact status pills — LED dot + short label, full detail in title tooltip. */
export function StatusPills() {
  const tr = useT();
  const rt = useStore((s) => s.runtime);
  const taps = useRef<number[]>([]);
  const outputs = rt?.outputs ?? [];
  const errors = outputs.filter((o) => o.state === 'error').length;
  const ready = outputs.filter((o) => o.state === 'ready').length;
  const transmitting = rt?.transmitting ?? true;

  const tap = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now];
    if (taps.current.length >= 3) {
      const iv = taps.current.slice(1).map((t, i) => t - taps.current[i]!);
      const bpm = Math.round(60000 / (iv.reduce((a, b) => a + b, 0) / iv.length));
      if (bpm >= 20 && bpm <= 300) void act({ type: 'engine.bpm', bpm });
    }
  };

  return (
    <div className="status-pills">
      {/* Output */}
      <div
        className="status-pill"
        title={outputs.map((o) => `${o.name} : ${o.state}`).join('\n') || tr('top.output')}
      >
        <span className={`led ${errors ? 'err' : !transmitting ? 'warn' : ready ? 'ok' : ''}`} />
        <span className="status-pill-label">
          {errors ? `${errors} err` : !transmitting ? 'stopped' : `${ready} out`}
        </span>
      </div>
      {/* Engine */}
      <div
        className="status-pill"
        title={tr('top.engineTitle', { tick: rt?.engine.metrics.avgTickMs ?? 0, jitter: rt?.engine.metrics.jitterMs ?? 0 })}
      >
        <span className={`led ${rt?.engine.running ? 'ok' : 'err'}`} />
        <span className="status-pill-label">{rt ? `${rt.engine.metrics.measuredHz} Hz` : '–'}</span>
      </div>
      {/* BPM tap */}
      <button
        className="status-pill status-pill-btn"
        onClick={tap}
        title={tr('top.tapTitle')}
      >
        <span className="led ok" style={{ background: 'var(--cyan)' }} />
        <span className="status-pill-label">{rt ? `${rt.engine.bpm.toFixed(0)} bpm` : '–'}</span>
      </button>
      {/* AI */}
      <div className="status-pill" title={rt?.ai.lastError ?? tr('top.ai')}>
        <span className={`led ${rt?.ai.busy ? 'violet' : rt?.ai.lastError ? 'warn' : 'ok'}`} />
        <span className="status-pill-label">AI</span>
      </div>
    </div>
  );
}

/* ── Voice assistant button ───────────────────────────────────────────────── */
const VOICE_STATE_CLASSES: Record<VoiceState, string> = {
  connecting: 'accent',
  listening: 'accent solid',
  speaking:  'accent solid',
  working:   'accent solid',
};

const VOICE_STATE_ICONS: Record<VoiceState, typeof Mic> = {
  connecting: Mic,
  listening:  Mic,
  speaking:   Mic,
  working:    Mic,
};

export function VoiceButton() {
  const tr = useT();
  const rt = useStore((s) => s.runtime);
  const hasVoiceKey = rt?.ai.hasVoiceKey ?? false;
  const [state, setState] = useState<VoiceState | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const toggle = async () => {
    // If already active → stop
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
      setState(null);
      return;
    }
    try {
      const session = await startVoice(
        (s) => setState(s),
        () => { stopRef.current = null; setState(null); },
      );
      if (session) stopRef.current = session.stop;
    } catch (err) {
      console.error('[Voice] Failed to start:', err);
      useStore.getState().toast({ kind: 'error', title: tr('voice.micError') });
      setState(null);
    }
  };

  if (!hasVoiceKey) return null;

  const active = state !== null;
  const Icon = active ? VOICE_STATE_ICONS[state] : Mic;
  const btnClass = active ? `btn ${VOICE_STATE_CLASSES[state]} icon` : 'btn ghost icon';

  const label = active
    ? (state === 'connecting' ? tr('voice.connecting') : state === 'speaking' ? tr('voice.speaking') : state === 'working' ? tr('voice.working') : tr('voice.listening'))
    : tr('voice.start');

  return (
    <button
      className={`${btnClass} voice-btn`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={() => void toggle()}
      style={active && state === 'listening' ? { animation: 'voice-pulse 1.4s ease-in-out infinite' } : undefined}
    >
      {active ? <Icon size={16} /> : <Mic size={16} />}
      {active && <span className="voice-btn-label">{label}</span>}
    </button>
  );
}

export function TopBar() {
  const tr = useT();
  const rt = useStore((s) => s.runtime);
  const toggleDiag = useStore((s) => s.toggleDiag);
  const [showNew, setShowNew] = useState(false);
  const newOpen = useStore((s) => s.newProjectOpen);
  useEffect(() => {
    if (newOpen) {
      setShowNew(true);
      useStore.setState({ newProjectOpen: false });
    }
  }, [newOpen]);
  const live = rt?.liveMode ?? false;
  const transmitting = rt?.transmitting ?? true;
  const alerts = rt?.alerts.length ?? 0;
  const installPlanButton = useStore((s) => s.installPlanButton);

  return (
    <header className="topbar">
      {/* ── Left zone: logo + project dropdown ── */}
      <div className="top-left">
        <div className="brand"><img className="brand-logo" src={logo} alt={BRAND.productName} /></div>
        <ProjectMenu onNew={() => setShowNew(true)} />
        {installPlanButton && (
          <button className="btn ghost icon" data-testid="install-plan" title={tr('top.installPlanTitle')} onClick={() => void act({ type: 'patch.exportPlan' })}>
            <ClipboardList size={15} />
          </button>
        )}
      </div>

      {/* ── Centre: mode badge + compact status pills ── */}
      <div className="top-stats">
        <span className={`mode-badge ${live ? 'live' : ''}`} data-testid="mode" title={live ? tr('top.liveTitle') : tr('top.simulationTitle')}>
          {live ? 'LIVE' : 'SIM'}
        </span>
        <StatusPills />
      </div>

      {/* ── Right zone: alerts + critical actions ── */}
      <div className="top-right">
        <VoiceButton />
        <LicenseBadge />
        <HelpButton />
        <button className="btn ghost icon" title={tr('top.alerts', { n: alerts })} onClick={toggleDiag} style={{ position: 'relative' }}>
          <Bell size={16} />
          {alerts > 0 && <span className="badge err" style={{ position: 'absolute', top: -4, right: -8, height: 16, padding: '0 4px' }}>{alerts}</span>}
        </button>
        <button className="btn ghost icon" data-testid="release-all" title={tr('top.releaseAllTitle')} onClick={() => void releaseAllFlow()}>
          <Undo2 size={15} />
        </button>
        <button
          className={`btn icon ${rt?.engine.blackout ? 'danger solid' : 'ghost'}`}
          data-testid="blackout"
          title={tr('top.blackoutTitle')}
          onClick={() => void act({ type: 'engine.blackout', on: !rt?.engine.blackout })}
        >
          <Moon size={15} />
        </button>
        {transmitting ? (
          <button className="btn danger solid" data-testid="stop-output" title={tr('top.stopTitle')} onClick={() => void act({ type: 'output.transmit', on: false })}>
            <OctagonX size={16} />STOP
          </button>
        ) : (
          <button className="btn accent" title={tr('top.resumeTitle')} onClick={() => void act({ type: 'output.transmit', on: true })}>
            <Play size={15} />{tr('top.resume')}
          </button>
        )}
      </div>
      {showNew && <NewProjectDialog onClose={() => setShowNew(false)} />}
    </header>
  );
}
