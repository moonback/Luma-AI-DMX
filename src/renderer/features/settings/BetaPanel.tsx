import { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { act } from '../../api';
import { useStore } from '../../store';
import { Field, Panel } from '../../components/ui';
import { t, useT } from '../../i18n';
import type { UsageData } from '../../../core/telemetry/usage';

type Kind = 'bug' | 'idea' | 'show-report' | 'other';
const KINDS: Kind[] = ['bug', 'idea', 'show-report', 'other'];

/** Totals over the kept days, most used first. */
function totals(data: UsageData, key: 'commands' | 'errors'): [string, number][] {
  const sum = new Map<string, number>();
  for (const d of Object.values(data.days)) for (const [k, n] of Object.entries(d[key])) sum.set(k, (sum.get(k) ?? 0) + n);
  return [...sum].sort((a, b) => b[1] - a[1]);
}

/** Opt-in local usage statistics: what is counted, shown as is. */
export function UsagePanel({ enabled, onChange }: { enabled: boolean; onChange: (on: boolean) => void }) {
  const tr = useT();
  const [data, setData] = useState<UsageData | null>(null);
  const load = () => void act({ type: 'usage.get' }).then((x) => x && setData(x.data));
  useEffect(load, []);
  const top = data ? totals(data, 'commands').slice(0, 12) : [];
  const errors = data ? totals(data, 'errors').slice(0, 6) : [];
  const sessions = data ? Object.values(data.days).reduce((n, d) => n + d.sessions, 0) : 0;
  return (
    <Panel title={tr('beta.usage.title')}>
      <label className="check"><input type="checkbox" data-testid="usage-enabled" checked={enabled} onChange={(e) => onChange(e.target.checked)} />{tr('beta.usage.enable')}</label>
      <p className="small muted">{tr('beta.usage.intro')}</p>
      {data && (sessions > 0 || top.length > 0) ? (
        <div className="grid g2 small">
          <div>{tr('beta.usage.sessions', { n: sessions })}<table className="table small"><tbody>{top.map(([k, n]) => <tr key={k}><td className="mono">{k}</td><td>{n}</td></tr>)}</tbody></table></div>
          <div>{tr('beta.usage.errors')}{errors.length ? <table className="table small"><tbody>{errors.map(([k, n]) => <tr key={k}><td>{k}</td><td>{n}</td></tr>)}</tbody></table> : <div className="dim">{tr('beta.usage.noErrors')}</div>}</div>
        </div>
      ) : <p className="small dim">{tr('beta.usage.noData')}</p>}
      <div className="row"><button className="btn sm" onClick={() => void act({ type: 'usage.clear' }).then(load)}>{tr('beta.usage.clear')}</button></div>
    </Panel>
  );
}

/** Feedback written to a file the user sends to the team (no account, no server). */
export function FeedbackPanel() {
  const tr = useT();
  const [kind, setKind] = useState<Kind>('bug');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [withDiag, setWithDiag] = useState(true);
  const [withUsage, setWithUsage] = useState(true);
  const save = async () => {
    const r = await act({ type: 'feedback.export', kind, message, contact, includeDiagnostic: withDiag, includeUsage: withUsage });
    if (r?.path) {
      setMessage('');
      useStore.getState().toast({ kind: 'success', title: t('beta.feedback.saved'), detail: t('beta.feedback.savedDetail', { path: r.path }) });
    }
  };
  return (
    <Panel title={tr('beta.feedback.title')}>
      <div className="grid g2">
        <Field label={tr('beta.feedback.kind')}>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>{KINDS.map((k) => <option key={k} value={k}>{tr(`beta.feedback.kind.${k}`)}</option>)}</select>
        </Field>
        <Field label={tr('beta.feedback.contact')}><input className="input" value={contact} maxLength={200} onChange={(e) => setContact(e.target.value)} placeholder={tr('beta.feedback.contactPlaceholder')} /></Field>
      </div>
      <Field label={tr('beta.feedback.message')}><textarea className="input" data-testid="feedback-message" style={{ minHeight: 110, width: '100%' }} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={tr('beta.feedback.messagePlaceholder')} /></Field>
      <div className="col" style={{ gap: 4, margin: '8px 0' }}>
        <label className="check"><input type="checkbox" checked={withDiag} onChange={(e) => setWithDiag(e.target.checked)} />{tr('beta.feedback.withDiag')}</label>
        <label className="check"><input type="checkbox" checked={withUsage} onChange={(e) => setWithUsage(e.target.checked)} />{tr('beta.feedback.withUsage')}</label>
      </div>
      <div className="row"><button className="btn primary" data-testid="feedback-save" disabled={!message.trim()} onClick={() => void save()}><MessageSquare size={14} />{tr('beta.feedback.save')}</button></div>
    </Panel>
  );
}
