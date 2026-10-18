import type { Language } from '.';

/**
 * "What's new" notes shown once at startup after an update, then from the help menu. Newest first: add an entry here
 * at each release (a short, user-facing digest of CHANGELOG.md, not a copy of it).
 */
export interface ReleaseNote { version: string; date: string; items: Record<Language, string[]> }

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.2.0',
    date: '2026-10-18',
    items: {
      fr: [
        'Mises à jour automatiques : téléchargement en arrière-plan, installation à la fermeture uniquement (jamais pendant un show).',
        'Interface disponible en anglais (Paramètres › Apparence).',
        'Import GDTF et export MVR des projecteurs, feuille de patch PDF ou CSV.',
        'Assistant IA local enrichi : 13 ambiances nommées (rock, théâtre, coucher de soleil, Noël…) et nouvelles commandes.',
        'Campagne matériel dans DMX Output › Diagnostics : mires de test et rapport de session.',
        'Programme bêta : « Envoyer un retour » et statistiques d’usage locales, sur option.',
        'Télécommande web plus sûre et « Exporter un diagnostic… » dans Paramètres › Logs.',
      ],
      en: [
        'Automatic updates: downloaded in the background, installed only when the app closes (never during a show).',
        'Interface available in English (Settings › Appearance).',
        'GDTF fixture import and MVR export, patch sheet as PDF or CSV.',
        'Richer local AI assistant: 13 named moods (rock, theatre, sunset, Christmas…) and new commands.',
        'Hardware campaign in DMX Output › Diagnostics: test patterns and session report.',
        'Beta programme: “Send feedback” and opt-in local usage statistics.',
        'Hardened web remote and “Export diagnostics…” in Settings › Logs.',
      ],
    },
  },
];

export const LATEST_NOTES = RELEASE_NOTES[0]!;
