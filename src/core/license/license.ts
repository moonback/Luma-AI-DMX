import { verify } from 'node:crypto';
import { z } from 'zod';

export const TIERS = ['starter', 'standard', 'pro'] as const;
export type Tier = (typeof TIERS)[number];

/** Après l'échéance d'un abonnement, le palier payé reste actif ce nombre de jours (renouvellement en retard, pas de réseau). */
export const GRACE_DAYS = 7;

const claimsSchema = z.object({ tier: z.enum(TIERS), sub: z.string().min(1).max(200), exp: z.number().int().positive().optional() });
export type LicenseClaims = z.infer<typeof claimsSchema>;

/** `none` : pas de licence (palier Starter) ; `dev` : vérification désactivée (tests, développement). */
export type LicenseState = 'none' | 'active' | 'grace' | 'expired' | 'invalid' | 'dev';
export interface LicenseStatus {
  state: LicenseState;
  /** Palier réellement accordé. */
  tier: Tier;
  holder?: string;
  /** Échéance de l'abonnement, en ms ; absente pour une licence perpétuelle. */
  expiresAt?: number;
}

/** Palier minimal d'une commande (préfixe avant le point) ; tout ce qui n'est pas listé est Starter. */
const DOMAIN_TIER: Partial<Record<string, Tier>> = { ai: 'standard', music: 'standard', timeline: 'standard', rdm: 'pro', locate: 'pro' };
export const requiredTier = (commandType: string): Tier => DOMAIN_TIER[commandType.slice(0, commandType.indexOf('.'))] ?? 'starter';
export const tierAtLeast = (have: Tier, need: Tier): boolean => TIERS.indexOf(have) >= TIERS.indexOf(need);

/** Clés `payload.signature` en base64url ; la signature Ed25519 porte sur le texte du payload. */
export function parseLicense(token: string, publicKeyPem: string): LicenseClaims | null {
  const [payload, sig, extra] = token.trim().split('.');
  if (!payload || !sig || extra !== undefined) return null;
  try {
    if (!verify(null, Buffer.from(payload), publicKeyPem, Buffer.from(sig, 'base64url'))) return null;
    const claims = claimsSchema.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    return claims.success ? claims.data : null;
  } catch {
    return null;
  }
}

/** État d'une licence déjà vérifiée à l'instant `now` (ms). */
export function statusAt(claims: LicenseClaims | null, now: number): LicenseStatus {
  if (!claims) return { state: 'none', tier: 'starter' };
  const base = { holder: claims.sub, ...(claims.exp ? { expiresAt: claims.exp * 1000 } : {}) };
  if (!claims.exp || now < claims.exp * 1000) return { ...base, state: 'active', tier: claims.tier };
  if (now < claims.exp * 1000 + GRACE_DAYS * 86400_000) return { ...base, state: 'grace', tier: claims.tier };
  return { ...base, state: 'expired', tier: 'starter' };
}
