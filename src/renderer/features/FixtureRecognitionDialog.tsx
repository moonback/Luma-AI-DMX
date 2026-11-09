import { useMemo, useState } from 'react';
import { Camera, Check, LoaderCircle, Trash2, Upload } from 'lucide-react';
import { act } from '../api';
import { useStore } from '../store';
import { Field, Modal } from '../components/ui';
import { shrinkImage } from './visualizer/sceneCards';
import type { FixtureRecognitionResult } from '../../core/ai/fixtureRecognition';

const MAX_PHOTOS = 6;

export function FixtureRecognitionDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project!.project);
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(FixtureRecognitionResult & { model: string; notices: string[] }) | null>(null);
  const [selected, setSelected] = useState<Record<number, string>>({});

  const addFiles = async (files: FileList | null) => {
    const picked = [...(files ?? [])].slice(0, MAX_PHOTOS - images.length);
    try {
      const next = await Promise.all(picked.map((file) => shrinkImage(file, 1800)));
      setImages((current) => [...current, ...next].slice(0, MAX_PHOTOS));
      setResult(null);
      setSelected({});
    } catch (error) {
      useStore.getState().toast({ kind: 'error', title: 'Photo illisible', detail: (error as Error).message });
    }
  };

  const analyse = async () => {
    setBusy(true);
    const response = await act({ type: 'ai.recognizeFixtures', images });
    setBusy(false);
    if (!response) return;
    setResult(response);
    setSelected(Object.fromEntries(response.observations.map((o, i) => [i, o.suggestedFixtureId ?? ''])));
  };

  const associations = useMemo(() => {
    if (!result) return [];
    const byFixture = new Map<string, { index: number; confidence: number }>();
    result.observations.forEach((observation, index) => {
      const fixtureId = selected[index];
      if (!fixtureId || !project.patch.some((fixture) => fixture.id === fixtureId)) return;
      const previous = byFixture.get(fixtureId);
      if (!previous || observation.matchConfidence > previous.confidence) byFixture.set(fixtureId, { index, confidence: observation.matchConfidence });
    });
    return [...byFixture.entries()].map(([fixtureId, item]) => ({ fixtureId, ...item }));
  }, [project.patch, result, selected]);

  const save = async () => {
    if (!result || !associations.length) return;
    setBusy(true);
    let saved = 0;
    for (const association of associations) {
      const observation = result.observations[association.index]!;
      const description = [
        observation.manufacturerGuess,
        observation.modelGuess,
        observation.evidence,
        observation.supportHint ? `Support : ${observation.supportHint}` : '',
      ].filter(Boolean).join(' · ').slice(0, 500);
      const response = await act({
        type: 'fixture.update',
        id: association.fixtureId,
        patch: {
          visualRecognition: {
            label: observation.label,
            description,
            observedType: observation.observedType,
            confidence: observation.matchConfidence,
            mountGuess: observation.mountGuess,
            supportHint: observation.supportHint,
            verifiedAt: new Date().toISOString(),
          },
        },
      });
      if (response) saved++;
    }
    setBusy(false);
    if (saved) {
      useStore.getState().toast({ kind: 'success', title: `${saved} association(s) visuelle(s) confirmée(s)`, detail: 'Les identifications sont enregistrées dans le patch du projet.' });
      onClose();
    }
  };

  const title = (observation: FixtureRecognitionResult['observations'][number]) =>
    [observation.manufacturerGuess, observation.modelGuess].filter(Boolean).join(' ') || observation.label;

  return (
    <Modal
      title="Reconnaissance visuelle des projecteurs"
      wide
      onClose={onClose}
      locked={busy}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>Fermer</button>
        {!result ? (
          <button className="btn primary" disabled={!images.length || busy} onClick={() => void analyse()}>
            {busy ? <LoaderCircle size={14} className="spin" /> : <Camera size={14} />}Analyser les photos
          </button>
        ) : (
          <button className="btn primary" disabled={!associations.length || busy} onClick={() => void save()}>
            {busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}Confirmer {associations.length} association(s)
          </button>
        )}
      </>}
    >
      {!result ? (
        <div className="col gap-lg">
          <p className="small muted" style={{ marginTop: 0 }}>
            Importez jusqu’à {MAX_PHOTOS} photos nettes de l’installation. Cadrez les boîtiers des projecteurs, les étiquettes et leurs fixations. Les faisceaux seuls ne suffisent pas à identifier un appareil.
          </p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {images.map((src, index) => (
              <div key={index} style={{ position: 'relative' }}>
                <img src={src} alt={`Installation ${index + 1}`} style={{ width: 150, height: 105, objectFit: 'cover', borderRadius: 6 }} />
                <button className="btn sm" aria-label={`Supprimer photo ${index + 1}`} style={{ position: 'absolute', top: 4, right: 4 }} onClick={() => setImages((current) => current.filter((_, i) => i !== index))}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {images.length < MAX_PHOTOS && (
              <label className="btn" style={{ width: 150, height: 105, justifyContent: 'center', flexDirection: 'column' }}>
                <Upload size={18} />Ajouter des photos
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => { void addFiles(event.target.files); event.target.value = ''; }} />
              </label>
            )}
          </div>
          <div className="panel small">
            <b>Ce que l’IA va rechercher</b>
            <ul>
              <li>Type d’appareil : lyre spot/wash, PAR, stroboscope, barre LED…</li>
              <li>Marque et modèle uniquement s’ils sont reconnaissables.</li>
              <li>Type de montage et structure visible.</li>
              <li>Correspondance possible avec les appareils déjà présents dans le patch DMX.</li>
            </ul>
            <span className="muted">Aucune position 3D n’est déduite de ces photos. La mesure spatiale reste effectuée par Camera Locate et sa calibration.</span>
          </div>
        </div>
      ) : (
        <div className="col gap-lg">
          <div className="panel small">
            <b>{result.observations.length} appareil(s) détecté(s)</b> · {associations.length} association(s) sélectionnée(s) · Modèle : {result.model}
            <p style={{ margin: '6px 0 0' }}>{result.summary}</p>
            {result.dropped > 0 && <p className="muted" style={{ margin: '6px 0 0' }}>{result.dropped} observation(s) écartée(s) car invalide(s).</p>}
            {result.notices.map((notice, index) => <p className="muted" key={index}>{notice}</p>)}
          </div>
          {result.observations.map((observation, index) => {
            const candidate = result.candidates.find((item) => item.fixtureId === selected[index]);
            return (
              <div className="panel col" key={index} style={{ gap: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>Appareil {index + 1} — {title(observation)}</b>
                  <span className="badge">{observation.observedType}</span>
                </div>
                <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: '0 0 150px', minWidth: 0 }}>
                    <div style={{ position: 'relative' }}>
                      <img src={images[observation.imageIndex]!} alt="Zone détectée" style={{ width: '100%', display: 'block', borderRadius: 4 }} />
                      <div style={{ position: 'absolute', left: `${observation.bbox.x * 100}%`, top: `${observation.bbox.y * 100}%`, width: `${observation.bbox.width * 100}%`, height: `${observation.bbox.height * 100}%`, border: '2px solid #34d399', boxSizing: 'border-box', pointerEvents: 'none' }} />
                    </div>
                    <span className="small muted">Photo {observation.imageIndex + 1}</span>
                  </div>
                  <div className="col" style={{ flex: 1, minWidth: 0, gap: 6 }}>
                    <span className="small">Montage : {observation.mountGuess}{observation.supportHint ? ` · ${observation.supportHint}` : ''}</span>
                    <span className="small muted">{observation.evidence}</span>
                    <Field label="Associer à un projecteur du patch">
                      <select className="select" value={selected[index] ?? ''} onChange={(event) => setSelected((current) => ({ ...current, [index]: event.target.value }))}>
                        <option value="">Ne pas associer</option>
                        {result.candidates.map((item) => <option key={item.fixtureId} value={item.fixtureId}>U{item.universe}.{item.address} · {item.name} — {item.manufacturer} {item.model}</option>)}
                      </select>
                    </Field>
                    {candidate && <span className="small">Correspondance proposée : {Math.round(observation.matchConfidence * 100)} % · {candidate.name}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {!result.observations.length && <p className="muted">Aucun appareil n’a pu être identifié dans ces photos. Essayez des vues plus rapprochées et mieux éclairées.</p>}
        </div>
      )}
    </Modal>
  );
}
