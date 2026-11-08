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

  it('traduit les erreurs de validation et injecte le détail', () => {
    expect(translateCore('fr', 'error.invalidCommand', { details: 'type requis' })).toBe('Commande invalide : type requis');
    expect(translateCore('en', 'error.invalidCommand', { details: 'type is required' })).toBe('Invalid command: type is required');
  });

  it('traduit les erreurs IA paramétrées', () => {
    expect(translateCore('fr', 'ai.monthlyBudgetReached', { spent: '12.50', budget: '10.00' }))
      .toBe('Budget IA mensuel atteint (12.50 $ sur 10.00 $) : modifiable dans Paramètres › IA');
    expect(translateCore('en', 'ai.monthlyBudgetReached', { spent: '12.50', budget: '10.00' }))
      .toBe('Monthly AI budget reached ($12.50 of $10.00); change it in Settings › AI');
    expect(translateCore('en', 'ai.providerUnavailable', { reason: 'timeout' }))
      .toBe('AI provider unavailable: timeout');
  });

  it('traduit les refus du service vocal et de la localisation', () => {
    expect(translateCore('en', 'voice.geminiKeyMissing')).toBe('Gemini API key missing: enter it in Settings › AI');
    expect(translateCore('en', 'locate.blackoutActive')).toBe('Disable blackout so the camera can see the fixtures');
    expect(translateCore('fr', 'locate.noSequence')).toBe('Aucune séquence de localisation en cours');
  });

  it('préserve le placeholder si un paramètre manque', () => {
    expect(translateCore('en', 'error.invalidCommand')).toBe('Invalid command: {details}');
  });

  it('traduit les libellés des dialogues Electron', () => {
    expect(translateCore('fr', 'dialog.exportMvr')).toBe('Exporter l’implantation (MVR)');
    expect(translateCore('en', 'dialog.exportMvr')).toBe('Export rig (MVR)');
  });
});
