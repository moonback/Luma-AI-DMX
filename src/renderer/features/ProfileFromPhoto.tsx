import { useState } from 'react';
import { Camera, Plus, Trash2, X } from 'lucide-react';
import { useStore } from '../store';
import { act } from '../api';
import { Field, Modal, NumberInput } from '../components/ui';
import { shrinkImage } from './visualizer/sceneCards';
import { attributeLabel } from '../../core/fixtures/attributes';
import { slug } from '../../core/fixtures/ofl';
import { BUILTIN_ATTRIBUTES, FIXTURE_TYPES, profileSchema, type Channel, type FixtureProfile } from '../../core/model/schemas';

/** Manual tables have small print: keep more pixels than for a stage photo. */
const MANUAL_MAX_PX = 2400;
const MAX_PAGES = 4;
const TYPE_LABELS: Record<(typeof FIXTURE_TYPES)[number], string> = {
  par: 'PAR / wash fixe', 'moving-head-spot': 'Lyre spot', 'moving-head-wash': 'Lyre wash', strobe: 'Stroboscope', dimmer: 'Gradateur', 'led-bar': 'Barre LED', other: 'Autre',
};

/** Same id as the core gives, so a corrected name still replaces the profile of the same fixture. */
const photoId = (manufacturer: string, name: string) => `photo-${slug(manufacturer)}-${slug(name)}`.slice(0, 64);

/** Photo(s) of the manual's DMX chart → profile read by the AI, reviewed and corrected here, then saved to the library. */
export function ProfileFromPhotoDialog({ onClose }: { onClose: () => void }) {
  const known = useStore((s) => s.project!.project.profiles);
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<FixtureProfile | null>(null);
  const [summary, setSummary] = useState('');
  const [modeIdx, setModeIdx] = useState(0);

  const addFiles = async (files: FileList | null) => {
    const picked = [...(files ?? [])].slice(0, MAX_PAGES - images.length);
    try {
      const shrunk = await Promise.all(picked.map((f) => shrinkImage(f, MANUAL_MAX_PX)));
      setImages((cur) => [...cur, ...shrunk].slice(0, MAX_PAGES));
    } catch (err) {
      useStore.getState().toast({ kind: 'error', title: 'Photo illisible', detail: (err as Error).message });
    }
  };
  const analyse = async () => {
    setBusy(true);
    const r = await act({ type: 'ai.profileFromPhoto', images });
    setBusy(false);
    if (!r?.profile) return; // error already shown
    setDraft(r.profile);
    setModeIdx(0);
    setSummary([r.summary, r.dropped ? `${r.dropped} élément(s) illisible(s) ignoré(s).` : '', ...r.notices].filter(Boolean).join(' '));
  };

  const mode = draft?.modes[modeIdx];
  const setChannels = (f: (chs: Channel[]) => Channel[]) => setDraft((d) => d && { ...d, modes: d.modes.map((m, i) => (i === modeIdx ? { ...m, channels: f(m.channels) } : m)) });
  const setChannel = (i: number, patch: Partial<Channel>) => setChannels((chs) => chs.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const check = draft ? profileSchema.safeParse(draft) : null;
  const error = check && !check.success ? check.error.issues.map((i) => i.message)[0] : null;
  const replaces = draft && known.some((p) => p.id === draft.id);

  const save = async () => {
    if (!check?.success) return;
    const r = await act({ type: 'profile.save', profile: check.data });
    if (!r) return;
    useStore.getState().toast({ kind: 'success', title: `Profil enregistré : ${check.data.manufacturer} ${check.data.name}`, detail: 'Disponible dans « Ajouter » et la bibliothèque de profils.' });
    onClose();
  };

  if (!draft) {
    return (
      <Modal title="Créer un profil depuis une photo du manuel" wide onClose={onClose} footer={<>
        <button className="btn" onClick={() => { if (busy) void act({ type: 'ai.cancel' }); onClose(); }}>Annuler</button>
        <button className="btn primary" data-testid="profile-photo-analyse" disabled={!images.length || busy} onClick={() => void analyse()}>{busy ? 'Lecture du tableau…' : 'Analyser'}</button>
      </>}>
        <p className="muted" style={{ marginTop: 0 }}>Photographiez la page du manuel avec le tableau des canaux DMX (jusqu’à {MAX_PAGES} pages, bien à plat et nettes). L’IA lit le tableau, puis vous vérifiez chaque canal avant d’enregistrer. Nécessite une clé OpenRouter et un modèle compatible images (Paramètres › IA).</p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {images.map((src, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={src} alt={`Page ${i + 1}`} style={{ height: 120, borderRadius: 4, display: 'block' }} />
              <button className="btn sm" style={{ position: 'absolute', top: 4, right: 4 }} title="Retirer" aria-label={`Retirer la page ${i + 1}`} disabled={busy} onClick={() => setImages(images.filter((_, k) => k !== i))}><X size={12} /></button>
            </div>
          ))}
          {images.length < MAX_PAGES && (
            <label className="btn" style={{ height: 120, minWidth: 140, justifyContent: 'center' }}>
              <Camera size={15} />{images.length ? 'Ajouter une page' : 'Choisir les photos…'}
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden data-testid="profile-photo-file" onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Vérifier le profil lu sur la photo" wide onClose={onClose} footer={<>
      {error && <span className="small" style={{ color: '#fca5a5', marginRight: 'auto' }}>{error}</span>}
      <button className="btn" onClick={() => setDraft(null)}>Recommencer</button>
      <button className="btn primary" data-testid="profile-photo-save" disabled={!!error} onClick={() => void save()}>{replaces ? 'Remplacer le profil' : 'Enregistrer le profil'}</button>
    </>}>
      {summary && <p className="muted small" style={{ marginTop: 0 }}>{summary}</p>}
      <p className="small" style={{ color: '#fbbf24', marginTop: 0 }}>Vérifiez chaque canal avec le manuel : une erreur d’attribut ou de décalage fausse tout le pilotage de la machine.</p>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <Field label="Fabricant"><input className="input" value={draft.manufacturer} onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value, id: photoId(e.target.value, draft.name) })} /></Field>
        <Field label="Modèle"><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value, id: photoId(draft.manufacturer, e.target.value) })} /></Field>
        <Field label="Type">
          <select className="select" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as FixtureProfile['type'] })}>
            {FIXTURE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </Field>
      </div>
      <div className="row" style={{ gap: 6, margin: '10px 0', flexWrap: 'wrap' }}>
        {draft.modes.map((m, i) => <button key={i} className={`chip ${i === modeIdx ? 'on' : ''}`} onClick={() => setModeIdx(i)}>{m.name} · {m.channels.length} canaux</button>)}
      </div>
      {mode && (
        <>
          <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <Field label="Nom du mode"><input className="input" value={mode.name} onChange={(e) => setDraft({ ...draft, modes: draft.modes.map((m, i) => (i === modeIdx ? { ...m, name: e.target.value } : m)) })} /></Field>
            <button className="btn sm danger" disabled={draft.modes.length < 2} title="Supprimer ce mode" onClick={() => { setDraft({ ...draft, modes: draft.modes.filter((_, i) => i !== modeIdx) }); setModeIdx(0); }}><Trash2 size={13} />Mode</button>
          </div>
          <div style={{ maxHeight: '50vh', overflow: 'auto', marginTop: 8 }}>
            <table className="table" data-testid="profile-photo-channels">
              <thead><tr><th>Canal</th><th>Nom</th><th>Attribut</th><th title="Octet bas d’un attribut 16 bits">Fin</th><th>Défaut</th><th>Plages lues</th><th /></tr></thead>
              <tbody>
                {mode.channels.map((c, i) => (
                  <tr key={i}>
                    <td className="mono">{i + 1}</td>
                    <td><input className="input" value={c.name} aria-label={`Nom du canal ${i + 1}`} onChange={(e) => setChannel(i, { name: e.target.value })} /></td>
                    <td>
                      <select className="select" value={c.attribute} aria-label={`Attribut du canal ${i + 1}`} onChange={(e) => setChannel(i, { attribute: e.target.value === 'custom' ? `custom:${slug(c.name)}` : e.target.value })}>
                        {BUILTIN_ATTRIBUTES.map((a) => <option key={a} value={a}>{attributeLabel(a)}</option>)}
                        {c.attribute.startsWith('custom:') ? <option value={c.attribute}>Autre : {attributeLabel(c.attribute)}</option> : <option value="custom">Autre (personnalisé)</option>}
                      </select>
                    </td>
                    <td><input type="checkbox" checked={c.fine} aria-label={`Canal ${i + 1} fin (16 bits)`} onChange={(e) => setChannel(i, { fine: e.target.checked })} /></td>
                    <td><NumberInput value={c.default} min={0} max={255} onChange={(v) => setChannel(i, { default: v })} title="Valeur au repos" /></td>
                    <td className="small muted" title={c.ranges.map((r) => `${r.from}-${r.to} ${r.label}`).join('\n')}>{c.ranges.length ? c.ranges.map((r) => `${r.from}-${r.to} ${r.label}`).join(' · ') : '0-255'}</td>
                    <td><button className="btn sm danger" title="Supprimer ce canal" aria-label={`Supprimer le canal ${i + 1}`} disabled={mode.channels.length < 2} onClick={() => setChannels((chs) => chs.filter((_, k) => k !== i))}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn sm" style={{ marginTop: 8 }} disabled={mode.channels.length >= 512} onClick={() => setChannels((chs) => [...chs, { name: `Canal ${chs.length + 1}`, attribute: `custom:canal-${chs.length + 1}`, fine: false, default: 0, ranges: [] }])}><Plus size={13} />Ajouter un canal</button>
        </>
      )}
    </Modal>
  );
}
