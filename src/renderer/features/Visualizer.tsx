import { useEffect, useState } from 'react';
import { Crosshair, ExternalLink, Move, Settings2, Theater, X } from 'lucide-react';
import { useStore } from '../store';
import { PageHead, useResolved } from '../components/ui';
import { Stage3D } from './Stage3D';
import { useSceneShortcuts } from '../sceneActions';
import { ScenePanel, SceneHistory } from './visualizer/ScenePanel';
import { StageCanvas } from './visualizer/StageCanvas';

export const Visualizer = () => <StagePage mode="2d" />;

export const StageVisualizer3D = () => <StagePage mode="3d" />;

export const DETACHED_STAGE_HASH = '#stage3d';

/** Chrome-less live 3D view for a second screen, opened by the "Détacher" button. F11 : plein écran. */
export function DetachedStage3D() {
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
  return <div style={{ height: '100vh' }}>{ready ? <Stage3D /> : <div className="empty">Connexion au moteur…</div>}</div>;
}

function StagePage({ mode }: { mode: '2d' | '3d' }) {
  const { fixtures } = useResolved();
  const project = useStore((s) => s.project!.project);
  const preview = useStore((s) => s.preview);
  const setPreview = useStore((s) => s.setPreview);
  const [edit, setEdit] = useState(false);
  const panel = useStore((s) => s.scenePanel);
  const setPanel = useStore((s) => s.setScenePanel);
  const [group, setGroup] = useState<string | null>(null);
  const placing = useStore((s) => s.placing);
  useSceneShortcuts();
  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
      <PageHead title={mode === '3d' ? 'Stage 3D' : 'Stage Visualizer'} subtitle={mode === '3d' ? 'Aperçu 3D approximatif de la scène et des faisceaux' : 'Plan de dessus synchronisé avec le moteur'}>
        <button className={`btn ${panel === 'build' ? 'on' : ''}`} onClick={() => setPanel(panel === 'build' ? null : 'build')} title="Construire la scène : modèles, plateau, points de scène, structures, interprètes et écrans" data-testid="stage-settings-toggle"><Settings2 size={14} />Scène</button>
        {mode === '2d' && <button className={`btn ${edit ? 'on' : ''}`} onClick={() => setEdit(!edit)} title="Déplacer projecteurs, points et interprètes sur la scène (enregistré dans le projet)"><Move size={14} />Positionner</button>}
        <SceneHistory />
        <select className="select" style={{ width: 160 }} value={group ?? ''} onChange={(e) => setGroup(e.target.value || null)} aria-label="Filtrer par groupe">
          <option value="">Tous les groupes</option>
          {project.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        {mode === '3d' && <button className="btn" data-testid="stage3d-detach" onClick={() => window.open(location.href.split('#')[0] + DETACHED_STAGE_HASH, 'luma-stage3d')} title="Ouvrir la vue 3D dans une fenêtre séparée (second écran, F11 : plein écran)"><ExternalLink size={14} />Détacher</button>}
      </PageHead>
      {preview && (
        <div className="panel row" style={{ padding: '8px 12px', marginBottom: 10, borderColor: 'rgba(139,92,246,.6)' }}>
          <span className="badge violet">APERÇU</span>
          <span className="grow">{preview.label.startsWith('Prévisualisation') ? preview.label : 'Prévisualisation d’une proposition IA'} — non envoyé aux sorties</span>
          <button className="btn sm" onClick={() => setPreview(null)}><X size={12} />Revenir au direct</button>
        </div>
      )}
      <div className="stage-layout">
        {panel && <ScenePanel vis={project.visualizer} mode={mode} />}
        <div className="stage-view">
          {mode === '3d' ? <Stage3D values={preview?.values} groupFilter={group} /> : <StageCanvas values={preview?.values} editable={edit} groupFilter={group} />}
          {placing && (
            <div className="stage-empty stage-placing" data-testid="placing">
              <Crosshair size={16} />
              <span className="grow">Cliquez sur le plateau pour poser : <b>{placing.label}</b></span>
              <button className="btn sm" onClick={() => useStore.getState().setPlacing(null)}>Annuler (Échap)</button>
            </div>
          )}
          {fixtures.length === 0 && !placing && (
            <div className="stage-empty">
              <Theater size={18} className="dim" />
              <span className="grow">Aucun projecteur : ajoutez-en dans le Patch. Vous pouvez déjà construire le décor.</span>
              {panel !== 'build' && <button className="btn sm" onClick={() => setPanel('build')}><Settings2 size={12} />Construire la scène</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
