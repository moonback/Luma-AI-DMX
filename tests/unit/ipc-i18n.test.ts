import { describe, expect, it, vi } from 'vitest';
import { UserError } from '../../src/core/app/shared';
import { handleCommand } from '../../src/main/ipc';

describe('messages structurés du canal IPC', () => {
  const logger = { error: vi.fn() };
  const service = (execute: () => Promise<unknown>) => ({ execute, logger });

  it('retourne une clé traduisible pour une erreur utilisateur', async () => {
    const reply = await handleCommand(
      service(async () => { throw new UserError('Scène introuvable', 'programming.sceneNotFound'); }) as never,
      { type: 'project.get' },
      'file:///index.html',
      undefined,
    );
    expect(reply).toEqual({
      ok: false,
      error: 'Scène introuvable',
      message: { key: 'programming.sceneNotFound', vars: undefined },
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('traduit le refus d’une origine non autorisée sans exécuter la commande', async () => {
    const execute = vi.fn(async () => undefined);
    const reply = await handleCommand(service(execute) as never, { type: 'project.get' }, 'https://example.com', undefined);
    expect(reply).toEqual({ ok: false, error: 'Origine non autorisée', message: { key: 'error.unauthorizedOrigin' } });
    expect(execute).not.toHaveBeenCalled();
  });

  it('conserve le texte de repli pour les erreurs sans clé', async () => {
    const reply = await handleCommand(
      service(async () => { throw new UserError('Ancien message non migré'); }) as never,
      { type: 'project.get' },
      'file:///index.html',
      undefined,
    );
    expect(reply).toEqual({ ok: false, error: 'Ancien message non migré' });
  });
});
