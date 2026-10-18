import { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { act } from '../../api';
import { useStore } from '../../store';
import { Field, Panel } from '../../components/ui';
import type { UsageData } from '../../../core/telemetry/usage';

type Kind = 'bug' | 'idea' | 'show-report' | 'other';
const KINDS: { id: Kind; label: string }[] = [
  { id: 'bug', label: 'Problème' }, { id: 'idea', label: 'Idée' }, { id: 'show-report', label: 'Compte rendu de show / répétition' }, { id: 'other', label: 'Autre' },
];

/** Totals over the kept days, most used first. */
function totals(data: UsageData, key: 'commands' | 'errors'): [string, number][] {
  const sum = new Map<string, number>();
  for (const d of Object.values(data.days)) for (const [k, n] of Object.entries(d[key])) sum.set(k, (sum.get(k) ?? 0) + n);
  return [...sum].sort((a, b) => b[1] - a[1]);
}

/** Opt-in local usage statistics: what is counted, shown as is. */
export function UsagePanel({ enabled, onChange }: { enabled: boolean; onChange: (on: boolean) => void }) {
  const [data, setData] = useState<UsageData | null>(null);
  const load = () => void act({ type: 'usage.get' }).then((x) => x && setData(x.data));
  useEffect(load, []);
  const top = data ? totals(data, 'commands').slice(0, 12) : [];
  const errors = data ? totals(data, 'errors').slice(0, 6) : [];
  const sessions = data ? Object.values(data.days).reduce((n, d) => n + d.sessions, 0) : 0;
  return (
    <Panel title="Statistiques d’usage (bêta)">
      <label className="check"><input type="checkbox" data-testid="usage-enabled" checked={enabled} onChange={(e) => onChange(e.target.checked)} />Compter localement les fonctions utilisées et les erreurs</label>
      <p className="small muted">Désactivé par défaut. Seuls les <b>types</b> de commandes (par exemple « cue.go ») et le nombre d’erreurs par source sont comptés, par jour, sur 90 jours. Jamais de noms, de consignes IA ni de contenu de projet. Rien n’est envoyé : vous pouvez joindre ces chiffres à un retour.</p>
      {data && (sessions > 0 || top.length > 0) ? (
        <div className="grid g2 small">
          <div><b>{sessions}</b> session(s)<table className="table small"><tbody>{top.map(([k, n]) => <tr key={k}><td className="mono">{k}</td><td>{n}</td></tr>)}</tbody></table></div>
          <div>Erreurs{errors.length ? <table className="table small"><tbody>{errors.map(([k, n]) => <tr key={k}><td>{k}</td><td>{n}</td></tr>)}</tbody></table> : <div className="dim">aucune</div>}</div>
        </div>
      ) : <p className="small dim">Aucune donnée.</p>}
      <div className="row"><button className="btn sm" onClick={() => void act({ type: 'usage.clear' }).then(load)}>Effacer les statistiques</button></div>
    </Panel>
  );
}

/** Feedback written to a file the user sends to the team (no account, no server). */
export function FeedbackPanel() {
  const [kind, setKind] = useState<Kind>('bug');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [withDiag, setWithDiag] = useState(true);
  const [withUsage, setWithUsage] = useState(true);
  const save = async () => {
    const r = await act({ type: 'feedback.export', kind, message, contact, includeDiagnostic: withDiag, includeUsage: withUsage });
    if (r?.path) {
      setMessage('');
      useStore.getState().toast({ kind: 'success', title: 'Retour enregistré', detail: `${r.path}\nEnvoyez ce fichier à l’équipe Luma.` });
    }
  };
  return (
    <Panel title="Envoyer un retour">
      <div className="grid g2">
        <Field label="Type">
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
        </Field>
        <Field label="Contact (facultatif)"><input className="input" value={contact} maxLength={200} onChange={(e) => setContact(e.target.value)} placeholder="e-mail ou téléphone" /></Field>
      </div>
      <Field label="Message"><textarea className="input" data-testid="feedback-message" style={{ minHeight: 110, width: '100%' }} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ce qui s’est passé, ce que vous attendiez, le matériel utilisé…" /></Field>
      <div className="col" style={{ gap: 4, margin: '8px 0' }}>
        <label className="check"><input type="checkbox" checked={withDiag} onChange={(e) => setWithDiag(e.target.checked)} />Joindre le diagnostic (version, paramètres sans secrets, journal)</label>
        <label className="check"><input type="checkbox" checked={withUsage} onChange={(e) => setWithUsage(e.target.checked)} />Joindre les statistiques d’usage (si activées)</label>
      </div>
      <div className="row"><button className="btn primary" data-testid="feedback-save" disabled={!message.trim()} onClick={() => void save()}><MessageSquare size={14} />Enregistrer le retour…</button></div>
    </Panel>
  );
}
