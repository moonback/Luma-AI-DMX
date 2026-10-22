# MISSION CODEX — Refonte professionnelle complète de l’interface Stage de Luma-AI-DMX

## 1. Objectif général

Tu interviens directement dans le dépôt existant de **Luma-AI-DMX**.

Ta mission est de refondre l’interface de l’espace **Stage** pour obtenir un véritable environnement professionnel de conception scénique et de prévisualisation lumière, inspiré de l’image de référence fournie.

Le résultat doit associer :

- Une interface sombre, moderne, précise et cohérente.
- Un plan scénique 2D vu du dessus.
- Une prévisualisation 3D réaliste et interactive.
- Un panneau de construction organisé en cinq catégories.
- Une hiérarchie des éléments de scène.
- Un inspecteur de propriétés contextuel.
- Une synchronisation réelle avec le modèle de scène et le moteur DMX.
- Des outils de manipulation adaptés aux professionnels du spectacle.

**Exigence fondamentale :** il s’agit d’une véritable refonte fonctionnelle. Tous les contrôles visibles doivent être opérationnels ou explicitement identifiés comme non disponibles. Ne crée pas de fausses fonctionnalités, de données fictives utilisées en production ou de composants purement décoratifs qui remplacent les capacités existantes.

---

## 2. Phase obligatoire : audit du code existant

Avant toute modification, examine l’architecture réelle du projet.

Inspecte notamment, si ces fichiers existent :

- `src/renderer/features/Stage3D.tsx`
- `src/renderer/features/stage3d/`
- `src/renderer/features/Visualizer.tsx`
- `src/renderer/features/visualizer/`
- `src/renderer/sceneActions.ts`
- `src/renderer/store.ts`
- `src/core/visualizer/`
- `src/core/model/schemas.ts`
- Les composants de navigation, les panneaux latéraux, les styles, les tests et les mécanismes de sauvegarde.

Adapte cette liste aux fichiers réellement présents. Ne suppose pas que les chemins, les APIs ou les fonctionnalités sont identiques à cette liste.

### Vérifications à effectuer

1. Identifier les composants responsables du Stage, du plan 2D et de la vue 3D.
2. Identifier le modèle de scène, les types d’objets et les mécanismes de création, modification, suppression et sauvegarde.
3. Identifier le système de sélection, le placement des éléments et les outils de transformation.
4. Vérifier le fonctionnement de l’historique undo/redo.
5. Vérifier comment les fixtures sont reliées à leurs paramètres DMX.
6. Identifier les fonctions de rendu Three.js, les caméras, les lumières, les matériaux et les ressources.
7. Identifier les dépendances UI et les conventions de style déjà utilisées.
8. Vérifier les fonctions réellement opérationnelles par rapport aux fonctionnalités seulement annoncées dans la documentation.
9. Repérer les composants redondants, les états dupliqués et les problèmes de synchronisation.
10. Établir une stratégie de migration progressive qui conserve la compatibilité avec les projets existants.

Produis un audit synthétique dans `docs/audits/stage-interface-audit.md`, avec les fichiers concernés, les problèmes constatés, leur gravité et les corrections recommandées.

Ne t’arrête pas à l’audit : passe ensuite à l’implémentation.

---

## 3. Direction artistique

Reproduis l’esprit visuel de l’image de référence, avec une finition adaptée à un logiciel professionnel.

### Palette

- Fond général : bleu-noir profond, proche de `#080D16`.
- Surfaces et panneaux : `#0D1421` et `#111B2B`.
- Bordures discrètes : `#233249`.
- Bleu principal : `#3478F6`.
- Bleu de sélection : `#244D91`.
- Texte principal : `#F1F5FC`.
- Texte secondaire : `#96A6BF`.
- États positifs : vert doux.
- Avertissements : ambre.
- Erreurs : rouge contrôlé.

Ces valeurs sont indicatives : centralise les tokens de couleur et adapte-les au système de design existant.

### Style

- Interface desktop dense, lisible et précise.
- Panneaux à bordures fines et rayons modérés.
- Icônes vectorielles cohérentes, de préférence issues de la bibliothèque déjà installée.
- Typographie sans-serif professionnelle.
- Espacements réguliers et hiérarchie visuelle claire.
- États hover, focus, actif, désactivé et sélectionné distincts.
- Transitions courtes et discrètes.
- Contraste suffisant pour les longues sessions de travail.
- Pas d’effets glassmorphism excessifs, de dégradés omniprésents ou de grandes cartes décoratives qui réduisent l’espace de travail.

Le rendu doit évoquer un outil de production scénique, pas un tableau de bord marketing.

---

## 4. Structure générale de la fenêtre

Organise l’espace Stage en quatre zones principales.

### A. Barre supérieure globale

Conserve la navigation existante de Luma-AI-DMX et intègre, selon l’architecture actuelle :

- Logo et nom de l’application.
- Sélecteur de projet.
- Navigation principale : Scène, Stage, DMX, Média, Prévisualisation, Paramètres.
- Annuler et rétablir.
- État de connexion du moteur.
- État de sauvegarde du projet.
- Action d’export.

La navigation doit rester cohérente avec les autres pages de l’application. Ne duplique pas une barre de navigation globale déjà présente.

Les indicateurs de moteur et de sauvegarde doivent refléter leur état réel.

### B. Barre latérale de navigation

Conserve les sections existantes et distingue clairement :

- Accueil
- Construire
- Sélection
- Scène
- Propriétés, si cette section existe
- DMX
- Média
- Rendu ou prévisualisation, selon la navigation réelle

La section active doit être clairement identifiable.

Ne crée pas de routes mortes ou de pages fictives pour correspondre à la maquette.

### C. Panneau gauche : Construire

Ce panneau contient les cinq catégories détaillées dans la section suivante.

### D. Zone centrale : Stage

Elle contient le plan 2D et la vue 3D, avec un mode de présentation adaptable.

### E. Panneau droit : Sélection et propriétés

Il présente les éléments sélectionnés et leurs propriétés réelles, selon leur type.

L’ensemble doit rester utilisable sur les tailles d’écran desktop prises en charge par l’application.

---

## 5. Panneau Construire : cinq catégories obligatoires

Le panneau Construire doit présenter exactement cinq catégories principales :

1. **Point**
2. **Structure**
3. **Décor**
4. **Interprète**
5. **Écran**

Chaque catégorie est représentée par une entrée visuelle avec une icône, un titre et une courte description.

Au clic, le contenu de sélection correspondant s’affiche dans le panneau gauche sans quitter la page Stage.

Une seule catégorie est active à la fois.

Prévois un moyen évident de revenir à la liste des catégories.

### 5.1 Point

Cette catégorie est consacrée aux équipements d’éclairage compatibles avec le système existant.

Exemples de types à afficher uniquement s’ils sont disponibles dans le catalogue réel :

- Lyre Wash.
- Lyre Beam.
- Lyre Spot.
- PAR LED.
- Barre LED.
- Stroboscope.
- Fresnel.
- Blinder.
- Autres appareils présents dans le catalogue.

Le catalogue doit utiliser les définitions existantes des fixtures et les informations disponibles.

Chaque carte d’équipement présente, lorsque l’information existe :

- Une vignette ou une représentation de l’appareil.
- Son nom.
- Son type.
- Une référence ou un modèle.
- Les caractéristiques utiles à la sélection.

Au clic sur un équipement, active son placement dans la scène.

Les fixtures doivent conserver leur fonctionnement réel : univers DMX, adresse, personnalité, canaux, intensité, couleur, pan, tilt, zoom, gobo et autres fonctions prises en charge.

Ne crée pas un deuxième catalogue indépendant qui divergerait du moteur DMX.

### 5.2 Structure

Permets de construire l’infrastructure scénique.

Éléments à prendre en charge selon les modèles disponibles :

- Ponts et segments de structure.
- Truss horizontal.
- Truss vertical.
- Pieds et supports.
- Structures rectangulaires.
- Éléments de liaison.

Les structures doivent être représentées dans le plan et dans la vue 3D.

Quand l’architecture le permet, un élément de structure doit pouvoir accueillir des fixtures et les déplacer avec lui lorsqu’il est déplacé.

Respecte les relations parent-enfant existantes.

N’invente pas de mécanisme de fixation physique s’il n’existe pas encore : documente les limites et implémente les relations manquantes de manière cohérente si elles sont nécessaires.

### 5.3 Décor

Prévois un catalogue pour les éléments de décor disponibles :

- Praticables.
- Plateformes.
- Escaliers.
- Mobilier.
- Accessoires.
- Éléments de scène complémentaires.

Chaque élément doit avoir une géométrie et des dimensions appropriées lorsqu’elles sont définies.

Les objets doivent être sélectionnables, déplaçables, rotatifs et supprimables.

Si un type d’objet ne dispose pas encore de modèle de données, commence par définir un modèle extensible et versionnable compatible avec la scène existante.

Ne simule pas sa persistance uniquement dans l’état local d’un composant React.

### 5.4 Interprète

Prévois une catégorie pour les personnes et éléments représentant la présence scénique :

- Chanteur.
- Musicien.
- Danseur.
- Silhouette générique.
- Autres profils disponibles.

Utilise des modèles légers ou des représentations adaptées à la prévisualisation.

Chaque interprète doit pouvoir être positionné, sélectionné et orienté.

L’interprète doit être identifiable dans le plan 2D et reconnaissable dans la vue 3D.

Évite les modèles excessivement lourds qui dégradent les performances.

### 5.5 Écran

Prévois les éléments d’affichage scénique :

- Écran LED.
- Mur vidéo.
- Surface de projection.
- Écran de retour.
- Surface d’affichage complémentaire.

Les propriétés doivent inclure, si elles sont pertinentes pour le modèle :

- Largeur et hauteur.
- Position.
- Rotation.
- Orientation de la face avant.
- Contenu affiché ou matériau.
- Luminosité ou paramètres de rendu disponibles.

Le rendu doit permettre de distinguer clairement un écran d’une surface décorative ordinaire.

La gestion réelle des contenus vidéo doit rester liée aux capacités existantes du projet. Ne prétends pas qu’une lecture vidéo fonctionne si elle n’est pas implémentée.

---

## 6. Catalogue de sélection

Quand l’utilisateur clique sur une catégorie, affiche un catalogue cohérent.

Fonctionnalités attendues :

- Retour aux catégories.
- Recherche par nom.
- Filtrage par type si le catalogue le permet.
- Grille de cartes compacte.
- Vignettes homogènes.
- Nom et informations essentielles.
- États hover et sélection.
- Indication de placement actif.
- Retour visuel après sélection d’un élément.

Les cartes doivent utiliser les données réelles du catalogue.

Les vignettes peuvent provenir de ressources déjà présentes ou être générées à partir de représentations 3D légères. Utilise des icônes de remplacement cohérentes lorsque les ressources manquent.

Ne télécharge pas de modèles externes sans nécessité, licence adaptée et mécanisme de gestion des ressources.

### Comportement de placement

1. L’utilisateur choisit une catégorie.
2. Il sélectionne un élément.
3. L’application active le mode de placement.
4. Le curseur ou l’aperçu indique l’élément à placer, si le moteur le permet.
5. L’utilisateur clique sur le plan 2D ou dans la vue 3D.
6. L’élément est créé dans le modèle de scène.
7. Les vues sont actualisées.
8. L’élément placé devient sélectionné.
9. Le panneau droit affiche ses propriétés.

Respecte les conventions de coordonnées et les transformations déjà utilisées dans le projet.

Prévois l’annulation du placement et une sortie explicite du mode placement.

Le placement ne doit pas créer de doublons involontaires à chaque rafraîchissement ou changement d’onglet.

---

## 7. Zone centrale : plan 2D et vue 3D

La zone centrale est le cœur de l’interface.

Elle doit prendre le maximum d’espace utile disponible.

### 7.1 Modes de présentation

Conserve et améliore les modes compatibles avec l’application :

- Plan 2D.
- Vue 3D.
- Vue divisée 2D + 3D.

Ajoute une commande claire pour basculer entre ces modes.

La vue divisée doit permettre de visualiser simultanément le plan et la prévisualisation 3D.

Les dimensions des deux vues doivent être ajustables si cela peut être intégré proprement.

Conserve le mode choisi selon les mécanismes de persistance existants.

### 7.2 Plan 2D

Le plan doit présenter :

- Une grille graduée.
- Les limites de la scène.
- Les dimensions de la scène.
- Les éléments de structure.
- Les fixtures.
- Les décors.
- Les interprètes.
- Les écrans.
- Les labels utiles.
- Les repères d’axes.
- Les éléments sélectionnés.
- Les outils de navigation.

Fonctions attendues selon les capacités existantes :

- Zoom.
- Panoramique.
- Sélection.
- Placement.
- Déplacement.
- Rotation.
- Alignement.
- Accrochage à la grille.
- Affichage ou masquage des catégories.
- Ajustement à la scène.

La grille doit avoir une échelle cohérente avec les unités du modèle.

Les interactions de sélection ne doivent pas être perturbées par les interactions de déplacement de la caméra.

### 7.3 Vue 3D

Améliore la qualité et la lisibilité de la scène :

- Géométrie de scène cohérente.
- Sol et fond.
- Structure scénique.
- Fixtures avec leur apparence distinctive.
- Décors et plateformes.
- Interprètes.
- Écrans.
- Matériaux adaptés.
- Éclairage de prévisualisation.
- Faisceaux lumineux lorsque les fonctions existent.
- Contrôle de caméra.

Prévois des commandes adaptées aux usages professionnels :

- Perspective.
- Vue de face.
- Vue de dessus.
- Vue de côté.
- Réinitialisation de la caméra.
- Ajustement de la caméra à la scène.
- Plein écran.

N’ajoute pas plusieurs commandes qui exécutent la même action.

### 7.4 Sélection et transformation 3D

Si un système de gizmos existe déjà, réutilise-le.

L’utilisateur doit pouvoir sélectionner un objet et, selon son type :

- Le déplacer.
- Le faire pivoter.
- Modifier ses dimensions.
- Ajuster sa hauteur.
- L’aligner.
- Le rattacher à une structure lorsque cela est pris en charge.

La transformation doit mettre à jour le modèle de scène et non uniquement le mesh Three.js.

Le plan 2D, la vue 3D, l’inspecteur et les données persistées doivent refléter la même transformation.

Les unités et axes doivent être cohérents entre les deux vues.

---

## 8. Panneau droit : Sélection et propriétés

Le panneau droit doit être contextuel.

### 8.1 Liste de sélection

Affiche les éléments de la scène avec :

- Une vignette ou une icône.
- Leur nom.
- Leur catégorie.
- Leur type.
- Un indicateur de visibilité si cette fonction existe.
- Une action de sélection.
- Un menu d’actions secondaires.

Les éléments doivent provenir du modèle de scène réel.

Prévois un état vide lorsque rien n’est sélectionné.

La sélection dans la hiérarchie doit être synchronisée avec les vues 2D et 3D.

### 8.2 Inspecteur

Quand un élément est sélectionné, affiche ses propriétés selon son type.

Propriétés communes :

- Nom.
- Position X, Y et Z.
- Rotation.
- Dimensions ou échelle.
- Visibilité.
- Catégorie.
- Actions de suppression et de duplication si prises en charge.

Pour une fixture, ajoute les propriétés réellement disponibles :

- Univers DMX.
- Adresse DMX.
- Mode ou personnalité.
- Couleur.
- Intensité.
- Pan.
- Tilt.
- Zoom.
- Focus ou paramètres optiques disponibles.
- Autres paramètres propres à l’appareil.

Pour une structure, affiche ses dimensions, ses transformations et ses relations éventuelles avec les fixtures.

Pour un décor, affiche ses dimensions, son orientation et ses paramètres spécifiques.

Pour un interprète, affiche sa position, son orientation et les caractéristiques de représentation disponibles.

Pour un écran, affiche ses dimensions, son orientation et ses paramètres d’affichage disponibles.

### 8.3 Édition des propriétés

Les modifications doivent être immédiates et fiables.

- Valider les valeurs numériques.
- Respecter les limites du modèle.
- Utiliser les unités cohérentes.
- Préserver les valeurs existantes.
- Gérer les erreurs de saisie.
- Synchroniser les changements avec le modèle de scène.
- Intégrer les modifications à undo/redo lorsque le système le permet.
- Préserver la compatibilité avec le moteur DMX.

Ne crée pas un inspecteur universel contenant les mêmes champs pour tous les types d’objets.

---

## 9. Synchronisation avec le moteur

C’est une exigence non négociable.

L’interface ne doit pas devenir une couche visuelle indépendante du fonctionnement réel de Luma-AI-DMX.

### Architecture attendue

- Le modèle de scène existant reste la source de vérité.
- Les actions passent par les mécanismes de modification de scène existants.
- Les composants React affichent l’état issu du modèle.
- Les objets 3D reflètent les transformations du modèle.
- Le plan 2D représente les mêmes éléments.
- Les modifications DMX conservent leur fonctionnement.
- La sauvegarde et le chargement restaurent correctement les éléments.
- Les changements de sélection ne doivent pas modifier accidentellement les données.
- L’historique doit rester cohérent.

Si un nouveau type d’objet nécessite une extension du schéma, prévois :

1. Un type explicitement défini.
2. Une validation des données.
3. Une sérialisation et une désérialisation.
4. Une compatibilité avec les projets existants.
5. Une stratégie de versionnement ou de migration.
6. Des tests de persistance.

Ne modifie pas les contrats du moteur DMX sans nécessité démontrée.

Ne contourne pas les actions centralisées en modifiant directement le store depuis plusieurs composants.

---

## 10. Rendu 3D et performance

Améliore le rendu sans compromettre la fluidité de l’éditeur.

### Priorités

- Réutiliser les géométries et matériaux lorsque cela est possible.
- Éviter de recréer les objets 3D à chaque rendu React.
- Libérer correctement les ressources.
- Éviter les fuites mémoire.
- Limiter les calculs inutiles.
- Utiliser l’instanciation pour les éléments répétitifs lorsque cela est adapté.
- Préserver la réactivité des manipulations.
- Adapter la qualité du rendu aux performances de la machine.
- Prévoir un mode de qualité réduite si nécessaire.
- Gérer proprement le redimensionnement du viewport.
- Arrêter ou réduire le travail de rendu lorsque la vue n’est plus visible, si l’architecture le permet.

Examine particulièrement le cycle de vie de Three.js, les caméras, les matériaux, les lumières, les ressources GPU et les boucles de rendu.

Ne sacrifie pas la précision de la scène pour obtenir uniquement un rendu plus spectaculaire.

Ne promets aucun objectif de FPS sans mesures réelles.

---

## 11. Ergonomie professionnelle

L’interface doit être rapide à utiliser lors d’une préparation de spectacle.

Prévois, lorsque les mécanismes existants le permettent :

- Raccourcis clavier.
- Annuler et rétablir.
- Duplication.
- Suppression.
- Sélection multiple.
- Accrochage à la grille.
- Alignement.
- Commandes de caméra.
- Ajustement de la vue.
- Indication du mode actif.
- Retour visuel après une action.
- Confirmation pour les suppressions importantes.
- États de chargement, d’erreur et d’absence de données.
- Infobulles pour les icônes peu explicites.

Les actions destructives ne doivent pas être placées à côté des actions fréquemment utilisées sans distinction visuelle.

Les boutons doivent être suffisamment grands pour être utilisés avec précision.

Respecte les conventions clavier existantes et évite les conflits avec les commandes de caméra ou les champs de saisie.

---

## 12. Responsive et gestion de l’espace

La cible principale est l’application desktop.

Le layout doit néanmoins s’adapter aux différentes tailles de fenêtre :

- Panneau gauche redimensionnable ou repliable.
- Panneau droit redimensionnable ou repliable.
- Zone centrale prioritaire.
- Mode 2D seul et mode 3D seul toujours accessibles.
- Vue divisée lorsque l’espace est suffisant.
- Défilement dans les panneaux, pas sur toute l’application.
- Pas de débordement horizontal involontaire.
- Pas de texte tronqué sans alternative.
- Gestion correcte du redimensionnement de la fenêtre Electron.

Les panneaux ne doivent jamais réduire les viewports au point de rendre les outils inutilisables.

---

## 13. Architecture du code et qualité

Respecte la stack réelle, les conventions et les dépendances installées.

Évite :

- Les composants géants qui mélangent toutes les responsabilités.
- Les états dupliqués entre le parent et les enfants.
- Les mutations directes et non contrôlées.
- Les types TypeScript permissifs inutiles.
- Les nouveaux packages sans justification.
- Les effets React dont les dépendances sont incorrectes.
- Les identifiants instables.
- Les abonnements qui ne sont jamais nettoyés.
- Les boutons sans comportement.
- Les données fictives présentées comme réelles.
- Les régressions dans les fonctions DMX existantes.

Sépare proprement, selon l’architecture en place :

- Le layout Stage.
- Le panneau Construire.
- Les catalogues par catégorie.
- Le viewport 2D.
- Le viewport 3D.
- La hiérarchie de scène.
- L’inspecteur.
- Les actions de scène.
- Les types et schémas.
- Les fonctions de rendu.

Ne crée pas une nouvelle architecture parallèle si les composants existants peuvent être améliorés proprement.

---

## 14. Tests obligatoires

Ajoute ou mets à jour les tests selon les outils déjà utilisés dans le projet.

### Tests fonctionnels

1. Afficher les cinq catégories dans Construire.
2. Ouvrir chaque catégorie.
3. Revenir à la liste des catégories.
4. Rechercher un élément dans un catalogue.
5. Sélectionner un élément et activer son placement.
6. Placer un élément dans la scène.
7. Sélectionner un élément existant.
8. Modifier sa position.
9. Modifier sa rotation.
10. Vérifier la synchronisation entre le plan et la vue 3D.
11. Supprimer un élément.
12. Annuler et rétablir une modification.
13. Sauvegarder puis recharger la scène.
14. Vérifier la persistance des relations entre fixtures et structures si elles sont prises en charge.
15. Vérifier qu’une modification de fixture ne casse pas son adressage DMX.
16. Vérifier les états vides et les erreurs.
17. Vérifier le changement de mode 2D, 3D et divisé.
18. Vérifier les interactions clavier et souris.
19. Vérifier le redimensionnement des panneaux et de la fenêtre.
20. Vérifier qu’il n’y a pas de duplication involontaire d’objets.

Les tests doivent vérifier le comportement réel, pas uniquement la présence de composants dans le DOM.

### Vérifications techniques

Exécute les commandes adaptées au projet :

- Vérification TypeScript.
- Lint.
- Tests unitaires.
- Tests d’intégration.
- Tests E2E existants.
- Build de production.

Utilise les scripts réellement déclarés dans `package.json`.

Ne désactive pas les tests existants pour faire passer la refonte.

Corrige les régressions introduites par tes changements et indique clairement les problèmes préexistants qui restent non résolus.

---

## 15. Plan d’implémentation

Travaille dans cet ordre.

### Phase 1 — Audit et conception

- Examiner le code.
- Identifier les composants à réutiliser.
- Identifier les fonctions manquantes.
- Établir une cartographie des flux de données.
- Documenter les risques.
- Définir le plan de migration.

### Phase 2 — Refonte visuelle

- Harmoniser les tokens et les styles.
- Refaire le layout Stage.
- Refaire le panneau Construire.
- Organiser les zones 2D et 3D.
- Refaire le panneau Sélection.
- Améliorer les états visuels.

Cette phase doit préserver les fonctions existantes.

### Phase 3 — Construction et placement

- Connecter les cinq catégories aux données réelles.
- Améliorer les catalogues.
- Fiabiliser le placement.
- Connecter les transformations au modèle de scène.
- Vérifier la synchronisation entre les vues.

### Phase 4 — Inspecteur et cohérence

- Implémenter les propriétés contextuelles.
- Connecter les champs aux actions existantes.
- Vérifier undo/redo.
- Vérifier la sauvegarde et le rechargement.
- Préserver l’intégration DMX.

### Phase 5 — Qualité et finition

- Optimiser le rendu.
- Vérifier les performances.
- Améliorer les raccourcis et les retours visuels.
- Tester les tailles de fenêtre.
- Exécuter la suite de tests.
- Documenter les limitations restantes.

Priorise les améliorations de l’interface et les fonctionnalités de base avant les optimisations complexes du rendu.

Ne considère pas une phase terminée simplement parce que les composants ont été créés.

---

## 16. Critères d’acceptation

La mission est considérée comme réussie uniquement si les conditions suivantes sont remplies :

- L’espace Stage présente une interface cohérente avec la référence.
- Le panneau Construire présente les cinq catégories : Point, Structure, Décor, Interprète et Écran.
- Cliquer sur une catégorie affiche son catalogue.
- Les éléments proviennent des modèles ou catalogues réellement disponibles.
- Le placement fonctionne avec les actions de scène réelles.
- Le plan 2D et la vue 3D restent synchronisés.
- La sélection ouvre le bon inspecteur.
- Les propriétés affichées correspondent au type d’objet.
- Les modifications sont persistées lorsque cela est prévu.
- Undo/redo reste fonctionnel.
- Le moteur DMX conserve son comportement existant.
- Les contrôles visibles ont une action réelle ou un état indisponible explicite.
- La console ne présente pas de nouvelles erreurs non maîtrisées.
- Les vérifications techniques passent, ou les échecs préexistants sont documentés avec précision.
- Les tests de régression pertinents sont exécutés.
- Les limites non implémentées sont clairement signalées.

---

## 17. Livrables finaux

À la fin de la mission :

1. Implémente la refonte directement dans les fichiers concernés.
2. Crée `docs/audits/stage-interface-audit.md`.
3. Mets à jour la documentation technique utile.
4. Ajoute ou adapte les tests.
5. Liste les fichiers créés, modifiés et supprimés.
6. Donne les résultats réels des vérifications exécutées.
7. Distingue les fonctionnalités terminées, partielles et non implémentées.
8. Indique les éventuelles migrations de données nécessaires.
9. Liste les limitations restantes et les prochaines étapes recommandées.

Ne te contente pas de produire un rapport ou une liste de recommandations : réalise effectivement les changements.

## Consigne finale

Prends l’image de référence comme guide visuel pour l’organisation, les proportions, les couleurs et la hiérarchie des panneaux.

Conserve les fondations techniques de Luma-AI-DMX, réutilise les fonctions existantes et fais évoluer l’application progressivement.

**Le résultat attendu est un véritable éditeur scénique professionnel, opérationnel et maintenable, et non une simple imitation graphique de l’image.**