# AUDIT COMPLET ET REFONTE PROFESSIONNELLE DU STAGE 3D — LUMA AI DMX

## 1. Objectif

Réaliser un audit approfondi de l’interface Stage 3D de Luma AI DMX, puis améliorer concrètement son ergonomie, son apparence, ses outils d’édition, ses performances et sa stabilité.

Le résultat doit se rapprocher d’un environnement professionnel de conception lumière et de visualisation scénique, avec une interface cohérente, dense mais lisible, précise et adaptée à une utilisation prolongée en régie.

Ne te limite pas à des recommandations. Après l’audit, implémente les améliorations prioritaires directement dans le codebase.

## 2. Périmètre obligatoire

Inspecter en priorité :

- `src/renderer/features/Stage3D.tsx`
- `src/renderer/features/stage3d/scene.ts`
- `src/renderer/features/stage3d/rig.ts`
- `src/renderer/features/stage3d/environment.ts`
- `src/renderer/features/stage3d/quality.ts`
- `src/renderer/features/stage3d/textures.ts`
- `src/renderer/features/stage3d/actors.ts`
- `src/renderer/features/visualizer/ScenePanel.tsx`
- `src/renderer/features/visualizer/StageCanvas.tsx`
- `src/renderer/features/Visualizer.tsx`
- `src/renderer/features/visualizer/drawStage.ts`
- `src/renderer/features/visualizer/sceneCards.tsx`
- `src/renderer/sceneActions.ts`
- `src/renderer/store.ts`
- `src/core/visualizer/`
- `src/core/model/schemas.ts`
- les styles globaux et composants UI réellement utilisés
- les tests unitaires, composants, intégration et E2E concernés
- `docs/roadmap/stage3d.md`, `docs/roadmap/scene.md` et `ROADMAP.md`

Vérifie les chemins réellement présents avant de commencer. Identifie les dépendances et les contrats existants.

## 3. Étape A — Audit factuel

Produire un diagnostic classant chaque constat :

- IMPLÉMENTÉ ET VÉRIFIÉ
- IMPLÉMENTÉ MAIS INSUFFISAMMENT TESTÉ
- PARTIELLEMENT IMPLÉMENTÉ
- PRÉSENT MAIS NON RACCORDÉ
- ABSENT
- À INVESTIGUER

Pour chaque problème, fournir :

1. Fichier et symbole concernés.
2. Comportement réellement constaté.
3. Impact utilisateur.
4. Gravité P0 à P3.
5. Correction proposée.
6. Dépendances et risques de régression.
7. Test permettant de démontrer la correction.

Ne pas déclarer une fonctionnalité absente sans avoir vérifié ses implémentations et son raccordement. Ne pas confondre un composant présent avec un parcours fonctionnel complet.

Examiner particulièrement :
- cohérence visuelle et hiérarchie de l’interface ;
- occupation de l’espace et comportement responsive ;
- organisation des panneaux et accès aux outils ;
- sélection, transformation et inspection des objets ;
- cohérence entre scène 2D, scène 3D, modèle du projet et historique ;
- qualité des matériaux et lisibilité des faisceaux ;
- gestion de la caméra et navigation ;
- fluidité du rendu et gestion mémoire ;
- nettoyage des ressources Three.js ;
- accessibilité, raccourcis et internationalisation ;
- compatibilité avec le fonctionnement DMX existant.

Enregistrer le diagnostic dans `docs/audits/stage3d-audit.md`, en créant le répertoire si nécessaire.

## 4. Étape B — Refonte de l’espace de travail

Créer une interface de niveau professionnel en respectant l’identité visuelle existante.

Architecture cible :

A. Barre d’outils supérieure :
- sélection ;
- déplacement ;
- rotation ;
- outils supplémentaires uniquement s’ils sont réellement pris en charge ;
- annuler/rétablir ;
- accrochage et grille ;
- sélection de caméra ;
- paramètres de qualité ;
- plein écran ;
- capture du rendu si elle peut être implémentée proprement.

B. Panneau de scène à gauche :
- hiérarchie des éléments ;
- projecteurs et groupes ;
- structures et accroches ;
- praticables et décor ;
- interprètes et écrans ;
- recherche, visibilité et verrouillage lorsque pris en charge ;
- actions d’ajout clairement accessibles.

C. Vue 3D centrale :
- priorité maximale à la visibilité du plateau ;
- caméra et cadrage cohérents ;
- repères spatiaux discrets ;
- sélection visuellement claire ;
- indicateur de l’outil actif ;
- navigation qui ne perturbe pas les manipulations ;
- mode édition et mode présentation.

D. Inspecteur contextuel à droite :
- propriétés de l’objet sélectionné ;
- coordonnées en mètres ;
- rotation en degrés ;
- dimensions et hauteur ;
- paramètres propres au type d’objet ;
- propriétés optiques pertinentes pour les projecteurs ;
- contrôles numériques accessibles au clavier ;
- état vide explicite lorsqu’aucun objet n’est sélectionné.

E. Barre d’état :
- mode courant ;
- caméra ;
- grille et accrochage ;
- nombre d’objets ;
- FPS mesurés ;
- niveau de qualité ;
- avertissements utiles.

Les panneaux doivent pouvoir se replier et, si cela s’intègre correctement à l’architecture actuelle, être redimensionnés. Mémoriser les préférences sans modifier le fichier projet à chaque changement purement visuel.

Ne pas créer une interface surchargée. Utiliser une hiérarchie typographique nette, des espacements cohérents, des icônes compréhensibles, des états actifs visibles et des infobulles utiles.

## 5. Étape C — Ergonomie d’édition

Auditer et améliorer les outils existants avant d’ajouter de nouveaux systèmes.

Priorités :
- sélection claire et prévisible ;
- manipulation directe au gizmo ;
- édition numérique ;
- grille métrique configurable ;
- accrochage aux structures ;
- duplication et suppression ;
- alignement et distribution si techniquement sûrs ;
- raccourcis cohérents ;
- menus contextuels ;
- cadrage de la sélection ;
- synchronisation de l’inspecteur avec le modèle ;
- annuler/rétablir des modifications de scène.

La sélection multiple et les transformations groupées sont à implémenter si elles manquent et si le modèle actuel permet une intégration robuste.

Toute modification doit passer par les mécanismes de commande du projet. Éviter les modifications silencieuses d’objets Three.js qui ne seraient pas répercutées dans le modèle persistant.

Pendant un glissement, regrouper les changements dans l’historique selon le mécanisme existant. Ne pas créer une entrée par image.

Préserver les accrochages existants et les relations entre structures et projecteurs suspendus.

## 6. Étape D — Rendu visuel professionnel

Auditer les matériaux, le bloom, la brume, les faisceaux, les textures, le sol et les éléments de décor.

Améliorer :
- lisibilité et profondeur de la scène ;
- cohérence des matériaux ;
- équilibre des couleurs ;
- exposition et bloom ;
- représentation des écrans et surfaces ;
- rendu des structures métalliques ;
- visibilité des objets sélectionnés ;
- distinction entre géométrie d’édition et éléments de présentation.

Proposer des préréglages :
- Édition ;
- Équilibré ;
- Qualité ;
- Présentation.

Chaque préréglage doit correspondre à un comportement réellement implémenté. Ne pas ajouter des commandes visuelles inopérantes.

Ne pas prétendre simuler une photométrie exacte, des ombres réalistes ou un transport lumineux physique si le moteur ne le calcule pas.

Conserver les fonctions existantes : gobos, prismes, faisceaux, brume, effets, cellules LED et éléments de scène.

## 7. Étape E — Performance et robustesse

Mesurer avant d’optimiser.

Étudier :
- coût de chaque frame ;
- nombre d’objets et de draw calls ;
- allocations répétées ;
- reconstructions React ;
- coût du bloom et des reflets ;
- gestion des shaders ;
- mises à jour des rigs ;
- changements de taille de fenêtre ;
- suspension et reprise du rendu ;
- nettoyage des géométries, matériaux, textures et render targets.

Implémenter uniquement les optimisations justifiées par les mesures.

Évaluer l’instancing pour les éléments répétitifs compatibles, sans fusionner les objets qui doivent rester sélectionnables individuellement.

Utiliser des niveaux de qualité et des mécanismes de dégradation contrôlée pour les scènes complexes.

Éviter les fuites mémoire et les boucles de rendu dupliquées. Vérifier les comportements en fenêtre détachée et après plusieurs changements de scène.

Ne pas imposer un objectif de FPS arbitraire sans préciser la machine, le contexte de rendu et la complexité de la scène.

## 8. Étape F — Tests et validation

Ajouter ou mettre à jour les tests pour vérifier :

- montage et démontage du Stage 3D ;
- absence d’erreurs de console ;
- changements de caméra ;
- sélection et désélection ;
- modification numérique ;
- transformation au gizmo ;
- synchronisation avec la vue 2D ;
- accrochage des projecteurs aux structures ;
- annulation et rétablissement ;
- préférences persistantes ;
- fenêtre détachée et plein écran ;
- comportement à plusieurs niveaux de qualité ;
- internationalisation ;
- absence de régression sur les commandes DMX.

Exécuter les commandes de vérification réellement définies dans `package.json` : typecheck, lint, tests et tests E2E si l’environnement le permet.

Consigner les résultats réels. Ne jamais annoncer un test réussi s’il n’a pas été exécuté.

## 9. Contraintes impératives

- Ne pas réécrire l’application entière.
- Ne pas remplacer Three.js ni introduire une nouvelle bibliothèque majeure sans justification démontrée.
- Ne pas dupliquer la logique métier.
- Ne pas contourner `AppService`, les commandes validées ou le store existant.
- Ne pas modifier les protocoles DMX, les priorités de fusion ou les mécanismes de sécurité pour améliorer l’apparence.
- Préserver les projets existants et la compatibilité de leurs schémas.
- Respecter les règles d’internationalisation française et anglaise.
- Respecter les limites de taille des fichiers et les conventions du dépôt.
- Réutiliser les composants et tokens visuels existants lorsqu’ils sont appropriés.
- Ne pas livrer de faux boutons, d’options sans effet ou de données fictives présentées comme réelles.

## 10. Livrables attendus

1. Audit factuel dans `docs/audits/stage3d-audit.md`.
2. Plan de correction priorisé et dépendances.
3. Refondre et implémenter les améliorations P0.
4. Traiter les problèmes P1 directement liés aux changements réalisés.
5. Ajouter les tests de régression correspondants.
6. Mettre à jour `CHANGELOG.md`.
7. Mettre à jour la roadmap sans marquer comme terminée une tâche non vérifiée.
8. Fournir un bilan final : fichiers modifiés, améliorations réalisées, tests exécutés et résultats, limites restantes, risques connus.

Commence par lire le code réel et établir les constats. Passe ensuite à l’implémentation sans attendre une validation intermédiaire pour les corrections sûres et bien délimitées.

Le résultat attendu n’est pas seulement une interface plus jolie : c’est un espace de travail 3D professionnel, ergonomique, stable, performant et cohérent avec le moteur DMX existant.