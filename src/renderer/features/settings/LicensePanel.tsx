import { useEffect, useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { act } from '../../api';
import { Modal, Panel } from '../../components/ui';
import { useT } from '../../i18n';
import type { LicenseStatus } from '../../../core/license/license';

/** Palier accordé et échéance ; la saisie ou le retrait de la clé se fait dans une modale. */
export function LicensePanel() {
  const tr = useT();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [key, setKey] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => { void act({ type: 'license.get' }).then((s) => s && setStatus(s)); }, []);
  const activate = () => void act({ type: 'license.activate', key }).then((s) => { if (s) { setStatus(s); setKey(''); } });
  const remove = () => void act({ type: 'license.remove' }).then((s) => s && setStatus(s));
  const summary = status && (
    <>
      <span className="badge violet">{tr(`license.tier.${status.tier}`)}</span>{' '}
      <span className="small muted">{tr(`license.state.${status.state}`)}{status.holder ? ` · ${status.holder}` : ''}{status.expiresAt ? ` · ${new Date(status.expiresAt).toLocaleDateString()}` : ''}</span>
    </>
  );
  return (
    <Panel title={tr('license.title')} className="settings-card">
      <div className="settings-card-body">
        <span className="settings-card-icon"><BadgeCheck size={18} /></span>
        <p className="grow" style={{ margin: 0 }} data-testid="license-status">{summary ?? '…'}</p>
      </div>
      <div className="row settings-card-actions">
        <button className="btn sm primary" onClick={() => setOpen(true)} data-testid="license-open">{tr('settings.manage')}</button>
      </div>
      {open && (
        <Modal title={tr('license.title')} onClose={() => setOpen(false)} footer={<button className="btn" onClick={() => setOpen(false)}>{tr('common.close')}</button>}>
          {summary && <p style={{ marginTop: 0 }}>{summary}</p>}
          <div className="row">
            <input className="input" data-testid="license-key" value={key} placeholder={tr('license.placeholder')} onChange={(e) => setKey(e.target.value)} autoFocus />
            <button className="btn sm primary" data-testid="license-activate" disabled={key.trim().length < 10} onClick={activate}>{tr('license.activate')}</button>
            {status && status.state !== 'none' && status.state !== 'dev' && <button className="btn sm" onClick={remove}>{tr('license.remove')}</button>}
          </div>
        </Modal>
      )}
    </Panel>
  );
}
