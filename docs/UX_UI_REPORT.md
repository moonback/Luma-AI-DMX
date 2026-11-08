# Rapport d'amélioration UX/UI — Luma AI DMX

**Périmètre :** Dashboard, Live Console, Song-to-Show, Stage Visualizer 3D, bibliothèque de fixtures, contenus de démonstration et composants React réutilisables.  
**Référence fonctionnelle :** README 1.9.0 et CHANGELOG de la branche analysée.  
**Nature du document :** recommandations de conception et d'évolution ; elles ne prétendent pas décrire des composants déjà implémentés.

## 1. Synthèse exécutive

Luma réunit des usages distincts : préparation du show, programmation, exploitation LIVE, visualisation, analyse musicale et assistance IA. Le principal enjeu UX est de rendre ces domaines cohérents sans surcharger l'opérateur.

Les priorités recommandées :

1. Rendre l'état opérationnel immédiatement compréhensible : SIMULATION/LIVE, univers actifs, armement, transport et STOP.
2. Séparer clairement préparation, édition et exploitation pour limiter les manipulations accidentelles.
3. Réduire les changements de contexte entre patch, console, cues et visualiseur.
4. Exposer les diagnostics et la provenance des données sans encombrer les écrans principaux.
5. Standardiser les composants de sélection, d'inspection, de confirmation et de monitoring.

## 2. Écrans et workflows

### 2.1 Dashboard

**Problème à résoudre :** le Dashboard doit servir de poste de situation et non devenir un agrégat de cartes concurrentes.

Recommandations :
- Créer une hiérarchie stable : état du show, santé des sorties, progression du projet, raccourcis et activité récente.
- Regrouper les indicateurs en trois niveaux : critique (sortie, STOP, défaut), opérationnel (univers, fixtures, cues) et informatif (projet, activité, aide).
- Afficher une carte « Readiness » calculée à partir de contrôles explicites : patch sans conflit, profils présents, sorties configurées, transports disponibles, projet sauvegardé.
- Chaque alerte doit conduire à l'écran et à l'élément exact à corriger.
- Permettre de personnaliser la visibilité des sections sans masquer les alertes de sécurité.
- Ajouter un état vide orienté action : créer projet, ouvrir démo, importer fixtures.
- Prévoir une densité compacte pour les écrans de régie et une densité confortable pour la préparation.

**Critères d'acceptation proposés :**
- Les défauts bloquants sont visibles sans scroll sur une fenêtre desktop standard.
- Une alerte ouvre le diagnostic ciblé en une action.
- Les préférences de visibilité ne peuvent pas désactiver les indicateurs de sécurité obligatoires.

### 2.2 Live Console

**Problème à résoudre :** maintenir la vitesse d'accès aux paramètres sans ambiguïté entre sélection d'une fixture et édition de ses valeurs.

Recommandations :
- Conserver le clic simple pour ouvrir directement la fiche de contrôle d'une machine.
- Introduire un mode de sélection multiple explicite, visible et persistant tant qu'il est activé.
- Distinguer visuellement la fixture active, la sélection multiple, les fixtures verrouillées et celles sans communication connue.
- Ajouter une barre contextuelle : nombre sélectionné, groupe, tout sélectionner, inverser, effacer, désélectionner.
- Proposer des panneaux de paramètres par famille : intensité, couleur, position, faisceau, effets.
- Prévoir des contrôles numériques précis en complément des sliders.
- Afficher les valeurs DMX brutes et les valeurs normalisées dans un inspecteur repliable.
- Permettre l'épinglage de fixtures favorites et la mémorisation de layouts par poste opérateur.
- Mettre en évidence le contrôle manuel prioritaire et l'état du programmeur.

**Critères d'acceptation proposés :**
- Une fixture s'ouvre au premier clic hors mode sélection.
- En mode sélection, clic et sélection par plage ne déclenchent jamais l'ouverture de la fiche.
- La sortie de ce mode ne modifie aucune valeur DMX.
- Toutes les commandes restent utilisables au clavier.

### 2.3 Timeline Song-to-Show

**Problème à résoudre :** aider l'utilisateur à comprendre le rapport entre la structure musicale, les intentions artistiques et les actions lumière.

Recommandations :
- Synchroniser précisément la tête de lecture, les beats, mesures, sections et cues.
- Utiliser des pistes séparées pour scènes, effets, mouvements, accents et annotations.
- Distinguer les événements détectés automatiquement des corrections manuelles.
- Ajouter un score de confiance pour tempo, sections et détection vocale ; ne jamais présenter une estimation comme une vérité.
- Proposer zoom horizontal, zoom vertical, navigation par mesure et raccourcis de transport.
- Permettre le verrouillage d'une section et la régénération locale des sections non verrouillées.
- Afficher les dépendances : une section utilise telle scène, tel groupe et tel effet.
- Ajouter une comparaison A/B de variantes avec écoute au même timecode.
- Prévoir une prévisualisation sans émission DMX réelle.

**Critères d'acceptation proposés :**
- La tête de lecture reste synchronisée après zoom, scroll et changement de page.
- Une régénération ne modifie jamais les sections verrouillées.
- Les événements générés restent identifiables et annulables.

### 2.4 Stage Visualizer 3D

**Problème à résoudre :** conserver un espace de conception riche sans ralentir les opérations de sélection et d'édition.

Recommandations :
- Structurer l'écran autour de la vue, d'un outliner hiérarchique et d'un inspecteur contextuel.
- Ajouter des filtres de visibilité par catégorie : fixtures, truss, décor, audio, accessoires.
- Proposer des vues orthographiques avec grilles, axes, aimantation et unités visibles.
- Afficher les collisions géométriques et les éléments hors scène comme avertissements, sans prétendre effectuer un calcul de structure.
- Séparer les réglages photométriques simulés des dimensions physiques.
- Fournir des modes de rendu « édition », « performance » et « présentation » avec indicateurs de coût.
- Ajouter un overlay de performance : FPS, frame time, draw calls, géométries et mémoire estimée.
- Prévoir une sélection synchronisée entre scène 3D, patch et Live Console.
- Permettre des snapshots caméra nommés et partageables avec le projet.

**Critères d'acceptation proposés :**
- La sélection d'un élément 3D identifie la même entité dans l'outliner et l'inspecteur.
- Le mode performance réduit les détails sans modifier les données du projet.
- Les avertissements de rigging indiquent explicitement qu'ils ne constituent pas une validation de sécurité.

## 3. Contenus et données

### 3.1 Bibliothèque d'équipements

Évolutions recommandées :
- Ajouter des métadonnées normalisées : fabricant, modèle, catégorie, source, version, date d'import, auteur et empreinte du fichier.
- Distinguer les profils officiels, communautaires, importés et fictifs.
- Ajouter un état de validation : non vérifié, vérifié par comparaison au manuel, testé sur matériel.
- Afficher les différences entre versions de profils.
- Ajouter des tags de fonctions : wash, spot, beam, strobe, pixel bar, blinder, dimmer.
- Fournir une recherche tolérante aux variantes de nom et aux références fabricant.
- Conserver les fichiers source et le rapport de conversion pour les imports GDTF/OFL/XML.
- Permettre une validation de patch avant ajout : canaux, modes, fonctions dangereuses et collisions d'adresses.

### 3.2 Profils de projecteurs

Chaque profil devrait pouvoir exposer :
- modes DMX et empreinte de version ;
- fonctions, canaux, plages et valeurs par défaut ;
- résolution 8/16 bits et relations coarse/fine ;
- fonctions spéciales et plages dangereuses ;
- géométrie et paramètres de faisceau, avec provenance ;
- comportement des cellules/pixels ;
- notes de validation et compatibilité logicielle.

Un profil importé ne doit jamais être qualifié de « certifié » par le seul fait qu'il est lisible ou convertible.

### 3.3 Préréglages de démonstration

Recommandations :
- Organiser les démos par type de prestation, taille de rig, difficulté et objectif pédagogique.
- Ajouter un scénario guidé avec étapes : patch, groupes, palette, cue, effet, sortie virtuelle, visualiseur.
- Fournir une version courte et une version complète d'un même show.
- Inclure des démos de diagnostic : fixture mal patchée, univers indisponible, transport déconnecté, profil incomplet.
- Ajouter des démos accessibles sans clé IA et sans connexion réseau.
- Afficher le niveau de difficulté, la durée de découverte et les fonctionnalités illustrées.
- Maintenir des données fictives clairement identifiées et éviter les références commerciales trompeuses.

## 4. Composants UI React réutilisables

Les composants suivants sont des propositions de design system. Ils doivent être accessibles, localisés, pilotables au clavier et découplés des services Electron.

### 4.1 Monitoring et diagnostic

| Composant proposé | Responsabilité | Détails UX |
|---|---|---|
| RealtimeJitterMonitor | Gigue scheduler p50/p95/p99 | Sparkline, seuils, fenêtre temporelle, état de mesure |
| DmxUniverseHealthCard | Santé par univers | Débit, dernière trame, erreurs, destination |
| TransportStatusBadge | État d'un transport | Désarmé, armé, connecté, dégradé, arrêté |
| HardwareDiagnosticModal | Diagnostic interactif | Étapes, résultats, actions correctives, export |
| EventLogTimeline | Historique d'exploitation | Filtres, sévérité, horodatage et détails |
| ReadinessChecklist | Prévol du show | Contrôles bloquants, avertissements et progression |

**Exigence de mesure :** un indicateur p95 doit préciser sa fenêtre d'échantillonnage, son unité, son nombre d'échantillons et son état de validité. Ne jamais afficher une valeur synthétique comme une mesure réelle.

### 4.2 Programmation lumière

| Composant proposé | Responsabilité | Détails UX |
|---|---|---|
| AdvancedColorPalettePicker | Sélection couleur | Roue, température, swatches, favoris, précision numérique |
| FixtureSelectionToolbar | Sélection multiple | Compteur, plages, groupes, inversion et désélection |
| ParameterInspector | Inspection d'un paramètre | Valeur normalisée, valeur DMX, coarse/fine, reset |
| CueTransitionEditor | Transition de cue | Fondu, délai, courbe, tracking et aperçu |
| EffectCurveEditor | Courbe d'effet | Points, phase, amplitude, période et synchronisation BPM |
| PatchConflictPanel | Conflits de patch | Chevauchement, univers, plage et résolution guidée |

### 4.3 Audio et Song-to-Show

| Composant proposé | Responsabilité | Détails UX |
|---|---|---|
| AudioWaveformMiniPlayer | Lecture et forme d'onde | Scrub, zoom, play/pause, timecode |
| BeatGridOverlay | Grille musicale | Beats, mesures, tempo et recalage |
| SectionConfidenceBadge | Confiance de détection | Score, origine automatique/manuelle et correction |
| ShowVariantCompare | Comparaison A/B | Deux variantes, différences et écoute synchronisée |
| TimelineTrackHeader | Contrôle des pistes | Mute, lock, visibilité, couleur et solo |

### 4.4 Stage 3D et bibliothèque

| Composant proposé | Responsabilité | Détails UX |
|---|---|---|
| SceneOutliner | Hiérarchie scène | Groupes, catégories, visibilité et verrouillage |
| ScenePerformanceOverlay | Coût du rendu | FPS, frame time, draw calls, géométries |
| FixtureProfileProvenance | Provenance profil | Source, version, validation et empreinte |
| FixtureModeDiffViewer | Différence de modes | Canaux, fonctions, valeurs et pertes de conversion |
| AssetQuickInsert | Insertion d'équipement | Recherche, favoris, récents et assemblages |

## 5. Design system et règles transverses

### Couleurs sémantiques

Ne pas dépendre uniquement de la couleur pour exprimer un état.

| État | Signification |
|---|---|
| Vert | Opérationnel / validation réussie |
| Ambre | Avertissement / action recommandée |
| Rouge | Défaut / action bloquée / STOP |
| Bleu ou violet | Information, sélection ou fonctionnalité IA |
| Gris | Désactivé, indisponible ou non mesuré |

### Interactions

- Les actions destructives ou sensibles nécessitent une confirmation contextualisée.
- Les états de chargement doivent être localisés à la zone concernée.
- Les erreurs doivent expliquer le problème, son impact et l'action corrective possible.
- Les raccourcis clavier doivent être visibles et cohérents.
- Les animations doivent respecter prefers-reduced-motion et ne pas masquer les changements d'état.
- Les données LIVE doivent rester lisibles avec une densité élevée et une hiérarchie stable.
- Les composants de monitoring doivent distinguer « zéro » de « donnée indisponible ».

### Accessibilité

- Contraste WCAG 2.2 AA pour le texte et les contrôles principaux.
- Focus clavier visible et ordre de tabulation logique.
- Libellés accessibles pour les sliders et contrôles DMX.
- Annonces non intrusives des changements d'état importants.
- Alternative textuelle aux visualisations et graphiques.
- Pas d'information transmise uniquement par couleur ou animation.

## 6. Plan d'implémentation UX recommandé

| Ordre | Chantier | Résultat attendu |
|---|---|---|
| 1 | États LIVE, sécurité et readiness | Réduction des erreurs opérateur |
| 2 | Sélection fixture et toolbar contextuelle | Interaction console prévisible |
| 3 | Diagnostic transport et gigue | Exploitation observable |
| 4 | Timeline et confiance des analyses | Song-to-Show plus compréhensible |
| 5 | Outliner et inspecteur 3D | Édition de scène plus efficace |
| 6 | Provenance et validation des profils | Bibliothèque plus fiable |
| 7 | Design system de monitoring | Cohérence et réutilisation |
| 8 | Accessibilité et densité régie | Meilleure utilisabilité en conditions réelles |

## 7. Métriques UX à suivre

- Temps médian pour sélectionner et modifier une fixture.
- Nombre d'actions pour diagnostiquer un univers en défaut.
- Taux d'erreur de patch détecté avant émission.
- Temps de préparation d'un show de démonstration.
- Taux d'annulation des propositions IA et raisons associées.
- Temps de première interaction du visualiseur.
- Frame time p95 sur une scène de référence.
- Taux de réussite des parcours clavier.
- Nombre d'alertes critiques masquées ou ignorées.

**Conclusion :** l'évolution UX la plus importante n'est pas d'ajouter davantage de panneaux, mais de rendre chaque état explicite, chaque action réversible lorsque possible, chaque mesure traçable et chaque décision de sécurité compréhensible.

## 8. Suivi de l'implémentation

### Tranche 1 — Dashboard / Readiness

**Statut : en cours**

Première tranche intégrée dans la branche `feat/ux-dashboard-readiness-2026-11` :

- Checklist de préparation persistante dans le Dashboard, indépendante des préférences de masquage des cartes facultatives.
- Contrôle du patch et des profils réellement résolus par la bibliothèque de fixtures.
- Contrôle des sorties activées, des erreurs et de l'état armé/prêt des sorties physiques.
- Avertissement sur les projets nouveaux ou modifiés non sauvegardés.
- Signalement explicite d'une violation Flash Guard.
- Navigation depuis chaque contrôle vers l'écran de correction correspondant.
- États distincts : validé, avertissement, bloquant et donnée indisponible.
- Catalogue français / anglais et tests unitaires dédiés à l'évaluation de l'état.

**Limite volontaire :** cette checklist vérifie les états logiciels connus de Luma. Elle ne prouve ni la réception des trames DMX, ni la conformité du câblage, ni la sécurité mécanique ou électrique du rig.

**À valider localement :** typecheck, lint, tests unitaires et parcours visuel sur une fenêtre desktop standard. Ces commandes n'ont pas été exécutées dans cet environnement.

### Tranche 2 — Monitoring moteur et transports DMX

**Statut : en cours**

- Carte de santé du moteur dans le Dashboard : fréquence mesurée et cible, charge du tick, durée maximale, dépassements et erreurs.
- Percentiles p50/p95/p99 calculés sur les écarts absolus à la période scheduler, à partir d'une fenêtre glissante bornée à 512 échantillons.
- Compteurs par transport : état, FPS rapportés par le transport et erreurs.
- Les percentiles restent indisponibles tant que le scheduler n'a pas fourni d'échantillons.
- Les mesures restent explicitement côté moteur/transport ; elles ne représentent pas une mesure de réception côté projecteur.

**Précision méthodologique :** la valeur historique `jitterMs` est une moyenne exponentielle. Le nouveau monitoring affiche séparément les percentiles calculés sur les échantillons de la fenêtre, sans renommer l'EMA en p95.

**À valider localement :** typecheck, lint, tests unitaires moteur et test de performance avec plusieurs fréquences scheduler.
