# Constructeur de structures truss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe à cases (`- [ ]`).

**Goal:** Permettre à l'utilisateur de dessiner une structure truss de taille illimitée en quelques clics (tracer les segments, les angles et les jonctions), puis de la voir et de la modifier en 3D, comme sur trusstool.com.

**Architecture:** Le modèle de scène existe déjà : une `Truss` est un segment ou une jonction posé sur le plan (`src/core/model/schemas.ts`), avec une géométrie pure dans `src/core/visualizer/truss.ts` (accroche bout à bout, jonctions, supports). On réutilise ce modèle : une « construction » est un ensemble de `Truss` reliés par leurs extrémités et regroupés par un `groupId`. Le mode dessin est ajouté à la vue plan (`StageCanvas.tsx`), la vue 3D (`features/stage3d`) affiche les pièces existantes, et chaque geste de dessin est une seule étape d'historique.

**Tech Stack:** TypeScript, Zod (schémas), React (renderer, `StageCanvas.tsx`), Three.js (`features/stage3d`), Vitest (`tests/unit`, même style que `suggest.test.ts`).

**Spec:** Pas de document de spec séparé : la demande est la spec (« créer et designer sans limite des constructions en structure, en quelques clics, similaire à trusstool.com »). Voir « Hypothèses ».

**Décisions prises à l'implémentation :** le plafond de 64 pièces est conservé (demande explicite) ; la tâche 5 (rendu instancié) n'est pas nécessaire tant que le plafond est à 64 et est retirée ; pas de commande `addTrussGroup` (une étape d'historique = un `project.update`) ; pas de jonction automatique (`junctionFor` retiré) ; la liste de matériel regroupe par longueur (pas de forme, faute de libellés i18n).

## Hypothèses (à valider)

1. « Sans limite » = plus de plafond artificiel de pièces (aujourd'hui `max(64)` dans `trussSchema` et `sceneEdit.ts`). Une limite de performance haute (1000 pièces) reste en place pour garder la 3D fluide.
2. « Quelques clics » = tracer une structure entière sans remplir le formulaire de chaque pièce.
3. Les pièces sont des segments droits de longueurs standard, plus les angles, tés, croix et totems déjà présents. Les profils de section (29, 30, 40, 50 cm…) restent une information pour la liste de matériel, pas un moteur de calcul de charge.
4. Phase 1 : structures planes, hauteur par pièce. Segments inclinés et nœuds à hauteurs différentes sont en phase 3.

## Global Constraints

- Coordonnées en mètres, x = jardin/cour, y = fond de scène, rotation en degrés antihoraire vue du dessus (cf. `truss.ts`).
- Bornes Zod existantes à conserver : `x`, `y` ∈ [-100, 100] ; `height` ∈ [0.5, 30] ; `length` ∈ [0.5, 60] ; `rotation` ∈ [-360, 360].
- Toute modification de scène passe par `shared/commands.ts` et l'historique de scène (une étape par geste utilisateur).
- Textes d'interface en français et en anglais (`src/renderer/i18n/fr.ts` et `en.ts`).

## Review Focus

- Un tracé qui revient sur un nœud existant crée une pièce dupliquée ou de longueur nulle : ces pièces doivent être refusées.
- Au-delà de 64 pièces, le projet est aujourd'hui refusé par le schéma : l'utilisateur doit obtenir une structure complète, pas une erreur.
- Supprimer une pièce d'une construction ne doit pas laisser de projecteurs accrochés à une pièce disparue (`trussId` orphelin).
- Déplacer un groupe entier doit garder les projecteurs sur le bon segment (`followTruss`).
- Deux segments qui se croisent sans nœud commun ne doivent pas se « snapper » (le snap ne concerne que les extrémités, `END_SNAP` = 0.35 m).

---

### Task 1: Retirer le plafond de pièces et ajouter le regroupement

**Files:**
- Modify: `src/core/model/schemas.ts` (ajouter `groupId` à `trussSchema`, relever la limite de `trusses`)
- Modify: `src/core/visualizer/sceneEdit.ts` (`MAX.truss`)
- Test: `tests/unit/truss-group.test.ts`

**Interfaces:**
- Consumes: `trussSchema`, `Truss` (existants)
- Produces: `Truss.groupId?: string` (optionnel, `idSchema`) ; `groupTrusses(trusses: Truss[]): Map<string, Truss[]>` ; constante `TRUSS_MAX = 1000` exportée depuis `sceneEdit.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```ts
it('accepte 200 pièces regroupées par groupId', () => {
  const pieces = Array.from({ length: 200 }, (_, i) => truss(`p${i}`, { groupId: 'g1' }));
  expect(projectSchema.safeParse(projectWith({ trusses: pieces })).success).toBe(true);
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/unit/truss-group.test.ts`
Expected: FAIL (`trusses` limité à 64)

- [ ] **Step 3: Relever la limite et ajouter `groupId`**

Ajouter `groupId: idSchema.optional()` à `trussSchema`, passer `trusses` de `.max(64)` à `.max(TRUSS_MAX)` et `MAX.truss` à `TRUSS_MAX`. `groupTrusses` regroupe par `groupId` ; les pièces sans groupe restent seules.

- [ ] **Step 4: Relancer le test**

Run: `npx vitest run tests/unit/truss-group.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/model/schemas.ts src/core/visualizer/sceneEdit.ts tests/unit/truss-group.test.ts
git commit -m "feat(truss): retire la limite de 64 pièces et ajoute le groupId"
```

---

### Task 2: Pièces standard et chaînage d'un tracé

**Files:**
- Create: `src/core/visualizer/trussBuild.ts` (fonctions pures)
- Test: `tests/unit/trussBuild.test.ts`

**Interfaces:**
- Consumes: `Truss`, `trussEnds`, `JUNCTION_ARMS` (de `truss.ts`)
- Produces:
  - `STANDARD_LENGTHS: number[]` = `[0.5, 1, 1.5, 2, 2.5, 3]` (mètres)
  - `chainFromPoints(points: P2[], length: number, base: Truss | null): Truss[]` : une pièce par segment, orientée selon l'angle du segment, `groupId` commun, `support` = `'towers'` sur nœud libre, `'hung'` sinon. Les segments de longueur nulle sont ignorés.
  - `junctionFor(arms: number[]): Truss['shape'] | null` : 2 bras → `corner`, 3 → `tee`, 4 → `cross`.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
it('trace deux segments de 2 m en deux pièces du même groupe', () => {
  const pieces = chainFromPoints([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }], 2, null);
  expect(pieces).toHaveLength(2);
  expect(pieces[0].rotation).toBe(0);
  expect(pieces[1].rotation).toBe(90);
  expect(pieces[0].groupId).toBe(pieces[1].groupId);
});

it('ignore un segment de longueur nulle', () => {
  expect(chainFromPoints([{ x: 1, y: 1 }, { x: 1, y: 1 }], 2, null)).toEqual([]);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/unit/trussBuild.test.ts`
Expected: FAIL (module absent)

- [ ] **Step 3: Implémenter `chainFromPoints` et `junctionFor`**

Le centre de chaque pièce est le milieu du segment ; `length` arrondi à la longueur standard la plus proche. Le `groupId` est l'id du premier point ou un id généré.

- [ ] **Step 4: Relancer les tests**

Run: `npx vitest run tests/unit/trussBuild.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/visualizer/trussBuild.ts tests/unit/trussBuild.test.ts
git commit -m "feat(truss): chaînage de segments et jonctions automatiques"
```

---

### Task 3: Mode dessin dans la vue plan (2D)

**Files:**
- Modify: `src/renderer/features/visualizer/StageCanvas.tsx` (outil « tracer », aperçu, clic pour ajouter un nœud, double-clic ou Échap pour terminer)
- Modify: `src/renderer/store.ts` (outil courant `'select' | 'draw'` et longueur choisie)
- Modify: `src/renderer/features/visualizer/ScenePanel.tsx` (bouton « Tracer », choix de longueur)
- Modify: `src/shared/commands.ts` (commande `addTrussGroup`, plusieurs pièces en une étape d'historique, comme `addFixtures`)
- Modify: `src/core/visualizer/sceneEdit.ts` (appliquer `addTrussGroup`)
- Test: `tests/unit/sceneEdit-truss.test.ts`

**Interfaces:**
- Consumes: `chainFromPoints`, `junctionFor` (Task 2), `snapTrussEnds` (existant), `TRUSS_MAX` (Task 1)
- Produces: commande `{ type: 'addTrussGroup', trusses: Truss[] }` ; `applyTrussGroup(vis, trusses)` dans `sceneEdit.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```ts
it('addTrussGroup ajoute toutes les pièces en une seule étape', () => {
  const next = applyTrussGroup(emptyVis(), chainFromPoints([{ x: 0, y: 0 }, { x: 2, y: 0 }], 2, null));
  expect(next.trusses).toHaveLength(1);
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/unit/sceneEdit-truss.test.ts`
Expected: FAIL (`applyTrussGroup` absent)

- [ ] **Step 3: Implémenter**

En mode `draw`, chaque clic ajoute un point, accroché à un nœud existant si `snapTrussEnds` trouve un point à moins de `END_SNAP` ; l'aperçu montre le prochain segment. Terminer le tracé envoie `addTrussGroup` avec `chainFromPoints`. Si le nœud final touche 2, 3 ou 4 bras, `junctionFor` choisit la pièce de jonction.

- [ ] **Step 4: Relancer le test, puis vérifier à la main**

Run: `npx vitest run tests/unit/sceneEdit-truss.test.ts`
Expected: PASS
Puis lancer l'app (`npm run dev`) et tracer une structure carrée de 4 segments : elle doit s'ajouter en une seule étape d'historique (Ctrl+Z la retire entièrement).

- [ ] **Step 5: Commit**

```bash
git add src/renderer src/shared/commands.ts src/core/visualizer/sceneEdit.ts tests/unit/sceneEdit-truss.test.ts
git commit -m "feat(truss): tracé de structure en plan avec accroche aux nœuds"
```

---

### Task 4: Opérations sur une construction entière

**Files:**
- Modify: `src/core/visualizer/sceneEdit.ts` (déplacer et supprimer un groupe)
- Modify: `src/renderer/features/visualizer/ScenePanel.tsx` (sélectionner un groupe d'un clic)
- Test: `tests/unit/truss-group-ops.test.ts`

**Interfaces:**
- Consumes: `groupTrusses` (Task 1), `followTruss` (existant)
- Produces: `moveGroup(vis, groupId, dx, dy)`, `removeGroup(vis, groupId)` ; `removeGroup` remet `trussId: null` sur les projecteurs accrochés aux pièces supprimées

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
it('removeGroup détache les projecteurs accrochés aux pièces supprimées', () => {
  const vis = withFixtureOn('p1', visWithGroup('g1', ['p1', 'p2']));
  expect(removeGroup(vis, 'g1').fixtures[0].trussId).toBeNull();
});

it('moveGroup garde un projecteur à mi-segment à mi-segment', () => {
  // déplacer le groupe de (dx, dy) : la position du projecteur suit le même décalage sur le segment
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/unit/truss-group-ops.test.ts`
Expected: FAIL

- [ ] **Step 3: Implémenter**

`moveGroup` applique le même `dx, dy` à toutes les pièces du groupe, puis repositionne leurs projecteurs via `followTruss`. `removeGroup` supprime les pièces et détache les projecteurs.

- [ ] **Step 4: Relancer les tests**

Run: `npx vitest run tests/unit/truss-group-ops.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/visualizer/sceneEdit.ts src/renderer/features/visualizer/ScenePanel.tsx tests/unit/truss-group-ops.test.ts
git commit -m "feat(truss): déplacer et supprimer une construction entière"
```

---

### Task 5: Vue 3D des constructions

**Files:**
- Modify: `src/renderer/features/stage3d/scene.ts` (rendu des pièces, instancié au-delà de 100 pièces)
- Test: `tests/unit/stage3d-truss.test.ts` (fonction pure qui produit les transformations des instances)

**Interfaces:**
- Consumes: `trussSegments` (existant), `Truss.groupId` (Task 1)
- Produces: `trussInstances(trusses: Truss[]): { position: [number, number, number]; rotation: number; length: number }[]` (fonction pure, testée)

- [ ] **Step 1: Écrire le test qui échoue**

```ts
it('produit une instance par segment, sans doublon', () => {
  expect(trussInstances([pieceA, pieceB])).toHaveLength(2);
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/unit/stage3d-truss.test.ts`
Expected: FAIL

- [ ] **Step 3: Implémenter et vérifier à l'écran**

Utiliser `THREE.InstancedMesh` pour les segments identiques au-delà de 100 pièces. Vérifier avec le navigateur intégré (`preview_start`) qu'une structure de 200 pièces reste fluide.

- [ ] **Step 4: Relancer le test**

Run: `npx vitest run tests/unit/stage3d-truss.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/stage3d/scene.ts tests/unit/stage3d-truss.test.ts
git commit -m "feat(stage3d): rendu instancié des constructions truss"
```

---

### Task 6: Liste de matériel (quantités par longueur)

**Files:**
- Create: `src/core/visualizer/trussBom.ts`
- Modify: `src/renderer/features/visualizer/ScenePanel.tsx` (affichage de la liste)
- Test: `tests/unit/trussBom.test.ts`

**Interfaces:**
- Consumes: `Truss` (existant)
- Produces: `trussBom(trusses: Truss[]): { length: number; shape: Truss['shape']; count: number }[]`, trié par longueur puis par forme

- [ ] **Step 1: Écrire le test qui échoue**

```ts
it('compte les pièces par longueur et par forme', () => {
  expect(trussBom([line2m, line2m, corner])).toEqual([
    { length: 2, shape: 'line', count: 2 },
    { length: 2, shape: 'corner', count: 1 },
  ]);
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/unit/trussBom.test.ts`
Expected: FAIL

- [ ] **Step 3: Implémenter**

Fonction pure. L'affichage reste une liste simple dans le panneau de scène.

- [ ] **Step 4: Relancer le test**

Run: `npx vitest run tests/unit/trussBom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/visualizer/trussBom.ts src/renderer/features/visualizer/ScenePanel.tsx tests/unit/trussBom.test.ts
git commit -m "feat(truss): liste de matériel par longueur et forme"
```

---

## Phase 3 (hors périmètre initial)

- Segments inclinés et nœuds à hauteurs différentes (`endHeight` sur `Truss`) : nécessaires pour les structures en pente, à traiter après validation de la phase 1.
- Export PDF ou CSV de la liste de matériel.
- Calcul de charge par profil de section : non demandé, à faire seulement sur demande explicite.
