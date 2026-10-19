import { useEffect, useState } from 'react';
import { Crosshair, ExternalLink, MousePointer2, Move, Settings2, Theater, X } from 'lucide-react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { PageHead, useResolved } from '../components/ui';
import { Stage3D } from './Stage3D';
import { useSceneShortcuts } from '../sceneActions';
import { ScenePanel, SceneHistory } from './visualizer/ScenePanel';
import { StageCanvas } from './visualizer/StageCanvas';

export const Visualizer = () => <StagePage mode="2d" />;

export const StageVisualizer3D = () => <StagePage mode="3d" />;

export const DETACHED_STAGE_HASH = '#stage3d';

export const openDetachedStage = () => window.open(location.href.split('#')[0] + DETACHED_STAGE_HASH, 'luma-stage3d');

/** Chrome-less live 3D view for a second screen, opened by the "Détacher" button. F11 : plein écran. */
export function DetachedStage3D() {
  const tr = useT();
  const ready = useStore((s) => !!s.project);
  useEffect(() => {
    document.title = 'Stage 3D';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F11') return;
      e.preventDefault();
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return <div style={{ height: '100vh' }}>{ready ? <Stage3D /> : <div className="empty">{tr('stagePage.connecting')}</div>}</div>;
}

function StagePage({ mode }: { mode: '2d' | '3d' }) {
  const tr = useT();
  const { fixtures } = useResolved();
  const selCount = useStore((s) => (s.sceneSel ? 1 : s.selection.length));
  const project = useStore((s) => s.project!.project);
  const preview = useStore((s) => s.preview);
  const setPreview = useStore((s) => s.setPreview);
  const [edit, setEdit] = useState(false);
  const panel = useStore((s) => s.scenePanel);
  const setPanel = useStore((s) => s.setScenePanel);
  const [group, setGroup] = useState<string | null>(null);
  const placing = useStore((s) => s.placing);
  const drawing = useStore((s) => s.drawing);
  useSceneShortcuts();
  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
      <PageHead title={tr(mode === '3d' ? 'stagePage.title3d' : 'stagePage.title2d')} subtitle={tr(mode === '3d' ? 'stagePage.sub3d' : 'stagePage.sub2d')}>
        <button className={`btn ${panel === 'build' ? 'on' : ''}`} onClick={() => setPanel(panel === 'build' ? null : 'build')} title={tr('stagePage.sceneHint')} data-testid="stage-settings-toggle"><Settings2 size={14} />{tr('stagePage.scene')}</button>
        {mode === '2d' && <button className={`btn ${edit ? 'on' : ''}`} onClick={() => setEdit(!edit)} title={tr('stagePage.positionHint')}><Move size={14} />{tr('stagePage.position')}</button>}
        <SceneHistory />
        <select className="select" style={{ width: 160 }} value={group ?? ''} onChange={(e) => setGroup(e.target.value || null)} aria-label={tr('stagePage.groupFilter')}>
          <option value="">{tr('stagePage.allGroups')}</option>
          {project.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        {mode === '3d' && <button className="btn" data-testid="stage3d-detach" onClick={openDetachedStage} title={tr('stagePage.detachHint')}><ExternalLink size={14} />{tr('stagePage.detach')}</button>}
      </PageHead>
      {preview && (
        <div className="panel row" style={{ padding: '8px 12px', marginBottom: 10, borderColor: 'rgba(139,92,246,.6)' }}>
          <span className="badge violet">{tr('stagePage.preview')}</span>
          <span className="grow">{tr('stagePage.notSent', { label: preview.title ?? tr('stagePage.previewAi') })}</span>
          <button className="btn sm" onClick={() => setPreview(null)}><X size={12} />{tr('stagePage.backLive')}</button>
        </div>
      )}
      <div className="stage-layout">
        {panel ? <ScenePanel vis={project.visualizer} mode={mode} /> : (
          <nav className="scene-rail" aria-label={tr('stagePanel.rail')}>
            <button className="btn ghost sm icon" title={tr('stagePanel.build')} aria-label={tr('stagePanel.build')} onClick={() => setPanel('build')}><Settings2 size={15} /></button>
            <button className="btn ghost sm icon" title={tr('stagePanel.selection')} aria-label={tr('stagePanel.selection')} onClick={() => setPanel('selection')}>
              <MousePointer2 size={15} />{selCount > 0 && <span className="rail-count">{selCount}</span>}
            </button>
          </nav>
        )}
        <div className="stage-view">
          {mode === '3d' ? <Stage3D values={preview?.values} groupFilter={group} /> : <StageCanvas values={preview?.values} editable={edit} groupFilter={group} />}
          {drawing && mode !== '3d' && (
            <div className="stage-empty stage-placing" data-testid="drawing">
              <span className="grow">{tr('scene.drawHint')}</span>
              <button className="btn sm" onClick={() => useStore.getState().setDrawing(false)}>{tr('scene.drawCancel')}</button>
            </div>
          )}
          {placing && (
            <div className="stage-empty stage-placing" data-testid="placing">
              <Crosshair size={16} />
              <span className="grow">{tr('stagePage.placeOn')} <b>{placing.label}</b></span>
              <button className="btn sm" onClick={() => useStore.getState().setPlacing(null)}>{tr('stagePage.placeCancel')}</button>
            </div>
          )}
          {fixtures.length === 0 && !placing && (
            <div className="stage-empty">
              <Theater size={18} className="dim" />
              <span className="grow">{tr('stagePage.noFixtures')}</span>
              {panel !== 'build' && <button className="btn sm" onClick={() => setPanel('build')}><Settings2 size={12} />{tr('stagePage.build')}</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
