import { describe, expect, it } from 'vitest';
import { CORE_MESSAGES, translateCore } from '../../src/shared/i18n';

describe('catalogue partagé du cœur', () => {
  it('garantit deux traductions non vides pour chaque clé', () => {
    for (const [key, translations] of Object.entries(CORE_MESSAGES)) {
      expect(translations, key).toHaveLength(2);
      expect(translations[0].trim(), key + ' fr').not.toBe('');
      expect(translations[1].trim(), key + ' en').not.toBe('');
    }
  });

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

  it('traduit les messages musique, sortie DMX et programmation', () => {
    expect(translateCore('en', 'music.sectionNotFound')).toBe('Section not found');
    expect(translateCore('fr', 'music.trackNotFound')).toBe('Morceau introuvable');
    expect(translateCore('en', 'output.universeNotRouted', { universe: 4 })).toBe('Universe 4 is not routed to this output');
    expect(translateCore('en', 'output.rdmFailed', { reason: 'socket closed' })).toBe('RDM: socket closed');
    expect(translateCore('en', 'programming.cueSceneUnknown', { name: 'Opening' })).toBe('Cue “Opening”: unknown scene');
  });

  it('traduit les erreurs de profils et de patch avec leurs paramètres', () => {
    expect(translateCore('en', 'fixture.reservedBuiltinId', { id: 'generic-par' })).toBe('Profile “generic-par”: identifier is reserved for a built-in profile');
    expect(translateCore('fr', 'fixture.universeCapacityExceeded', { universe: 2, channels: 8, fixtureIndex: 3, fixtureCount: 6 }))
      .toBe('Plus de place dans l’univers 2 pour 8 canaux (projecteur 3/6)');
    expect(translateCore('en', 'fixture.validationFailed', { details: 'Address overlaps fixture A' }))
      .toBe('Validation failed: Address overlaps fixture A');
    expect(translateCore('en', 'fixture.installPlanPdfUnavailable'))
      .toBe('PDF export is unavailable here; the installation plan requires the rendering engine.');
  });

  it('traduit les diagnostics de validation du directeur IA', () => {
    expect(translateCore('en', 'ai.validation.strobeDisabled')).toBe('Strobe is disabled by the safety settings (Settings › Safety)');
    expect(translateCore('en', 'ai.validation.strobeLimited', { hz: 8 })).toBe('Frequency limited to 8 Hz by the safety settings');
    expect(translateCore('en', 'ai.validation.fixturesNoPosition', { fixtures: 'Moving Head 1' })).toBe('No pan/tilt capability (skipped): Moving Head 1');
    expect(translateCore('fr', 'ai.validation.sceneNotFound', { name: 'Opening' })).toBe('Scène « Opening » introuvable');
    expect(translateCore('en', 'ai.validation.noFixtureSupportsAction')).toBe('No targeted fixture supports this action');
  });

  it('préserve le placeholder si un paramètre manque', () => {
    expect(translateCore('en', 'error.invalidCommand')).toBe('Invalid command: {details}');
  });

  it('traduit les libellés des dialogues Electron', () => {
    expect(translateCore('fr', 'dialog.exportMvr')).toBe('Exporter l’implantation (MVR)');
    expect(translateCore('en', 'dialog.exportMvr')).toBe('Export rig (MVR)');
  });
});
