import { describe, expect, it } from 'vitest';
import { translateCore } from '../../src/shared/i18n';

describe('catalogue partagé du cœur', () => {
  it('traduit les refus de sécurité dans les deux langues', () => {
    expect(translateCore('fr', 'error.unauthorizedOrigin')).toBe('Origine non autorisée');
    expect(translateCore('en', 'error.unauthorizedOrigin')).toBe('Unauthorized origin');
  });

  it('traduit les erreurs de validation et injecte les paramètres', () => {
    expect(translateCore('fr', 'error.invalidCommand', { details: 'type requis' })).toBe('Commande invalide : type requis');
    expect(translateCore('en', 'error.invalidCommand', { details: 'type is required' })).toBe('Invalid command: type is required');
  });

  it('préserve un paramètre absent au lieu de supprimer son placeholder', () => {
    expect(translateCore('en', 'error.invalidCommand')).toBe('Invalid command: {details}');
  });

  it('expose des titres natifs localisés', () => {
    expect(translateCore('fr', 'dialog.exportMvr')).toBe('Exporter l’implantation (MVR)');
    expect(translateCore('en', 'dialog.exportMvr')).toBe('Export rig (MVR)');
  });
});
