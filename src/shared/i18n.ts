/** Shared message contract used by the core, Electron main process and renderer. */
export type CoreLanguage = 'fr' | 'en';
export type CoreMessageKey =
  | 'error.unauthorizedOrigin'
  | 'error.invalidCommand'
  | 'programming.paletteNotFound'
  | 'programming.fixtureNoProgrammerValues'
  | 'programming.noValuesOfType'
  | 'programming.programmerEmpty'
  | 'programming.sceneNotFound'
  | 'programming.effectNotFound'
  | 'programming.timelineNotFound'
  | 'fixture.profileInUse'
  | 'dialog.openProject'
  | 'dialog.saveProject'
  | 'dialog.importProfiles'
  | 'dialog.importProfilesAll'
  | 'dialog.exportProfiles'
  | 'dialog.exportPatchSheet'
  | 'dialog.exportInstallPlan'
  | 'dialog.exportMvr'
  | 'dialog.saveFeedback'
  | 'dialog.exportDiagnostic';

export interface CoreMessage {
  key: CoreMessageKey;
  vars?: Record<string, string | number>;
}

const messages: Record<CoreLanguage, Record<CoreMessageKey, string>> = {
  fr: {
    'error.unauthorizedOrigin': 'Origine non autorisée',
    'error.invalidCommand': 'Commande invalide : {details}',
    'programming.paletteNotFound': 'Palette introuvable',
    'programming.fixtureNoProgrammerValues': 'Ce projecteur n’a aucune valeur dans le programmeur',
    'programming.noValuesOfType': 'Aucune valeur de ce type dans le programmeur pour ce projecteur',
    'programming.programmerEmpty': 'Le programmeur est vide : réglez des projecteurs dans la Live Console avant d’enregistrer.',
    'programming.sceneNotFound': 'Scène introuvable',
    'programming.effectNotFound': 'Effet introuvable',
    'programming.timelineNotFound': 'Timeline introuvable',
    'fixture.profileInUse': 'Profil utilisé par {count} projecteur(s)',
    'dialog.openProject': 'Ouvrir un projet',
    'dialog.saveProject': 'Enregistrer le projet',
    'dialog.importProfiles': 'Importer des profils',
    'dialog.importProfilesAll': 'Profils (Luma, GDTF, grandMA2, collections .zip)',
    'dialog.exportProfiles': 'Exporter des profils',
    'dialog.exportPatchSheet': 'Exporter la feuille de patch',
    'dialog.exportInstallPlan': 'Exporter le plan d’installation',
    'dialog.exportMvr': 'Exporter l’implantation (MVR)',
    'dialog.saveFeedback': 'Enregistrer le retour',
    'dialog.exportDiagnostic': 'Exporter un diagnostic',
  },
  en: {
    'error.unauthorizedOrigin': 'Unauthorized origin',
    'error.invalidCommand': 'Invalid command: {details}',
    'programming.paletteNotFound': 'Palette not found',
    'programming.fixtureNoProgrammerValues': 'This fixture has no values in the programmer',
    'programming.noValuesOfType': 'No values of this type in the programmer for this fixture',
    'programming.programmerEmpty': 'The programmer is empty: set fixtures in the Live Console before recording.',
    'programming.sceneNotFound': 'Scene not found',
    'programming.effectNotFound': 'Effect not found',
    'programming.timelineNotFound': 'Timeline not found',
    'fixture.profileInUse': 'Profile is used by {count} fixture(s)',
    'dialog.openProject': 'Open a project',
    'dialog.saveProject': 'Save project',
    'dialog.importProfiles': 'Import profiles',
    'dialog.importProfilesAll': 'Profiles (Luma, GDTF, grandMA2, .zip collections)',
    'dialog.exportProfiles': 'Export profiles',
    'dialog.exportPatchSheet': 'Export patch sheet',
    'dialog.exportInstallPlan': 'Export installation plan',
    'dialog.exportMvr': 'Export rig (MVR)',
    'dialog.saveFeedback': 'Save feedback',
    'dialog.exportDiagnostic': 'Export diagnostics',
  },
};

export function translateCore(language: CoreLanguage, key: CoreMessageKey, vars?: CoreMessage['vars']): string {
  const template = messages[language][key];
  return template.replace(/\{(\w+)\}/gu, (match, name: string) =>
    vars && Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
