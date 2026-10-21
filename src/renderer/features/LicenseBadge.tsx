import { useEffect, useState } from 'react';
import { BadgeCheck, TriangleAlert } from 'lucide-react';
import { act } from '../api';
import { useStore } from '../store';
import { useT } from '../i18n';
import type { LicenseState, LicenseStatus } from '../../core/license/license';

const TONE: Record<LicenseState, string> = { none: '', dev: '', active: 'violet', grace: 'warn', expired: 'err', invalid: 'err' };

/** Palier de la licence dans le header ; un clic ouvre les réglages, où se saisit la clé. */
export function LicenseBadge() {
  const tr = useT();
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  // Relu à chaque changement de page : la clé s'active dans les réglages, qu'on quitte ensuite.
  useEffect(() => { void act({ type: 'license.get' }).then((s) => s && setStatus(s)); }, [page]);
  if (!status) return null;
  const warn = status.state === 'grace' || status.state === 'expired' || status.state === 'invalid';
  const title = [tr(`license.state.${status.state}`), status.holder, status.expiresAt && new Date(status.expiresAt).toLocaleDateString()].filter(Boolean).join(' · ');
  return (
    <button className={`badge license-badge ${TONE[status.state]}`} data-testid="license-badge" title={title} onClick={() => setPage('settings')}>
      {warn ? <TriangleAlert size={12} /> : <BadgeCheck size={12} />}
      {status.state === 'dev' ? 'DEV' : tr(`license.tier.${status.tier}`)}
    </button>
  );
}
