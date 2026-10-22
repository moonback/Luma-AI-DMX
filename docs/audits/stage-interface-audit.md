# Audit et refonte de l’interface Stage — Luma AI DMX

**Date** : 2026-10-22
**Périmètre** : page Stage (`src/renderer/features/Visualizer.tsx`, `visualizer/`, `Stage3D.tsx`, `stage3d/`), actions de scène (`src/renderer/sceneActions.ts`), store (`src/renderer/store.ts`), modèle de scène (`src/core/visualizer/`, `src/core/model/schemas.ts`), commandes (`src/shared/commands.ts`, `src/core/app/handlers/fixtures.ts`).
**Complète** : `docs/audits/stage3d-audit.md` (rendu 3D, performance, raccourcis — toujours valable).

---

## 1. Constat avant refonte

### 1.1 Ce qui existait et fonctionnait (réutilisé tel quel)

| Domaine | Implémentation existante | Fichiers |
|---|---|---|
| Modèle de scène | `project.visualizer` : plateau, `markers`, `trusses`, `props`, `performers`, `screens`, vues — schéma Zod versionné, migrations projet | `core/model/schemas.ts`, `core/project/migrate.ts` |
| Édition de scène | Fonctions pures `newElement`, `withElement`, `withoutElement`, `cloneElement`, `withPatched`, `equipTrusses` | `core/visualizer/sceneEdit.ts` |
| Actions centralisées | `addSceneElement`, `removeSceneElement`, `duplicateSceneElement`, copier/coller, `hangFixture`, `equipRig`, raccourcis (Ctrl+D, Suppr, Échap) | `renderer/sceneActions.ts` |
| Source de vérité | Processus principal ; le renderer envoie `project.update` / `fixture.*` validés par Zod, reçoit l’état via l’évènement `project` | `shared/commands.ts`, `store.ts` |
| Undo / redo | Historique de scène dédié (`scene.undo` / `scene.redo`) + historique projet | `core/app/history.ts` |
| Relation structure ↔ projecteur | `fixture.trussId`, accroche automatique, les projecteurs suivent la structure | `core/visualizer/truss.ts`, handler `fixture.place` |
| Plan 2D | Canvas : grille, plateau, projecteurs, structures, décor, interprètes, écrans, placement au clic, glisser-déposer, mode Positionner | `visualizer/StageCanvas.tsx`, `drawStage.ts` |
| Vue 3D | Three.js : faisceaux volumétriques, caméras (face, dessus, côté…), gizmo translate/rotate relié au modèle, accrochage, qualité adaptative, plein écran, capture | `Stage3D.tsx`, `stage3d/*` |
| Bibliothèque | Pièces de truss, décor, interprètes, écrans, repères | `core/visualizer/library.ts` |

### 1.2 Problèmes constatés

| # | Problème | Gravité | Fichier(s) |
|---|---|---|---|
| S-01 | Pas de catégorie « Point » : impossible de poser un **projecteur** depuis la page Stage ; il fallait passer par le Patch puis positionner. | **P0** | `ScenePanel.tsx`, `sceneEdit.ts` |
| S-02 | Construction et inspection partageaient un seul panneau à onglets : on ne voyait jamais en même temps le catalogue et les propriétés. | P1 | `ScenePanel.tsx`, `store.ts` (`scenePanel`) |
| S-03 | Aucune hiérarchie de la scène (liste unifiée projecteurs + éléments), donc pas de sélection hors des vues. | P1 | — |
| S-04 | L’inspecteur projecteur n’exposait pas le patch (univers, adresse, mode, nom) ni l’intensité/couleur. | P1 | `sceneCards.tsx` |
| S-05 | Bibliothèque organisée en 4 groupes (« Structures / Décor / Artistes / Vidéo et repères ») ≠ les 5 catégories demandées. | P2 | `library.ts`, `ScenePanel.tsx` |
| S-06 | Double inspecteur en 3D : résumé flottant dans la vue + panneau latéral. | P2 | `Stage3D.tsx` |
| S-07 | Palette violette générique, pas de hiérarchie de panneaux type outil de production. | P2 | `styles.css` |
| S-08 | ~45 textes en dur dans `ScenePanel.tsx` (ratchet i18n). | P3 | `ScenePanel.tsx` |
| S-09 | Pas de test composant de la page Stage (seulement unitaires 3D et E2E). | P2 | `tests/` |

---

## 2. Refonte réalisée

### 2.1 Architecture

```
Visualizer.tsx (StagePage)                    ← barre de page : modes Plan / 3D / Plan + 3D, Positionner, undo/redo, filtre groupe, détacher
 ├─ ScenePanel.tsx  (panneau gauche Construire) ← 5 catégories → catalogue (recherche, filtre type, tuiles) → « Dans la scène »
 ├─ StageCanvas / Stage3D (zone centrale)      ← inchangés, placement via placeAt()
 └─ SelectionPanel.tsx (panneau droit)         ← hiérarchie du modèle + inspecteur contextuel
sceneActions.ts : placeAt(spec, at) → addSceneElement() | addFixtureAt()
store.ts        : stagePanels { build, inspect } (remplace scenePanel 'build' | 'selection' | null)
```

Aucune nouvelle source de vérité : tous les panneaux lisent `project` du store et écrivent par les commandes existantes.

### 2.2 Changements par fichier

| Fichier | Changement |
|---|---|
| `src/core/visualizer/sceneEdit.ts` | `PlaceSpec` devient une union : élément de scène **ou** `{ kind: 'fixture', profileId, mode }`. |
| `src/renderer/sceneActions.ts` | `placeAt()` (point d’entrée unique 2D / 3D / glisser-déposer) et `addFixtureAt()` : `fixture.add` (premier univers avec la place, adresse libre — même logique que le dialogue Patch) puis `fixture.place` (accroche à la structure la plus proche ≤ 0,6 m, sinon hauteur par défaut), puis sélection. Glisser-déposer `fixture:<profil>:<mode>`. |
| `src/renderer/store.ts` | `stagePanels` (deux panneaux repliables) ; une sélection rouvre l’inspecteur. |
| `src/renderer/features/Visualizer.tsx` | Disposition 3 colonnes, rails de réouverture, inspecteur flottant 3D désactivé quand le panneau droit est ouvert. |
| `src/renderer/features/visualizer/ScenePanel.tsx` | Réécrit : panneau Construire (catégories, catalogues, plateau, modèles, photo). |
| `src/renderer/features/visualizer/SelectionPanel.tsx` | **Nouveau** : hiérarchie (groupes, sélection Ctrl/Maj, double-clic = cadrer, menu ⋮ cadrer / dupliquer / supprimer séparé) + inspecteur (cartes par type, bloc DMX, programmer). |
| `src/renderer/features/Stage3D.tsx` | Prop `inspector` ; `setStagePanels` à la place de `setScenePanel`. |
| `src/renderer/features/visualizer/StageCanvas.tsx`, `stage3d/scene.ts` | Clic de placement → `placeAt()`. |
| `src/renderer/stage.css` | **Nouveau** : tokens de la page (fond `#080D16`, surfaces `#0D1421`/`#111B2B`, bordures `#233249`, bleu `#3478F6`, sélection `#244D91`, textes `#F1F5FC`/`#96A6BF`) **scopés à `.stage-page`** pour ne pas modifier le reste de l’application ; styles des catégories, tuiles, hiérarchie, inspecteur. |
| `src/renderer/i18n/fr.stage.ts`, `en.stage.ts` | **Nouveaux** catalogues (≈ 80 clés FR/EN). |
| `scripts/i18n-baseline.json` | Référence abaissée (710 → 689 textes en dur). |
| `tests/components/stage.test.tsx` | **Nouveau** : 12 tests contre un AppService réel. |
| `tests/e2e/app.spec.ts` | Parcours adaptés à la navigation par catégories. |

### 2.3 Les cinq catégories

| Catégorie | Source des données | Placement | « Dans la scène » |
|---|---|---|---|
| **Point** | `ProfileLibrary` (bibliothèque + profils du projet) — le même catalogue que le Patch et le moteur DMX, filtre par `FixtureType`, badge « Fictif » pour les profils de démonstration | `addFixtureAt` (patch + position + accroche) | via la hiérarchie (groupe Projecteurs) |
| **Structure** | `LIBRARY` kind `truss` (droites, angles, té, croix, totems, cercle, carré, pont sur pieds) | `addSceneElement` + aimantation bout à bout | cartes structure, « Équiper les structures » |
| **Décor** | `LIBRARY` kind `prop` (praticables, escalier, enceinte, retour, micro, table, pendrillon, cube, colonne) | `addSceneElement` | cartes décor |
| **Interprète** | `LIBRARY` kinds `performer` + `marker` (artiste debout/assis, batterie, clavier, pupitre, repère) | `addSceneElement` | cartes interprètes et repères |
| **Écran** | `LIBRARY` kind `screen` (écran 16:9, mur LED) | `addSceneElement` | cartes écran (couleur, image, vidéo locale non enregistrée, pixel mapping) |

---

## 3. Statut des fonctionnalités

| Fonction | Statut |
|---|---|
| 5 catégories, catalogue, retour, recherche (accents ignorés), filtre par type (Point) | **Terminé** |
| Placement au clic (2D et 3D) et glisser-déposer, Échap pour annuler, pas de doublon au changement de vue | **Terminé** (testé) |
| Placement de projecteurs depuis le catalogue, adressage DMX automatique, accroche aux structures | **Terminé** (testé) |
| Hiérarchie synchronisée avec 2D / 3D (sélection partagée via le store) | **Terminé** |
| Inspecteur contextuel : élément (cartes par type), projecteur (position, hauteur, rotation, accroche, structure, DMX, intensité, couleur) | **Terminé** |
| Undo / redo (historique de scène) | **Terminé** (testé) |
| Suppression projecteur avec confirmation ; suppression d’élément annulable | **Terminé** |
| Sauvegarde / rechargement (relation projecteur ↔ structure) | **Terminé** (testé) — aucune migration nécessaire, le schéma n’a pas changé |
| Panneaux repliables | **Terminé** |
| Panneaux redimensionnables par glisser | **Non implémenté** (largeurs adaptatives par media queries) |
| Ratio réglable de la vue divisée | **Non implémenté** |
| Indicateur de visibilité par élément | **Non implémenté** : le schéma n’a pas de champ `visible` ; aucun œil factice n’est affiché |
| Pan / Tilt / gobo depuis l’inspecteur | **Partiel** : affichés en lecture ; réglage dans Pan / Tilt et Live Console |
| Transformation groupée au gizmo (plusieurs objets) | **Partiel** (préexistant, cf. E-05 de `stage3d-audit.md`) |
| Vignettes 3D générées des appareils | **Non implémenté** : glyphes vectoriels par type (aucune ressource bitmap n’accompagne les profils) |
| Vidéo sur écran | **Partiel** (préexistant) : fichier local lu dans la session, non enregistré dans le projet |
| Barre supérieure globale et navigation latérale | **Inchangées** (déjà présentes dans `App.tsx` / `TopBar.tsx`, non dupliquées) |

---

## 4. Vérifications exécutées

Voir la section « Résultats » du rapport de mission (typecheck, lint, tests unitaires/composants, E2E, build).

## 5. Limites et prochaines étapes recommandées

1. Poignées de redimensionnement des panneaux et du séparateur de la vue divisée (persistées dans le store comme `stageMode`).
2. Champ `visible` versionné dans les éléments de scène (+ migration) si le masquage par élément est souhaité.
3. Commandes Pan / Tilt dans l’inspecteur (réutiliser `PanTiltConsole`).
4. Sélection multiple d’éléments de scène (aujourd’hui un seul `sceneSel`) et alignement / distribution.
5. Le placement d’un projecteur fait deux pas d’historique (`fixture.add` dans l’historique projet, `fixture.place` dans l’historique de scène) : une commande atomique « ajouter et placer » simplifierait l’annulation.
