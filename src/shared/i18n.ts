/** Shared, renderer-safe catalogue for messages produced by the core and Electron main process. */
export type CoreLanguage = 'fr' | 'en';

export const CORE_MESSAGES = {
  'error.unauthorizedOrigin': ['Origine non autorisée', 'Unauthorized origin'],
  'error.invalidCommand': ['Commande invalide : {details}', 'Invalid command: {details}'],
  'programming.paletteNotFound': ['Palette introuvable', 'Palette not found'],
  'programming.fixtureNoProgrammerValues': ['Ce projecteur n’a aucune valeur dans le programmeur', 'This fixture has no values in the programmer'],
  'programming.noValuesOfType': ['Aucune valeur de ce type dans le programmeur pour ce projecteur', 'This fixture has no programmer values of this type'],
  'programming.programmerEmpty': ['Le programmeur est vide : réglez des projecteurs dans la Live Console avant d’enregistrer.', 'The programmer is empty: set fixtures in the Live Console before recording.'],
  'programming.sceneNotFound': ['Scène introuvable', 'Scene not found'],
  'programming.effectNotFound': ['Effet introuvable', 'Effect not found'],
  'programming.timelineNotFound': ['Timeline introuvable', 'Timeline not found'],
  'fixture.profileInUse': ['Profil utilisé par {count} projecteur(s)', 'Profile is used by {count} fixture(s)'],
  'dialog.openProject': ['Ouvrir un projet', 'Open a project'],
  'dialog.saveProject': ['Enregistrer le projet', 'Save project'],
  'dialog.importProfiles': ['Importer des profils', 'Import profiles'],
  'dialog.importProfilesSingle': ['Profils (Luma, GDTF, grandMA2)', 'Profiles (Luma, GDTF, grandMA2)'],
  'dialog.importProfilesAll': ['Profils (Luma, GDTF, grandMA2, collections .zip)', 'Profiles (Luma, GDTF, grandMA2, .zip collections)'],
  'dialog.exportProfiles': ['Exporter des profils', 'Export profiles'],
  'dialog.exportPatchSheet': ['Exporter la feuille de patch', 'Export patch sheet'],
  'dialog.filterSpreadsheet': ['Tableur (CSV)', 'Spreadsheet (CSV)'],
  'dialog.filterPdf': ['PDF', 'PDF'],
  'dialog.exportInstallPlan': ['Exporter le plan d’installation', 'Export installation plan'],
  'dialog.exportMvr': ['Exporter l’implantation (MVR)', 'Export rig (MVR)'],
  'dialog.filterMvr': ['My Virtual Rig', 'My Virtual Rig'],
  'dialog.saveFeedback': ['Enregistrer le retour', 'Save feedback'],
  'dialog.filterFeedback': ['Retour', 'Feedback'],
  'dialog.exportDiagnostic': ['Exporter un diagnostic', 'Export diagnostics'],
  'dialog.filterDiagnostic': ['Diagnostic', 'Diagnostic'],
  'dialog.quitSave': ['Enregistrer', 'Save'],
  'dialog.quitWithoutSaving': ['Quitter sans enregistrer', 'Quit without saving'],
  'dialog.cancel': ['Annuler', 'Cancel'],
  'dialog.saveAs': ['Enregistrer sous…', 'Save As…'],
  'dialog.unsavedChanges': ['Le projet contient des modifications non enregistrées.', 'The project has unsaved changes.'],
  'dialog.saveFailed': ['L’enregistrement a échoué.', 'Saving failed.'],
} as const;

export type CoreMessageKey = keyof typeof CORE_MESSAGES;
export interface CoreMessage {
  key: CoreMessageKey;
  vars?: Record<string, string | number>;
}

export function translateCore(language: CoreLanguage, key: CoreMessageKey, vars?: CoreMessage['vars']): string {
  const template = CORE_MESSAGES[key][language === 'en' ? 1 : 0] as string;
  return template.replace(/\{(\w+)\}/gu, (match, name: string) =>
    vars && Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
