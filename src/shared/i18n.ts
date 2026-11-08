/** Shared message contract used by the core, Electron main process and renderer. */
export type CoreLanguage = 'fr' | 'en';
export type CoreMessageKey =
  | 'error.unauthorizedOrigin'
  | 'error.invalidCommand'
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
  return template.replace(/\\{(\\w+)\\}/gu, (match, name: string) =>
    vars && Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
