import { describe, expect, it } from 'vitest';
import { translateCore } from '../../src/shared/i18n';

describe('catalogue partagé du cœur', () => {
  it('fournit les messages en français et en anglais', () => {
    expect(translateCore('fr', 'error.unauthorizedOrigin')).toBe('Origine non autorisée');
    expect(translateCore('en', 'error.unauthorizedOrigin')).toBe('Unauthorized origin');
  });

  it('interpole les paramètres sans perdre les valeurs numériques', () => {
    expect(translateCore('fr', 'fixture.profileInUse', { count: 3 })).toBe('Profil utilisé par 3 projecteur(s)');
    expect(translateCore('en', 'fixture.profileInUse', { count: 3 })).toBe('Profile is used by 3 fixture(s)');
  });

  it('préserve le placeholder si un paramètre manque', () => {
    expect(translateCore('en', 'error.invalidCommand')).toBe('Invalid command: {details}');
  });

  it('traduit les libellés des dialogues Electron', () => {
    expect(translateCore('fr', 'dialog.exportMvr')).toBe('Exporter l’implantation (MVR)');
    expect(translateCore('en', 'dialog.exportMvr')).toBe('Export rig (MVR)');
  });
});
