import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useT } from '../../i18n';
import { useStore } from '../../store';
import { useResolved } from '../../components/ui';
import type { ValidatedAction } from '../../../core/ai/actions';

const BADGE = { ok: 'ok', warning: 'warn', rejected: 'err' } as const;

/** One validated action of a plan: what it does, on which fixtures, why it may be refused; editable while not applied. */
export function ActionCard({ v, excluded, locked, onToggle, onEdit }: { v: ValidatedAction; excluded: boolean; locked: boolean; onToggle: () => void; onEdit: (raw: unknown) => void }) {
  const t = useT();
  const { byId } = useResolved();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => JSON.stringify(v.action ?? v.raw, null, 2));
  const names = v.fixtureIds.map((id) => byId.get(id)?.fixture.name ?? id);
  const revalidate = () => {
    try {
      onEdit(JSON.parse(text));
      setEditing(false);
    } catch {
      useStore.getState().toast({ kind: 'error', title: t('ai.action.invalidJson') });
    }
  };
  return (
    <li className={`action-card ${v.status} ${excluded ? 'excluded' : ''}`}>
      <div className="row">
        <input type="checkbox" checked={!excluded && v.status !== 'rejected'} disabled={v.status === 'rejected' || locked} onChange={onToggle} title={t('ai.action.include')} aria-label={t('ai.action.include')} />
        <b className="grow">{v.summary}</b>
        <span className={`badge ${BADGE[v.status]}`}>{t(`ai.action.${v.status}`)}</span>
        {!locked && <button className="btn ghost sm" onClick={() => setEditing(!editing)} title={t('ai.action.editTitle')} aria-expanded={editing}><Pencil size={12} />{t('ai.action.edit')}</button>}
      </div>
      {names.length > 0 && <div className="small muted ai-targets">{t('ai.action.targets', { list: `${names.slice(0, 10).join(', ')}${names.length > 10 ? ` (+${names.length - 10})` : ''}` })}</div>}
      {v.messages.length > 0 && <ul className={`ai-messages small ${v.status === 'rejected' ? 'err' : 'warn'}`}>{v.messages.map((m, k) => <li key={k}>{m}</li>)}</ul>}
      {editing && (
        <div className="col ai-edit">
          <textarea className="textarea" rows={8} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label={t('ai.action.editTitle')} />
          <div className="row">
            <button className="btn sm primary" onClick={revalidate}>{t('ai.action.revalidate')}</button>
            <span className="small dim">{t('ai.action.editHint')}</span>
          </div>
        </div>
      )}
    </li>
  );
}
