import { generateKeyPairSync, sign } from 'node:crypto';
import path from 'node:path';
import { LicenseManager } from '../../src/core/license/manager';
import { GRACE_DAYS, parseLicense, requiredTier, statusAt, type LicenseClaims } from '../../src/core/license/license';
import { LICENSE_PUBLIC_KEY } from '../../src/core/license/publicKey';
import { tempDir } from '../helpers';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const issue = (claims: LicenseClaims) => {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${sign(null, Buffer.from(payload), privateKey).toString('base64url')}`;
};
const DAY = 86400_000;

describe('licences', () => {
  it('vérifie la signature et refuse une charge modifiée', () => {
    const token = issue({ tier: 'standard', sub: 'a@b.fr' });
    expect(parseLicense(token, pem)?.tier).toBe('standard');
    const forged = `${Buffer.from(JSON.stringify({ tier: 'pro', sub: 'a@b.fr' })).toString('base64url')}.${token.split('.')[1]}`;
    expect(parseLicense(forged, pem)).toBeNull();
    expect(parseLicense(token, LICENSE_PUBLIC_KEY)).toBeNull();
    expect(parseLicense('pas une licence', pem)).toBeNull();
  });

  it('abonnement : actif, période de grâce, puis retour à Starter', () => {
    const exp = 1_000_000;
    const claims: LicenseClaims = { tier: 'pro', sub: 'x', exp };
    expect(statusAt(claims, exp * 1000 - 1)).toMatchObject({ state: 'active', tier: 'pro' });
    expect(statusAt(claims, exp * 1000 + DAY)).toMatchObject({ state: 'grace', tier: 'pro' });
    expect(statusAt(claims, exp * 1000 + (GRACE_DAYS + 1) * DAY)).toMatchObject({ state: 'expired', tier: 'starter' });
    expect(statusAt({ tier: 'standard', sub: 'x' }, 9e15).state).toBe('active');
  });

  it('refuse les commandes au-dessus du palier et persiste la clé', async () => {
    const file = path.join(tempDir(), 'license.key');
    const lic = new LicenseManager(file, pem);
    await lic.load();
    expect(() => lic.assertAllowed('cue.go')).not.toThrow();
    expect(() => lic.assertAllowed('ai.propose')).toThrow(/Standard/);
    await expect(lic.activate('xxxxxxxxxxxx.yyyy')).rejects.toThrow(/invalide/);
    await lic.activate(issue({ tier: 'standard', sub: 'a' }));
    expect(() => lic.assertAllowed('music.generate')).not.toThrow();
    expect(() => lic.assertAllowed('rdm.discover')).toThrow(/Pro/);
    const reloaded = new LicenseManager(file, pem);
    await reloaded.load();
    expect(reloaded.status().tier).toBe('standard');
    expect(requiredTier('locate.begin')).toBe('pro');
  });

  it('ne restreint rien sans clé publique', () => {
    expect(() => new LicenseManager('x', null).assertAllowed('rdm.discover')).not.toThrow();
  });
});
