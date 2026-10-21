import { promises as fs } from 'node:fs';
import { writeFileAtomic } from '../project/store';
import { UserError } from '../app/shared';
import { parseLicense, requiredTier, statusAt, tierAtLeast, type LicenseClaims, type LicenseStatus } from './license';

/** Licence enregistrée dans `<dataDir>/license.key`. Sans clé publique (tests, développement), rien n'est restreint. */
export class LicenseManager {
  private claims: LicenseClaims | null = null;
  private invalid = false;

  constructor(private readonly file: string, private readonly publicKey: string | null) {}

  async load(): Promise<void> {
    if (!this.publicKey) return;
    const token = await fs.readFile(this.file, 'utf8').catch(() => '');
    this.claims = token ? parseLicense(token, this.publicKey) : null;
    this.invalid = !!token && !this.claims;
  }

  status(now = Date.now()): LicenseStatus {
    if (!this.publicKey) return { state: 'dev', tier: 'pro' };
    return this.invalid ? { state: 'invalid', tier: 'starter' } : statusAt(this.claims, now);
  }

  async activate(token: string): Promise<LicenseStatus> {
    const claims = this.publicKey ? parseLicense(token, this.publicKey) : null;
    if (!claims) throw new UserError('Clé de licence invalide.');
    await writeFileAtomic(this.file, token.trim(), false);
    this.claims = claims;
    this.invalid = false;
    return this.status();
  }

  async remove(): Promise<void> {
    await fs.rm(this.file, { force: true });
    this.claims = null;
    this.invalid = false;
  }

  /** Refuse une commande réservée à un palier supérieur à celui accordé. */
  assertAllowed(commandType: string): void {
    const need = requiredTier(commandType);
    if (!tierAtLeast(this.status().tier, need)) throw new UserError(`Cette fonction nécessite la licence ${need[0]!.toUpperCase()}${need.slice(1)}.`);
  }
}
