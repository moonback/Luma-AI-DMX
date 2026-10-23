# Changelog

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté
- Construire : bibliothèque d'équipements scéniques en 8 catégories (Machine, Structure, Sonorisation, Instruments, Décor, Interprète, Écran, Accessoires) : line arrays (modules, angles par module, bumper, suspension), caissons, façades, retours, racks ; batterie, cymbales, guitares, basses, amplis, claviers, pianos ; machines à fumée, étincelles, CO2 ; panneaux de fond, arches, rideaux ; régie DJ, consoles, flight-cases, chaises, barrières, passe-câbles ; structures triangulaires, embases, moteurs de levage, toiture. Modèles 3D procéduraux détaillés aux dimensions métriques, avec niveaux de détail et géométries partagées en cache.
- Construire : recherche instantanée dans toute la bibliothèque (mots-clés inclus), favoris et éléments récents, miniatures rendues depuis les modèles 3D, ajout rapide, glisser-déposer, assemblages prêts à poser (portique, toiture, grille de rigging, système de façade, batterie sur praticable).
- Propriétés d'un équipement : réglages propres à son type, masquer / verrouiller, échelle, alignement (axe, nez de scène, lointain, jardin, cour, sol), copie symétrique, accrochage sous une structure, import d'un modèle GLB (repli sur la géométrie procédurale signalé s'il est illisible). Rappel affiché : un assemblage 3D n'est ni un calcul de charge ni une validation de sécurité.
- Assistant de scène : « Ajoute deux line arrays de chaque côté, une batterie au centre arrière… » est traduit en ajouts positionnés sur la scène actuelle, avec aperçu avant application, ambiguïtés et matériel indisponible signalés, une seule étape annulable (Ctrl+Z). La description de l'accueil commençant par « Ajoute… » complète la scène au lieu de la remplacer.
- Écrans : murs LED modulaires (côté de module, coutures visibles) ; structures : section carrée ou triangulaire.
- Projets de démonstration : les 31 démos reçoivent un décor réaliste issu de la bibliothèque (line arrays suspendus, caissons, batteries, amplis, guitares, claviers, pianos, consoles de régie, barrières, machines à effets, arches, toiles, chaises et pupitres) et des murs LED ; les pièces génériques qui imitaient du matériel (boîte « piano », « mur d'amplis », rideau « écran géant »…) sont remplacées par le vrai équipement.
- Stage 3D : 4 préréglages de qualité de rendu en un clic (Édition, Équilibré, Qualité, Présentation).
- Stage 3D : barre d'état enrichie (mode Orbite/Édition, compteur de projecteurs, grille active, indicateur de framerate déplacé depuis la barre d'outils).
- Stage 3D : inspecteur contextuel escamotable affichant les propriétés géométriques et photométriques des projecteurs ou éléments de scène sélectionnés (position, hauteur, rotation/pan/tilt, couleur, intensité).
- Stage 3D : internationalisation complète de l'interface 3D (barre d'outils, dialogues de rendu, réglages, menus et aide) en français et anglais.
- Stage 3D : suite de tests unitaires dédiés `tests/unit/stage3d.test.ts` (persistance des préférences, préréglages de rendu, libération des géométries partagées, géométrie du plateau).

### Modifié
- Console Live : la liste des projecteurs est de nouveau visible par défaut (colonne épinglée) ; un bouton la replie en rail qui se déplie au survol, et le choix est mémorisé sur la machine.
- La page d'accueil au premier lancement redevient le Dashboard (« Actions rapides » vide s'ouvrait par défaut depuis un commit sans rapport) ; la dernière page visitée reste mémorisée.
- E2E : délais Playwright doublés (test 120 s, attente 10 s) car l'application tourne sous rendu logiciel SwiftShader dans ces tests.

### Corrigé
- Démos « Son et lumière sur la cathédrale » et « Match de basket » : décors hors des bornes du format (tours de 26 m, parquet de 2 cm) qui empêchaient leur ouverture ; démo stade : praticables et micros posés sous le plancher de la grande scène.
- Stage 3D : libération mémoire systématique des géométries Three.js partagées (`disposeGeometries()`) au démontage de la vue 3D.
- Stage 3D : correction de la contrainte CSS `right: 290px` sur `.stage3d-status` qui tronquait inutilement la barre d'état.
- Accessibilité Stage 3D : ajout des `aria-label` manquants sur les boutons d'outils Déplacer et Pivoter.
- Thème animé : la couche « aurora », la scan-line de la barre supérieure et la respiration des LED repeignaient toute la fenêtre à chaque image (2 i/s sous rendu logiciel, page IA et vue 3D figées en E2E) ; elles vivent maintenant sur leur propre couche composée (27 i/s mesurés, mêmes visuels).
- MIDI : une commande mappée sur un contrôleur continu (CC) ne se déclenche plus à chaque message ≥ 50 % mais au front montant (un fader qui monte envoyait une rafale de GO). Test : `tests/components/midi-edge.test.tsx`.
- E2E : la liste des projecteurs de la Console Live est un rail qui ne se déplie qu'au survol depuis les panneaux déplaçables ; les scénarios la survolent avant de cliquer ; galerie des démos comptée depuis le catalogue ; vérification F11 de la fenêtre 3D détachée (LUMA-024).
- Sûreté de l'armement (LUMA-036) : un désarmement pendant une reconnexion ou pendant l'ouverture du transport laissait la sortie réelle repasser « prête » et émettre ; `OutputAdapter` reste désarmé dans ces deux courses et `OutputManager.sendFrames` exige aussi l'armement. Tests de régression : `tests/unit/protocols.test.ts`.
- Porte qualité rouge : test du contrat IA sensible aux fins de ligne CRLF (`core.autocrlf`), test des démos figé à 20 projets (21 depuis la démo stade), deux erreurs ESLint (import et variable inutilisés).
- `npm run lint` : quatre fichiers au-dessus de la limite de 600 lignes découpés sans changement de comportement (`QuickActionsParts.tsx`, `model/primitives.ts`, `music/intent.ts`, `demo/catalogStadium.ts`).
- Cliquet i18n : les génériques `useState<…>` et les commentaires ne sont plus comptés comme du texte d'interface ; libellés des groupes de navigation et cases à cocher du patch passés par les catalogues (fr / en).

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
