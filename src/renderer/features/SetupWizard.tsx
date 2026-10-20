import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Crosshair, Lightbulb, Plus, Wand2 } from 'lucide-react';
import { useStore } from '../store';
import { Empty, PageHead, useResolved } from '../components/ui';
import { buildVisualModel } from '../../core/visualizer/model';
import type { Project } from '../../core/model/schemas';
import { equipRig } from '../sceneActions';
import { PropSettings, StageCanvas, StageShapeSettings, TemplatePicker, TrussSettings } from './Visualizer';
import { AddDialog } from './Fixtures';

type Vis = Project['visualizer'];
type StepId = 'structure' | 'decor' | 'patch';

const STEPS: { id: StepId; label: string; hint: string }[] = [
  { id: 'structure', label: 'Structure', hint: 'Dimensionnez le plateau, puis ajoutez les structures qui porteront vos projecteurs. Un modèle de départ peut servir de base.' },
  { id: 'decor', label: 'Décor', hint: 'Posez les éléments de décor sur le plateau et ajustez leur position, leur taille et leur couleur.' },
  { id: 'patch', label: 'Patch', hint: 'Ajoutez les projecteurs (profil, mode, univers, adresse automatique), puis accrochez-les aux structures.' },
];

/** Projector list of the patch step; adding and hanging reuse the Fixtures and scene actions. */
function PatchStep({ vis }: { vis: Vis }) {
  const { fixtures } = useResolved();
  const issues = useStore((s) => s.project!.issues);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <div className="row" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <button className="btn primary sm" data-testid="setup-add-fixture" onClick={() => setAdding(true)}><Plus size={12} />Ajouter des projecteurs</button>
        {vis.trusses.length > 0 && fixtures.length > 0 && (
          <button className="btn sm" data-testid="setup-equip" onClick={() => equipRig(buildVisualModel(fixtures, {}))}
            title="Répartir les projecteurs sur les structures : lyres en contre, projecteurs fixes en face (Ctrl+Z pour annuler)">
            <Wand2 size={12} />Accrocher aux structures
          </button>
        )}
      </div>
      {issues.map((i, k) => <div key={k} className="small" style={{ color: '#fca5a5', marginBottom: 4 }}>⚠ {i.message}</div>)}
      {fixtures.length === 0 ? (
        <Empty icon={<Lightbulb size={28} />} title="Aucun projecteur patché">Les profils inclus sont fictifs et servent aux essais.</Empty>
      ) : (
        <table className="table" data-testid="setup-patch-table">
          <thead><tr><th>Nom</th><th>Profil</th><th>Univ.</th><th>Adresses</th></tr></thead>
          <tbody>
            {fixtures.map((rf) => (
              <tr key={rf.fixture.id}>
                <td>{rf.fixture.name}</td>
                <td>{rf.profile.name}</td>
                <td className="mono">{rf.fixture.universe}</td>
                <td className="mono">{rf.fixture.address}–{rf.fixture.address + rf.mode.channels.length - 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && <AddDialog onClose={() => setAdding(false)} />}
    </>
  );
}

/**
 * Step-by-step setup for a client: structure, décor and patch on one page, with a live plan beside the steps,
 * so nothing sends the user to another page. Every edit is a regular undoable project update.
 */
export function SetupWizard() {
  const [step, setStep] = useState(0);
  const vis = useStore((s) => s.project!.project.visualizer);
  const { fixtures } = useResolved();
  const placing = useStore((s) => s.placing);
  const counts: Record<StepId, number> = { structure: vis.trusses.length, decor: vis.props.length, patch: fixtures.length };
  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;
  const finish = () => useStore.getState().toast({
    kind: 'success',
    title: 'Mise en place terminée',
    detail: `${counts.structure} structure(s) · ${counts.decor} élément(s) de décor · ${counts.patch} projecteur(s). Ctrl+S pour enregistrer.`,
  });

  return (
    <div className="page">
      <PageHead title="Mise en place" subtitle="Structure, décor puis patch, étape par étape : tout se règle sur cet écran" />
      <div className="chips" role="tablist" aria-label="Étapes" style={{ marginBottom: 12 }}>
        {STEPS.map((s, i) => (
          <button key={s.id} role="tab" aria-selected={i === step} className={`chip ${i === step ? 'on' : ''}`} onClick={() => setStep(i)} data-testid={`setup-step-${s.id}`}>
            {counts[s.id] > 0 ? <Check size={12} /> : <span className="dim">{i + 1}</span>}
            {s.label}
            {counts[s.id] > 0 && <span className="badge">{counts[s.id]}</span>}
          </button>
        ))}
      </div>
      <div className="setup-layout">
        <section className="setup-pane" aria-labelledby="setup-title" data-testid="setup-pane">
          <h2 id="setup-title" className="setup-title">{current.label}</h2>
          <p className="small muted" style={{ marginTop: 0 }}>{current.hint}</p>
          {current.id === 'structure' && (
            <>
              <p className="small dim" style={{ margin: 0 }}>Partir d’un modèle</p>
              <TemplatePicker vis={vis} />
              <StageShapeSettings vis={vis} />
              <TrussSettings vis={vis} />
            </>
          )}
          {current.id === 'decor' && <PropSettings vis={vis} />}
          {current.id === 'patch' && <PatchStep vis={vis} />}
          <div className="setup-nav">
            <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronLeft size={14} />Précédent</button>
            <span className="small muted">Étape {step + 1} sur {STEPS.length}</span>
            {last ? (
              <button className="btn primary" data-testid="setup-finish" onClick={finish}><Check size={14} />Terminer</button>
            ) : (
              <button className="btn primary" data-testid="setup-next" onClick={() => setStep(step + 1)}>Suivant<ChevronRight size={14} /></button>
            )}
          </div>
        </section>
        <div className="setup-preview" data-testid="setup-preview">
          <StageCanvas compact />
          {placing && (
            <div className="stage-empty stage-placing" role="status">
              <Crosshair size={16} />
              <span className="grow">Cliquez sur le plan pour poser : <b>{placing.label}</b></span>
              <button className="btn sm" onClick={() => useStore.getState().setPlacing(null)}>Annuler</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
