import { useEffect, useState } from 'react';
import { act } from '../../api';
import { Panel } from '../../components/ui';
import { useT } from '../../i18n';
import type { LicenseStatus } from '../../../core/license/license';

/** Palier accordé, échéance, et saisie ou retrait de la clé de licence. */
export function LicensePanel() {
  const tr = useT();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [key, setKey] = useState('');
  useEffect(() => { void act({ type: 'license.get' }).then((s) => s && setStatus(s)); }, []);
  const activate = () => void act({ type: 'license.activate', key }).then((s) => { if (s) { setStatus(s); setKey(''); } });
  const remove = () => void act({ type: 'license.remove' }).then((s) => s && setStatus(s));
  return (
    <Panel title={tr('license.title')}>
      {status && (
        <p data-testid="license-status">
          <span className="badge violet">{tr(`license.tier.${status.tier}`)}</span>{' '}
          <span className="small muted">{tr(`license.state.${status.state}`)}{status.holder ? ` · ${status.holder}` : ''}{status.expiresAt ? ` · ${new Date(status.expiresAt).toLocaleDateString()}` : ''}</span>
        </p>
      )}
      <div className="row">
        <input className="input" data-testid="license-key" value={key} placeholder={tr('license.placeholder')} onChange={(e) => setKey(e.target.value)} />
        <button className="btn sm primary" data-testid="license-activate" disabled={key.trim().length < 10} onClick={activate}>{tr('license.activate')}</button>
        {status && status.state !== 'none' && status.state !== 'dev' && <button className="btn sm" onClick={remove}>{tr('license.remove')}</button>}
      </div>
    </Panel>
  );
}
