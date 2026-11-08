# Changelog

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté
- Internationalisation : catalogue bilingue partagé pour le cœur, erreurs IPC structurées avec repli français, migration des UserError des handlers (IA, voix, localisation, musique, DMX/RDM, profils, programmation et projets), dialogues natifs Electron localisés selon la langue active et cliquet AST anti-régression.
- Release : prévalidation de la version SemVer, des notes catégorisées « Non publié », des tags Git locaux/distants et de l’existence d’une release GitHub avant toute compilation ou publication.
- Export PDF (feuille de patch et plan d’installation) : rendu depuis un fichier HTML temporaire unique plutôt qu’une URL `data:`, sans limite de longueur d’URL ; nettoyage du répertoire temporaire après impression, y compris en cas d’erreur.
- Construire : bibliothèque d'équipements scéniques en 8 catégories (Machine, Structure, Sonorisation, Instruments, Décor, Interprète, Écran, Accessoires) : line arrays (modules, angles par module, bumper, suspension), caissons, façades, retours, racks ; batterie, cymbales, guitares, basses, amplis, claviers, pianos ; machines à fumée, étincelles, CO2 ; panneaux de fond, arches, rideaux ; régie DJ, consoles, flight-cases, chaises, barrières, passe-câbles ; structures triangulaires, embases, moteurs de levage, toiture. Modèles 3D procéduraux détaillés aux dimensions métriques, avec niveaux de détail et géométries partagées en cache.
- Construire : recherche instantanée dans toute la bibliothèque (mots-clés inclus), favoris et éléments récents, miniatures rendues depuis les modèles 3D, ajout rapide, glisser-déposer, assemblages prêts à poser (portique, toiture, grille de rigging, système de façade, batterie sur praticable).
- Propriétés d'un équipement : réglages propres à son type, masquer / verrouiller, échelle, alignement (axe, nez de scène, lointain, jardin, cour, sol), copie symétrique, accrochage sous une structure, import d'un modèle GLB (repli sur la géométrie procédurale signalé s'il est illisible). Rappel affiché : un assemblage 3D n'est ni un calcul de charge ni une validation de sécurité.
- Assistant de scène : « Ajoute deux line arrays de chaque côté, une batterie au centre arrière… » est traduit en ajouts positionnés sur la scène actuelle, avec aperçu avant application, ambiguïtés et matériel indisponible signalés, une seule étape annulable (Ctrl+Z). La description de l'accueil commençant par « Ajoute… » complète la scène au lieu de la remplacer.
- Écrans : murs LED modulaires (côté de module, coutures visibles) ; structures : section carrée ou triangulaire.
- MA Fixture Share intégré : bouton « MA Fixture Share » (page Fixtures et catalogue Machine de Construire) ouvrant le site dans une fenêtre isolée ; connecté avec votre compte MA, chaque fiche téléchargée (grandMA2 .xml, collection .zip, GDTF) est convertie et ajoutée à la bibliothèque, les modes d'une même machine fusionnés. Les fiches grandMA3 sont refusées avec un message clair.
- Import de profils : sélection multiple et archives .zip (collections du MA Fixture Share) ; un fichier illisible n'interrompt plus l'import des autres.
- Projets de démonstration : les 31 démos reçoivent un décor réaliste issu de la bibliothèque et des murs LED ; les pièces génériques qui imitaient du matériel sont remplacées par le vrai équipement.

## [1.8.0] — 2026-10-22

### Ajouté
- Analyse musicale automatisée avec détection des beats, suivi du tempo et compilation Song-to-Show en une timeline de spectacle.
- Planification des shows par sections, mapping des effets, évaluation de la qualité artistique et comparaison de variantes.
- Refonte de l'espace Stage 3D : workspace de scène, édition des éléments, panneau de scène, commandes et styles dédiés.
- Stage 3D : quatre préréglages de qualité (Édition, Équilibré, Qualité, Présentation), barre d'état enrichie et inspecteur contextuel des propriétés géométriques et photométriques.
- Stage 3D : interface entièrement localisée en français et anglais, avec tests dédiés aux préférences, préréglages, géométries et ressources Three.js.

### Modifié
- Directeur IA : refonte du pipeline de conversation et de génération de propositions ; contrat d'actions v3, contraintes de requête vérifiées et option d'application automatique désactivée par défaut.
- Assistant IA : prompts configurables, onglet Assistant dans les paramètres et clarification explicite des demandes ambiguës.
- Analyse audio et Song-to-Show : enrichissement de l'analyse, du suivi de tempo et de la couverture vocale.

### Corrigé
- Directeur IA : correction des négations, exclusions de projecteurs, ajustements relatifs d'intensité, références contextuelles et actions refusées après validation.
- Stage 3D : libération des géométries Three.js partagées, correction de la barre d'état et ajout des libellés accessibles Déplacer/Pivoter.

## [1.7.0] — 2026-10-21

### Ajouté
- Assistant vocal Gemini en temps réel, avec session audio, outils de contrôle du moteur et bouton d'accès depuis la barre supérieure.
- Gestion des licences : clés, niveaux d'accès et restrictions de fonctionnalités selon le niveau de licence.
- Console Pan/Tilt : sélection de groupes et contrôle visuel des mouvements des projecteurs.
- Détection des changements de tempo et meilleure prise en charge des phrases vocales courtes dans l'analyse musicale.

### Modifié
- Console Simplifiée : feuille de style dédiée et option d'activation au prochain démarrage avec confirmation lors du retour à l'interface complète.
- Documentation du projet mise à jour pour présenter l'assistant vocal et la structure du dépôt.

## [1.6.0] — 2026-10-21

### Ajouté
- Analyse musicale : détection de signature rythmique, analyse de structure adaptée à la mesure et cartographie locale du tempo avec interpolation BPM synchronisée aux beats.
- Actions rapides : gestion des catégories, réglage de la taille des tuiles et ciblage des groupes ou projecteurs.

### Modifié
- Analyse audio : agrégations plus efficaces, choix des faisceaux mieux corrélé à la brillance spectrale et suivi des caractéristiques du morceau.
- Console Live : liste des projecteurs épinglable ou repliable dans un rail déployé au survol, avec préférence persistante.
- Accueil : retour au Dashboard au premier lancement et mémorisation de la dernière page visitée.
- E2E : délais adaptés au rendu logiciel SwiftShader.

### Corrigé
- Sortie DMX réelle : le désarmement reste effectif pendant une reconnexion ou l'ouverture du transport ; l'émission exige explicitement l'armement.
- MIDI : les commandes mappées sur un contrôleur continu se déclenchent au front montant du seuil, et non à chaque valeur supérieure au seuil.
- Performances du renderer : animations Aurora, scan-line et LED isolées sur des couches composées afin d'éviter les repeints complets de la fenêtre.
- Qualité : corrections de tests sensibles aux fins de ligne, catalogue de démos, erreurs ESLint et extraction de fichiers trop volumineux.
- Internationalisation : amélioration du contrôle des textes d'interface et traduction des libellés de groupes et de cases à cocher.

## [1.5.0] — 2026-10-19

### Modifié
- Écran de démarrage : simplification de la gestion de la vidéo du splash screen et amélioration de la gestion de la fenêtre Electron.

### Corrigé
- Stage 3D : suppression du rendu double-face inutile sur le matériau des ailes.

## [1.4.0] — 2026-10-19

### Ajouté
- Suggestions d'intentions assistées par IA pour les morceaux de musique.
- Export du plan d'installation des projecteurs, avec analyse des matériaux et de la puissance.
- Démo de concert en stade avec 72 projecteurs et configuration d'arène.

### Modifié
- Visualiseur : intégration du mode Stage 3D dans la page Visualizer avec bascule 2D/3D, au lieu d'une page indépendante.
- Fixtures : amélioration de la sélection multiple et de la sélection globale des projecteurs.

## [1.3.0] — 2026-10-19

### Ajouté
- Song-to-Show : génération dramaturgique de spectacles, couleurs par couche, positions de lyres, gestion de la fin de show et vitesse adaptée au jeu musical.
- Bibliothèque de projecteurs : transcription de profils depuis des photos de manuels, roues de couleurs et édition de profils.
- IA : contrat d'actions v2, fil de conversation, budgets et suivi des coûts OpenRouter, description spatiale du kit et profils enrichis.
- Contrôle : télécommande OSC avec adresses autorisées, retours d'état et alertes ; console Live détachable et améliorations de contrôle.
- Actions rapides : page dédiée, édition, catégories et exclusion mutuelle des actions.
- Console : panneaux déplaçables, mise en page multi-colonnes et nommage personnalisé des palettes.
- Fiabilité : annulation/rétablissement des éditions, arrêt et reprise de l'IA, récupération au démarrage, stockage durable et reprise après erreurs de fournisseur.

### Modifié
- Moteur : remplacement des cues après un saut dans la timeline et maintien du DMX en état d'erreur.
- Paramètres : persistance améliorée, gestion des secrets et commande « tout relâcher ».
- Song-to-Show : lecteur persistant avec pause, position et arrêt depuis les autres pages ; historique des intentions et curseurs d'ambiance.

## [1.2.0] — 2026-10-18

### Ajouté
- Écran « Quoi de neuf ? » présentant les nouveautés de version et accessible depuis l'accueil.
- Amélioration du parcours d'accueil et de l'onboarding, avec mémorisation des préférences d'affichage.

## [1.1.0] — 2026-10-18

### Corrigé
- Analyse audio : assainissement des trames audio avant traitement.
- Interpréteur de scène depuis le texte : amélioration de l'analyse du français et de la conversion des demandes en éléments de scène.

### Modifié
- Dashboard : regroupement sémantique des cartes en sections titrées pour les lecteurs d'écran.
- Navigation : la carte Projecteurs ouvre directement le patch.

## [1.0.0] — 2026-10-18

### Ajouté
- Première release stable 1.0 : écran de démarrage, identité visuelle et icône de fenêtre.
- Onboarding et catalogue de démonstrations enrichi pour découvrir les capacités de l'application.
- Préparation de la distribution Windows avec configuration Electron Builder et script de release.

### Modifié
- Configuration de build Electron/Vite et règles de qualité adaptées au projet.

## [0.4.0] — 2026-10-18

### Ajouté
- Console Live : palettes rapides organisées par famille de projecteurs.
- Thème visuel futuriste animé et composants d'interface harmonisés.

### Modifié
- Refonte UX des vues Dashboard, Console Live, Cues, Programmer, Musique, Paramètres et Visualizer.
- Éditeur de sections musicales et panneau de scène améliorés.
- Localisation française et anglaise étendue aux écrans et composants concernés.

## [0.3.0] — 2026-10-18

### Modifié
- Documentation du projet enrichie avec captures d'écran des principaux parcours : Dashboard, console, cues, moniteur DMX, IA, analyse audio, Song-to-Show et visualiseur 3D.
- Scénarios E2E complétés pour accompagner les parcours documentés.

## [0.2.0] — 2026-10-18

Passage au « niveau 2 » (docs/RAPPORT-NIVEAU-2.md) : fondations, maintenabilité, outils de distribution et de bêta.

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
- Export **MVR** (écran Fixtures) : patch, adresses absolues et positions (mm, projecteurs suspendus retournés) pour Capture, Vectorworks, grandMA3 ; types référencés « Fabricant@Modèle.gdtf ».
- Import **GDTF** (`.gdtf`) : tous les modes, 16 bits, fonctions et plages (strobe en Hz), roues avec couleurs CIE, canaux de contrôle dangereux, pixels en cellules. Lecteur/écrivain ZIP interne, sans dépendance.
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
