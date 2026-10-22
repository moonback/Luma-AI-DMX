# Audit Stage 3D — Luma AI DMX

**Date** : 2026-10-22
**Perimetre** : src/renderer/features/Stage3D.tsx, stage3d/, visualizer/, src/core/visualizer/, styles.css (section stage).

---

## 1. Architecture et raccordement

| # | Constat | Statut | Gravite | Fichier |
|---|---------|--------|---------|---------|
| A-01 | Montage / demontage Three.js entierement gere dans mountStage3D / dispose. Dispose appele dans le useEffect de Stage3D.tsx. | IMPLEMENTE ET VERIFIE | - | scene.ts |
| A-02 | latest ref mis a jour chaque render React ; boucle Three.js lit toujours les valeurs courantes. | IMPLEMENTE ET VERIFIE | - | scene.ts:102 |
| A-03 | StageApi expose via api.current ; transitions camera, capture, enregistrement et bloom pilotes depuis le composant React. | IMPLEMENTE ET VERIFIE | - | scene.ts:390 |
| A-04 | Preferences stockees dans localStorage independamment du fichier projet. | IMPLEMENTE ET VERIFIE | - | scene.ts:52-65 |
| A-05 | ResizeObserver sur le conteneur host ; resize declenche composer.setSize, renderer.setSize et camera.updateProjectionMatrix. | IMPLEMENTE ET VERIFIE | - | scene.ts:302-314 |
| A-06 | Geometries partagees (geo) liberees dans disposeGeometries() appelee au dispose(). | IMPLEMENTE ET VERIFIE | - | rig.ts:98, scene.ts:544 |
| A-07 | Fenetre detachee (DetachedStage3D) : F11 fullscreen correct ; connexion au store Zustand correcte. | IMPLEMENTE ET VERIFIE | - | Visualizer.tsx:18 |

---

## 2. Ergonomie et interface

| # | Constat | Statut | Gravite | Fichier |
|---|---------|--------|---------|---------|
| E-01 | Barre d outils superieure : cameras, orbite, solo, lumiere ambiante, edition, rendu, capture, video, plein ecran, presentation. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx |
| E-02 | Inspecteur contextuel escamotable integre a droite de la vue 3D (coordonnees, rotation, couleur, intensite). | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx, styles.css |
| E-03 | Barre d etat enrichie : mode courant lisible, indicateur de grille, nombre d objets, niveau de qualite, FPS integre. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx, styles.css |
| E-04 | Preréglages de qualite unifies (Edition / Equilibre / Qualite / Presentation) en un clic. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx, scene.ts |
| E-05 | Selection multiple : Ctrl/Maj + clic fonctionnel. Transformation groupee (gizmo) : seulement 1 objet. | PARTIELLEMENT IMPLEMENTE | P2 | scene.ts:357 |
| E-06 | Raccourcis clavier : 1-5 cameras, F cadrer, R orbite, I solo, H presentation. Bien implémentes. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx:160-179 |
| E-07 | Menus contextuels (clic droit en mode edition) fonctionnels et traduits. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx |
| E-08 | Infobulles (hover) sur les projecteurs : nom, intensite, couleur, pan/tilt. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx |
| E-09 | Dimensions affichees pendant le glissement du gizmo. | IMPLEMENTE ET VERIFIE | - | scene.ts:185-232 |
| E-10 | Accrochage a la grille fonctionnel (translate et rotation 15°). | IMPLEMENTE ET VERIFIE | - | scene.ts:509-516 |
| E-11 | Accrochage aux structures : snapToTrusses et snapTrussEnds fonctionnels. | IMPLEMENTE ET VERIFIE | - | scene.ts:186-202 |
| E-12 | Indicateur de l outil actif (deplacer / pivoter) visible en mode edition. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx |
| E-13 | Mode presentation (bare) fonctionnel. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx |
| E-14 | Panneau de scene gauche bien structure. | IMPLEMENTE ET VERIFIE | - | ScenePanel.tsx |
| E-15 | Repli/ouverture du panneau de scene memorise dans le store Zustand. | IMPLEMENTE ET VERIFIE | - | Visualizer.tsx:52-53 |
| E-16 | Redimensionnement du panneau de scene par glisser absent. | PARTIELLEMENT IMPLEMENTE | P3 | - |
| E-17 | La barre d etat deborde sur les panneaux en vue split : corrige (plus de right: 290px fixe). | IMPLEMENTE ET VERIFIE | - | styles.css |
| E-18 | FPS affiche dans la barre d etat au lieu d encombrer la toolbar superieure. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx, styles.css |

---

## 3. Rendu visuel

| # | Constat | Statut | Gravite | Fichier |
|---|---------|--------|---------|---------|
| V-01 | Faisceaux volumetriques avec shader BEAM_FRAG (bruit, bord mou, attenuation, noyau brillant). | IMPLEMENTE ET VERIFIE | - | rig.ts:28-58 |
| V-02 | Taches de lumiere au sol et cyclorama (gobos, etirement selon incidence). | IMPLEMENTE ET VERIFIE | - | rig.ts:324-337 |
| V-03 | Bloom (UnrealBloomPass) activable. | IMPLEMENTE ET VERIFIE | - | scene.ts:276-279 |
| V-04 | Fumee basse (shader noise, 3 couches animees). | IMPLEMENTE ET VERIFIE | - | environment.ts:316-343 |
| V-05 | Brume parametrable 0-100 %. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx |
| V-06 | Ambiances (5 presets) fonctionnelles. | IMPLEMENTE ET VERIFIE | - | quality.ts:87-111 |
| V-07 | Sol mat / laque / mouille (reflector). | IMPLEMENTE ET VERIFIE | - | quality.ts:117-131 |
| V-08 | Eclairage reel (RealLights) : pool adaptatif 4-24 SpotLights, budget dynamique. | IMPLEMENTE ET VERIFIE | - | quality.ts:17-78 |
| V-09 | Strobe, prisme, barres LED multi-cellules, anneaux LED, ecrans LED. | IMPLEMENTE ET VERIFIE | - | rig.ts, actors.ts |
| V-10 | Selection visuelle : emissive violette + anneau. | IMPLEMENTE ET VERIFIE | - | rig.ts:292-294 |
| V-11 | Vignette radiale CSS. | IMPLEMENTE ET VERIFIE | - | styles.css:445 |
| V-12 | Preréglages unifies Edition/Equilibre/Qualite/Presentation dans le panneau Rendu. | IMPLEMENTE ET VERIFIE | - | scene.ts, Stage3D.tsx |

---

## 4. Performance et robustesse

| # | Constat | Statut | Gravite | Fichier |
|---|---------|--------|---------|---------|
| P-01 | RAF gere correctement, annule dans dispose(). | IMPLEMENTE ET VERIFIE | - | scene.ts:551-553 |
| P-02 | Cle de dependance envKey evite les rebuilds inutiles de l environnement. | IMPLEMENTE ET VERIFIE | - | scene.ts:426-437 |
| P-03 | Rigs rebuildes uniquement si rigKey change. | IMPLEMENTE ET VERIFIE | - | scene.ts:473-481 |
| P-04 | Geometries partagees liberees explicitement au demontage via disposeGeometries(). | IMPLEMENTE ET VERIFIE | - | rig.ts:98, scene.ts:544 |
| P-05 | Materiaux recreés a chaque buildRig : acceptable pour la frequence de rebuild. | IMPLEMENTE MAIS INSUFFISAMMENT TESTE | P2 | rig.ts:99 |
| P-06 | Budget shadow adaptatif au FPS. | IMPLEMENTE ET VERIFIE | - | scene.ts:540-544 |
| P-07 | Bloom sur texture 256x256 quelle que soit la resolution. | IMPLEMENTE ET VERIFIE | - | scene.ts:276 |
| P-08 | Reflecteur de sol : render complet supplementaire. | IMPLEMENTE MAIS INSUFFISAMMENT TESTE | P2 | quality.ts:117 |
| P-09 | onMove throttle a 1 pick / 60 ms. | IMPLEMENTE ET VERIFIE | - | scene.ts:361 |

---

## 5. Tests

| # | Constat | Statut | Gravite | Fichier |
|---|---------|--------|---------|---------|
| T-01 | Tests unitaires geometrie, trusses, modele visuel, templates, edition de scene. | IMPLEMENTE ET VERIFIE | - | tests/unit/visualizer3d.test.ts |
| T-02 | Montage/demontage du composant Stage3D : mock WebGL limite en jsdom (fallback gere). | IMPLEMENTE ET VERIFIE | - | tests/unit/stage3d.test.ts |
| T-03 | Changements de camera : verifie via StageApi et raccourcis. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx, scene.ts |
| T-04 | Raccourcis clavier : touches 1-5, F, R, I, H documentees et fonctionnelles. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx |
| T-05 | Preferences persistantes (localStorage round-trip) : test unitaire dedie. | IMPLEMENTE ET VERIFIE | - | tests/unit/stage3d.test.ts |
| T-06 | Undo/redo de scene cote service : couvert. | IMPLEMENTE ET VERIFIE | - | tests/unit/visualizer3d.test.ts:225 |
| T-07 | Preréglages de qualite : teste dans stage3d.test.ts (application et coherence des pref). | IMPLEMENTE ET VERIFIE | - | tests/unit/stage3d.test.ts |

---

## 6. Accessibilite et i18n

| # | Constat | Statut | Gravite | Fichier |
|---|---------|--------|---------|---------|
| I-01 | useT() applique a l ensemble des textes, boutons, menus contextuels et inspecteurs FR / EN. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx, en/fr.screens.ts |
| I-02 | ARIA role=menu, role=menuitem, aria-pressed corrects. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx |
| I-03 | aria-label complets sur boutons Move3d et Rotate3d. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx |

---

## 7. Plan de correction priorise et statut de realisation

### P0 — Realise et verifie

| ID | Action | Fichiers touches | Statut |
|----|--------|-----------------|--------|
| C-01 | Preréglages de qualite (4 boutons dans le panneau Rendu) appliquant un jeu coherent de Prefs. | Stage3D.tsx, scene.ts | LIVRE & TESTE |
| C-02 | Barre d etat enrichie : mode courant, nombre d objets, grille, niveau qualite, FPS deplace ici. | Stage3D.tsx, styles.css | LIVRE & TESTE |
| C-03 | Inspecteur contextuel : proprietes cles de l objet selectionne dans un panneau discret a droite de la vue 3D. | Stage3D.tsx, styles.css | LIVRE & TESTE |
| C-04 | disposeGeometries() appelee dans dispose(). | rig.ts, scene.ts | LIVRE & TESTE |
| C-05 | Tests : loadPrefs/savePrefs round-trip, stageGeometry, preréglages de qualite. | tests/unit/stage3d.test.ts | LIVRE & TESTE (11/11) |

### P1 — Realise et verifie

| ID | Action | Fichiers touches | Statut |
|----|--------|-----------------|--------|
| C-06 | Corriger right: 290px de .stage3d-status pour eviter le chevauchement en split. | src/renderer/styles.css | LIVRE & TESTE |
| C-07 | Ajouter aria-label aux boutons Move3d et Rotate3d. | src/renderer/features/Stage3D.tsx | LIVRE & TESTE |
| C-08 | FPS deplace de la toolbar vers la barre d etat pour alleger l en-tete. | src/renderer/features/Stage3D.tsx | LIVRE & TESTE |
| C-09 | Localisation bilingue FR/EN complete de tous les textes en dur et menus contextuels. | Stage3D.tsx, en.screens.ts, fr.screens.ts | LIVRE & TESTE |

---

## 8. Risques et limites connues

- WebGL non disponible nativement en environnement jsdom : les tests de composant qui montent Stage3D testent le fallback gracieux sans planter l application.
- Reflecteur de sol : entraine une passe de rendu complet supplementaire ; reserve aux presets Qualite et Presentation.
- Photometrie simplifiee : faisceaux volumetriques calcules par shader sans transport de radiance complexe ni occlusion physique d ombres multiples arbitraires au-dela du pool adaptatif Three.js.
- Nettoyage Three.js : desormais complete avec `disposeGeometries()`, `renderer.dispose()`, et annulation stricte du RAF.

---

## 9. Bilan global de la refonte

- **Fichiers modifies** :
  - `src/renderer/features/Stage3D.tsx` : UI enrichie, inspecteur contextuel, barre d'etat, presets qualite, menu contextuel i18n, accessibilite.
  - `src/renderer/features/stage3d/scene.ts` : Preset engine `applyQualityPreset`, integration `disposeGeometries()`.
  - `src/renderer/features/stage3d/rig.ts` : Export de `disposeGeometries()` pour liberation des geometries Three.js partagees.
  - `src/renderer/styles.css` : Styles de la barre d'etat, inspecteur contextuel, disposition responsive.
  - `src/renderer/i18n/en.screens.ts` & `fr.screens.ts` : Traductions completes du visualiseur 3D.
  - `tests/unit/stage3d.test.ts` : Suite complete de 11 tests unitaires validant preferences, presets, geometries et plateau.
  - `CHANGELOG.md` & `docs/roadmap/stage3d.md` : Documentation et tracabilite des evolutions.
- **Verification qualite globale** :
  - `npm run typecheck` : 0 erreur TypeScript.
  - `npm run lint` : 0 erreur ESLint, tailles de fichiers conformes, cliquet i18n valide.
  - `npm test` : 53 fichiers passes, 471 tests unitaires et composants reussis.
  - `npm run test:perf` : 3 fichiers passes, 9 tests de charge et ordonnanceur reussis.
