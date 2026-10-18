# Changelog

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté
- Intégration continue GitHub Actions sur Windows : messages de commit, typecheck, lint, tests avec couverture de `src/core`, e2e Playwright et paquet.
- `CONTRIBUTING.md`, modèle de PR et ce changelog.
- Tests de composants des espaces Cues, Fixtures, DMX Output et AI Director, branchés sur un vrai `AppService` headless (même validation Zod que le process main).
- Contrat d'actions IA versionné (`AI_ACTIONS_VERSION` = 1) : migrations entre versions, refus explicite d'un contrat plus récent, schéma figé et échantillons par version, test de propriété (2 000 actions aléatoires) sur la validation.
- Banc d'évaluation IA porté de 32 à 175 cas (dont 33 adverses) ; seuils relevés à 98 % (mesuré : reconnaissance 99,3 %, intention 99,2 %, validité 100 %, 0 violation de sécurité).
- Interpréteur local : 13 ambiances nommées (rock, théâtre, mystère, coucher de soleil, sous-marine, glaciale, feu de camp, mariage, Halloween, Noël…), « ambiance … » crée une scène, lavande/lilas, « tempo 140 », « stop les effets », « fade to black », « respirer » / « clignoter doucement » (pulse lent, jamais de strobe), effet fade, « intensité minimale », « divise par deux ».
- Parcours e2e « programmeur → scène → liste de cues → GO » et « sortie réelle armée → STOP OUTPUT ».
- Internationalisation : catalogues `src/renderer/i18n` (français de référence, anglais typé contre lui), langue dans Paramètres › Apparence ; navigation, barre supérieure, barre d'état et console de diagnostic traduites. `npm run lint` refuse tout nouveau texte d'interface en dur (cliquet par fichier, 1 212 textes restants à extraire).
- Campagne matériel (DMX Output › Diagnostics) : mires de test brutes confirmées (signature canal = valeur, balayage, rampe, zéro), chronométrage des reconnexions, rapport de session en Markdown ; protocole et critères dans `docs/HARDWARE.md`.
- Programme bêta : « Envoyer un retour » (problème, idée, compte rendu de show) enregistre un fichier à transmettre, avec diagnostic sans secret ; statistiques d'usage **opt-in**, locales (types de commandes et erreurs par jour, jamais de contenu), consultables et effaçables.
- Feuille de patch exportable (écran Fixtures) : PDF A4 paysage par univers pour l'équipe, ou CSV « ; » UTF-8 pour Excel (protégé contre l'injection de formules).
- Mises à jour automatiques (electron-updater, GitHub Releases) : canal stable ou bêta, téléchargement en arrière-plan, installation à la fermeture uniquement (jamais pendant un show) ; Paramètres › Général affiche la version et l'état.
- Workflow de release sur tag `vX.Y.Z` / `vX.Y.Z-beta.N` : vérifie la version, teste, signe l'installateur si les secrets `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` sont définis, publie.
- Journal persistant : `userData/logs/luma.log` (JSON lines, rotation 2 Mo × 5), survit à un plantage.
- `crashReporter` local (minidumps jamais envoyés) ; exceptions et rejets non gérés, arrêts des processus de rendu journalisés.
- « Exporter un diagnostic… » (Paramètres › Logs) : version, paramètres, état des sorties, journal et minidumps, sans clé, jeton ni contenu du projet.

### Modifié
- Télécommande durcie : interface d'écoute au choix (par défaut toutes, comme avant), jeton échangé contre un cookie HttpOnly puis retiré de l'adresse, 10 jetons faux par minute et par adresse au maximum (429), 30 commandes/s par client, bouton « Nouveau jeton », rappel « réseau privé ».
- `AppService` découpé par domaine (`src/core/app/handlers/*`, `control.ts`, `monitor.ts`, `files.ts`) : 1 400 → 390 lignes, routage des commandes vérifié à la compilation, comportement inchangé.
- `Visualizer.tsx` (1 049 lignes) découpé en `visualizer/StageCanvas.tsx`, `drawStage.ts` (dessin pur), `ScenePanel.tsx`, `sceneCards.tsx` ; `Stage3D.tsx` (763) séparé de sa partie three.js impérative (`stage3d/scene.ts`).
- `npm run lint` refuse tout fichier source de plus de 600 lignes (400 dans `src/core/app`).
- Roadmaps déplacées dans `docs/roadmap/` ; décisions structurantes écrites en ADR (`docs/adr/`).
- Cibles macOS et Linux retirées d'`electron-builder.yml` tant qu'elles ne sont pas construites en CI.
- Tests e2e : rendu WebGL logiciel (SwiftShader) pour tourner sur les machines sans GPU.

### Corrigé
- Erreur de lint commitée (`attributeSchema` inutilisé dans `src/shared/commands.ts`).

## [0.1.0] — 2026-10-18

Première version de développement (prototype).

### Ajouté
- Moteur DMX 40–44 Hz, sorties Art-Net, sACN, Enttec USB Pro/Open, RDM ; contrôle externe MIDI, OSC, LTC ; télécommande web.
- Bibliothèque de projecteurs : import OFL et grandMA2 XML, multi-têtes (`dimmer#n`), blancs chaud/froid et lime, seconde roue de gobos, prisme indexé.
- Directeur IA : interpréteur local et OpenRouter, actions typées validées, aperçu, flash guard, banc d'évaluation ; plan LLM réparé section par section.
- Song-to-show : analyse du morceau, plan par section (couleur, énergie, faisceau ouvert/gobo/prisme/frost), lecture synchronisée.
- Auto-localisation des projecteurs par caméra.
- Scène 2D/3D : formes de plateau, structures, accroches, interprètes, brume, écrans LED, décor, alerte d'éblouissement, panneau « Construire la scène ».
- Onboarding guidé et 10 projets de démonstration.
