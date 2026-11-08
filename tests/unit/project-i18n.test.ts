import { describe, expect, it } from 'vitest';
import { parseProject, ProjectLoadError } from '../../src/core/project/format';

describe('erreurs de chargement de projet internationalisables', () => {
  it('attache une clé et la raison à un JSON corrompu', () => {
    try {
      parseProject('{ invalid');
      throw new Error('Expected parseProject to reject invalid JSON');
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectLoadError);
      expect(error).toMatchObject({ messageKey: 'project.corruptJson' });
      expect((error as ProjectLoadError).messageVars?.reason).toEqual(expect.any(String));
    }
  });

  it('identifie un fichier qui ne correspond pas au format Luma', () => {
    try {
      parseProject(JSON.stringify({ format: 'other', version: 3 }));
      throw new Error('Expected parseProject to reject a foreign file');
    } catch (error) {
      expect(error).toMatchObject({ messageKey: 'project.invalidFile' });
    }
  });

  it('fournit les versions pour expliquer un format trop récent', () => {
    try {
      parseProject(JSON.stringify({ format: 'luma-ai-dmx-project', version: 999 }));
      throw new Error('Expected parseProject to reject a future version');
    } catch (error) {
      expect(error).toMatchObject({
        messageKey: 'project.versionTooNew',
        messageVars: { version: 999, supported: expect.any(Number) },
      });
    }
  });
});
