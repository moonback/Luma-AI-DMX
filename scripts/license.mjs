// Vendeur : `node scripts/license.mjs keygen` puis `node scripts/license.mjs issue --tier pro --sub client@mail.fr [--days 365]`.
// La clé privée reste hors du dépôt (LUMA_LICENSE_KEY ou ~/.luma-license-private.pem) ; la clé publique va dans src/core/license/publicKey.ts.
import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const keyFile = process.env.LUMA_LICENSE_KEY ?? path.join(os.homedir(), '.luma-license-private.pem');
const [cmd, ...rest] = process.argv.slice(2);
const arg = (name) => rest[rest.indexOf(`--${name}`) + 1];

if (cmd === 'keygen') {
  if (existsSync(keyFile)) throw new Error(`${keyFile} existe déjà : refus d'écraser la clé privée.`);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  console.log(`Clé privée : ${keyFile} (à sauvegarder, introuvable sinon)\nClé publique à coller dans publicKey.ts :\n${publicKey.export({ type: 'spki', format: 'pem' })}`);
} else if (cmd === 'issue') {
  const tier = arg('tier');
  const sub = arg('sub');
  if (!['starter', 'standard', 'pro'].includes(tier) || !sub) throw new Error('Usage : issue --tier starter|standard|pro --sub <client> [--days <n>]');
  const days = arg('days');
  const claims = { tier, sub, ...(days ? { exp: Math.floor(Date.now() / 1000) + Number(days) * 86400 } : {}) };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = sign(null, Buffer.from(payload), createPrivateKey(readFileSync(keyFile))).toString('base64url');
  console.log(`${payload}.${sig}`);
} else {
  throw new Error('Commandes : keygen | issue');
}
