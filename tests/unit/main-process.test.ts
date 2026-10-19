import path from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { vi } from 'vitest';
import { makeService, tempDir } from '../helpers';

vi.mock('electron', () => ({ safeStorage: {} }));
const { handleCommand, isTrustedSender } = await import('../../src/main/ipc');
const { createSecretStore } = await import('../../src/main/secrets');

describe('frontière IPC (LUMA-032)', () => {
  it('origine : le serveur de développement en dev, les fichiers locaux une fois empaqueté', () => {
    expect(isTrustedSender('file:///C:/app/index.html', undefined)).toBe(true);
    expect(isTrustedSender('https://evil.example', undefined)).toBe(false);
    expect(isTrustedSender('http://localhost:5173/#stage3d', 'http://localhost:5173')).toBe(true);
    expect(isTrustedSender('file:///C:/app/index.html', 'http://localhost:5173')).toBe(false);
  });

  it('refuse l’origine, borne les erreurs de schéma, ne journalise pas les erreurs utilisateur', async () => {
    const { svc } = makeService();
    await svc.init();
    expect(await handleCommand(svc, { type: 'project.get' }, 'https://evil.example', undefined)).toEqual({ ok: false, error: 'Origine non autorisée' });
    const invalid = await handleCommand(svc, { type: 'fixture.add', profileId: '', mode: '', universe: 0, address: 0, count: 0, namePrefix: '' }, 'file:///x', undefined);
    expect(invalid.ok).toBe(false);
    expect(!invalid.ok && invalid.error.startsWith('Commande invalide :') && invalid.error.split(' ; ').length).toBeLessThanOrEqual(3);
    const ok = await handleCommand(svc, { type: 'project.get' }, 'file:///x', undefined);
    expect(ok.ok).toBe(true);
    const before = svc.logger.recent().filter((e) => e.source === 'IPC').length;
    const user = await handleCommand(svc, { type: 'scene.load', id: 'nope' }, 'file:///x', undefined);
    expect(user).toEqual({ ok: false, error: 'Scène introuvable' });
    expect(svc.logger.recent().filter((e) => e.source === 'IPC').length).toBe(before);
    // An internal failure is logged with the command type.
    const broken = { execute: async () => { throw new Error('panne'); }, logger: svc.logger } as never;
    expect(await handleCommand(broken, { type: 'project.get' }, 'file:///x', undefined)).toEqual({ ok: false, error: 'panne' });
    expect(svc.logger.recent().at(-1)).toMatchObject({ source: 'IPC', message: 'project.get : panne' });
    await svc.dispose();
  });
});

describe('magasin de secrets (LUMA-032, 050)', () => {
  const crypto = (available = true) => ({
    isEncryptionAvailable: () => available,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/u, ''),
  });

  it('chiffre, relit, ne garde jamais la clé en clair, refuse sans chiffrement', () => {
    const dir = tempDir();
    const store = createSecretStore(dir, () => undefined, crypto() as never);
    store.set('k', 'secret-value');
    expect(readFileSync(path.join(dir, 'secrets.json'), 'utf8')).not.toContain('secret-value');
    expect(store.has!('k')).toBe(true);
    expect(createSecretStore(dir, () => undefined, crypto() as never).get('k')).toBe('secret-value');
    store.set('k', null);
    expect(store.has!('k')).toBe(false);
    expect(() => createSecretStore(dir, () => undefined, crypto(false) as never).set('k', 'x')).toThrow(/Chiffrement système indisponible/);
  });

  it('un fichier illisible est mis de côté et signalé, pas écrasé en silence', () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'secrets.json'), '{ cassé');
    const warn = vi.fn();
    const store = createSecretStore(dir, warn, crypto() as never);
    expect(store.has!('k')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(existsSync(path.join(dir, 'secrets.json.corrupt'))).toBe(true);
  });
});
