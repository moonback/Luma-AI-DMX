# Plan d'action — Constructeur de structures truss (inspiré de TrussTool 3D)

Date : 2026-10-22 · Suite de [scene.md](scene.md) (truss paramétriques déjà livrées).

## 1. Ce que fait TrussTool 3D (observé sur trusstool.com/jstool, sans compte)

| Fonction | Comportement observé |
|---|---|
| Catalogue | 175 éléments réels (systèmes F32 / F33 / F34 = 2, 3 ou 4 membrures). Chaque fiche : nom, vignette, longueur, poids, angle, encombrement (L×H×P). |
| Filtres | Par système (F32/F33/F34), par catégorie (droites, angles, cercles, spéciaux), recherche texte, tri nom / longueur / récemment utilisés. |
| « Masquer les éléments inutilisables » | La liste ne montre que les éléments dont un connecteur est compatible avec le connecteur actif de la structure. |
| Construction par connecteurs | Chaque élément déclare ses **connecteurs** : position, face (direction de sortie), type (F32/F33/F34), genre (mâle / femelle / hybride). On clique un connecteur libre (sphère orange translucide) puis un élément : il s'accroche dessus, aligné. |
| Panneau « Nouvel élément » | **Rotate** (roulis autour de l'axe du connecteur, par pas de 180° en F32, 120° en F33, 90° en F34), **Flip** (accrocher par l'autre connecteur de la pièce), **Orientation du 1er élément**, **Répéter** (ajouter N fois le même élément dans l'axe), **Supprimer / choisir un autre**. |
| Barre d'outils | Grille, axes, cotes de la structure, recentrer, nomenclature (liste des pièces), annuler, supprimer, capture PNG, aide. |
| Compte | Sauvegarde / chargement, TrussCloud (bibliothèque partagée), envoi devis par mail, panier boutique. |
| Infos | Dimensions globales et **poids total** de la construction. |

Point clé : ce n'est pas un placement libre. **Tout se construit de connecteur à connecteur**, donc la géométrie est toujours juste et la nomenclature est exacte.

## 2. Ce que Luma a déjà

- `src/core/model/schemas.ts` — `trussSchema` : formes paramétriques (`line`, `circle`, `square`, `corner`, `tee`, `cross`, `totem`), position x/y, `height`, `rotation` autour de la verticale uniquement.
- `src/core/visualizer/truss.ts` — segments 2D, `trussEnds`, `snapTrussEnds` (aimantation bout à bout à 35 cm), supports, accroche des projecteurs (`snapToTrusses`, `followTruss`).
- `src/core/visualizer/library.ts` — 14 pièces génériques (droites 0,5→4 m, angle, té, croix, totems, cercle, carré, pont).
- `src/renderer/features/stage3d/environment.ts` — rendu 3D procédural `boxTruss` (pas de modèles OBJ).
- `scene.ts` / `StageCanvas.tsx` — édition 3D (gizmo) et plan 2D, accroche des projecteurs.

**Limites par rapport à TrussTool** : pas de vrais connecteurs 3D (tout est à plat, sauf le totem), pas de pièce inclinée ni d'angle à 45/60/120/135°, pas de système 2/3/4 membrures, pas de poids ni de nomenclature, construction par glisser + aimantation approximative.

## 3. Choix d'architecture (recommandé)

**Ne pas remplacer `trussSchema`** : les projets existants, l'IA (`sceneFromText`, `sceneEdit`, `templates`) et l'accroche des projecteurs en dépendent. On ajoute un **mode « assemblage »** :

- Une pièce assemblée reste un `Truss` (donc tout l'existant marche), avec des champs **optionnels** en plus :
  - `catalogId?: string` — référence de la pièce du catalogue.
  - `pose?: { pos: vec3; quat: [x, y, z, w] }` — placement 3D complet (prioritaire sur x/y/height/rotation quand présent).
  - `links?: { connector: string; to: string; toConnector: string }[]` — graphe des connexions.
- Les champs existants (`x`, `y`, `height`, `rotation`, `length`) sont **dérivés** de `pose` à l'enregistrement → plan 2D, supports et accroche projecteurs continuent de fonctionner.
- Migration : aucune (champs optionnels). Documenter dans `docs/PROJECT_FORMAT.md`.

## 4. Plan d'action par phases

### Phase 0 — Cadrage (½ jour)
- [ ] Valider : catalogue **générique** (« carré 29 cm », « triangle 29 cm », « plat 29 cm ») plutôt que le catalogue d'une marque. On ne reprend ni noms commerciaux, ni images, ni modèles 3D, ni code de Global Truss.
- [ ] Systèmes de départ : **carré 4 membrures** en priorité (le plus courant), puis triangle et plat.

### Phase 1 — Modèle de connecteurs (core, sans UI) — 2 j
Nouveau fichier : `src/core/visualizer/connectors.ts`
- [ ] `ConnectorDef = { id; pos: vec3; dir: vec3 (sortie); up: vec3 (référence de roulis); system: 'duo' | 'trio' | 'quatro'; gender: 'm' | 'f' | 'h' }`.
- [ ] `CatalogPiece = { id; label; system; category: 'straight' | 'corner' | 'junction' | 'circle' | 'base' | 'special'; length; weightKg; size: vec3; connectors: ConnectorDef[]; geometry: GeometrySpec }`.
- [ ] `compatible(a, b)` : même système, genres compatibles (m↔f, h↔tout).
- [ ] `rollStep(system)` : π (duo), 2π/3 (trio), π/2 (quatro).
- [ ] `attach(parentPose, parentConn, piece, pieceConnIdx, rollIndex) → Pose` : aligne `dir` de la pièce en opposition avec celui du parent, puis roulis par pas de `rollStep`. Utiliser `three` (`Quaternion.setFromUnitVectors`), déjà en dépendance.
- [ ] `freeConnectors(structure)` : connecteurs non liés, en coordonnées monde.
- [ ] Tests `tests/unit/connectors.test.ts` : droite + droite = longueur cumulée ; angle 90° puis droite = coude correct ; 4 roulis en quatro reviennent à l'identité ; trio sur quatro refusé.

### Phase 2 — Catalogue générique — 1–2 j
Nouveau fichier : `src/core/visualizer/trussCatalog.ts`
- [ ] Droites 0,25 / 0,5 / 1 / 1,5 / 2 / 2,5 / 3 / 4 m (quatro, trio, duo).
- [ ] Angles 2 départs : 45°, 60°, 90°, 120°, 135° ; nœuds 3D 3 à 6 départs (cube) ; té, croix.
- [ ] Segments de cercle par diamètre, embases, totems, entretoises.
- [ ] Poids indicatifs par pièce (ordre de grandeur : ~4–5 kg/m en carré 29 cm).
- [ ] Brancher dans `library.ts` (groupe `'truss'` avec sous-filtres système / catégorie).

### Phase 3 — Schéma & persistance — 1 j
- [ ] Étendre `trussSchema` avec `catalogId`, `pose`, `links` optionnels + dérivation des champs plats.
- [ ] Opérations core `attachPiece`, `detachPiece`, `rollPiece`, `flipPiece`, `repeatPiece` qui renvoient la nouvelle liste `trusses`, appliquée via `project.update` (garde l'annuler / rétablir de la scène existant).
- [ ] Mettre à jour `docs/PROJECT_FORMAT.md`.

### Phase 4 — Rendu 3D des pièces — 2 j
`src/renderer/features/stage3d/environment.ts`
- [ ] Géométrie depuis `GeometrySpec` en réutilisant `boxTruss` ; variantes trio (3 membrures) et duo (échelle).
- [ ] Angles et nœuds : nœud + bras (base existante : `JUNCTION_ARMS`).
- [ ] Appliquer `pose` (quaternion) quand présent, sinon comportement actuel.
- [ ] Sphères des connecteurs libres (orange translucide), visibles en mode assemblage ; surbrillance au survol (`userData.connector`).
- [ ] Instancing au-delà de ~200 pièces (voir `quality.ts`).

### Phase 5 — Interaction « constructeur » — 3 j
Nouveau panneau : `src/renderer/features/visualizer/TrussBuilderPanel.tsx`
- [ ] Mode assemblage (bouton dans la barre Stage) : clic sur un connecteur libre = connecteur actif.
- [ ] Liste du catalogue : vignettes générées (rendu offscreen three), filtres système / catégorie, recherche, tri, récents.
- [ ] Option « masquer les incompatibles » (filtre `compatible`).
- [ ] Clic sur une pièce → **aperçu fantôme** accroché au connecteur actif, puis : **Pivoter**, **Retourner** (connecteur suivant de la pièce), **Répéter ×N**, **Valider**, **Annuler**. Raccourcis R / F / Entrée / Échap.
- [ ] Première pièce : posée au centre, choix horizontal / vertical.
- [ ] Après validation, le connecteur actif passe au connecteur libre opposé de la nouvelle pièce (enchaînement rapide).
- [ ] Suppression : si elle coupe la structure en deux (graphe `links`), proposer de supprimer la branche détachée.
- [ ] i18n : `fr.stage.ts` / `en.stage.ts`.

### Phase 6 — Infos & sorties — 1–2 j
- [ ] Dimensions de la boîte englobante (L × l × H), **poids total**, nombre de pièces.
- [ ] **Nomenclature** groupée (quantités, poids) + export CSV.
- [ ] Cotes dans la vue 3D (bouton).
- [ ] Capture PNG de la vue.
- [ ] Spécifique Luma : poids des projecteurs accrochés (`fixture.trussId`) ajouté → avertissement indicatif de charge par portée (jamais présenté comme un calcul certifié).

### Phase 7 — IA et modèles — 1–2 j
- [ ] `sceneFromText` / `sceneEdit` : l'IA produit une **liste d'assemblage** (« pont de 8 m sur 2 totems de 3 m ») résolue par `attach` côté core → géométrie toujours juste.
- [ ] Gabarits : pont sur pieds, portique, cube ground support, cercle suspendu, goal post.
- [ ] 3–4 cas d'éval dans `tests/eval`.

### Phase 8 — Validation — 1 j
- [ ] Tests unitaires core, tests composant du panneau, un e2e : portique 3 pièces → nomenclature et poids vérifiés.
- [ ] Rétro-compatibilité : projets de démo (`src/core/demo`) ouverts sans régression.
- [ ] Perf : 300 pièces fluides.

## 5. Hors périmètre (volontairement)
- Comptes en ligne, cloud partagé, panier, devis par mail (fonctions commerciales de la marque ; Luma enregistre déjà les projets en local).
- Calcul de charge certifié (responsabilité légale : avertissements indicatifs seulement).
- Import des modèles OBJ, noms ou images Global Truss (propriété de la marque).

## 6. Estimation
≈ 12–15 jours. Ordre : 1 → 2 → 3 → 4 → 5 (premier livrable utilisable), puis 6, 7, 8.
Premier jalon démontrable (fin phase 5) : construire au clic un portique « totem + droite 4 m + totem » avec Pivoter / Retourner.
