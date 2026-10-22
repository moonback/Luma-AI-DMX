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
| A-06 | Geometries partagees (geo) jamais liberees entre les montages/demontages. Fuites memoire potentielles si Stage3D est remonte. | PARTIELLEMENT IMPLEMENTE | P1 | rig.ts:76-97 |
| A-07 | Fenetre detachee (DetachedStage3D) : F11 fullscreen correct ; connexion au store Zustand correcte. | IMPLEMENTE ET VERIFIE | - | Visualizer.tsx:18 |

---

## 2. Ergonomie et interface

| # | Constat | Statut | Gravite | Fichier |
|---|---------|--------|---------|---------|
| E-01 | Barre d outils superieure : cameras, orbite, solo, lumiere ambiante, edition, rendu, capture, video, plein ecran, presentation, FPS. Fonctionnel mais dense. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx:194-270 |
| E-02 | Inspecteur contextuel absent dans la vue 3D. Proprietes du projecteur uniquement dans le panneau de scene gauche, jamais dans un panneau droit integre. | ABSENT | P1 | - |
| E-03 | Barre d etat existante mais sans : mode courant lisible, indicateur de grille, nombre d objets, niveau de qualite. | PARTIELLEMENT IMPLEMENTE | P1 | Stage3D.tsx:279-295 |
| E-04 | Preréglages de qualite (Edition / Equilibre / Qualite / Presentation) : absents. | ABSENT | P1 | - |
| E-05 | Selection multiple : Ctrl/Maj + clic fonctionnel. Transformation groupee (gizmo) : seulement 1 objet. | PARTIELLEMENT IMPLEMENTE | P2 | scene.ts:357 |
| E-06 | Raccourcis clavier : 1-5 cameras, F cadrer, R orbite, I solo, H presentation. Bien implémentes. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx:160-179 |
| E-07 | Menus contextuels (clic droit en mode edition) fonctionnels. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx:19-57 |
| E-08 | Infobulles (hover) sur les projecteurs : nom, intensite, couleur, pan/tilt. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx:271-276 |
| E-09 | Dimensions affichees pendant le glissement du gizmo. | IMPLEMENTE ET VERIFIE | - | scene.ts:185-232 |
| E-10 | Accrochage a la grille fonctionnel (translate et rotation 15°). | IMPLEMENTE ET VERIFIE | - | scene.ts:509-516 |
| E-11 | Accrochage aux structures : snapToTrusses et snapTrussEnds fonctionnels. | IMPLEMENTE ET VERIFIE | - | scene.ts:186-202 |
| E-12 | Indicateur de l outil actif (deplacer / pivoter) visible en mode edition. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx:219-222 |
| E-13 | Mode presentation (bare) fonctionnel. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx:193 |
| E-14 | Panneau de scene gauche bien structure. | IMPLEMENTE ET VERIFIE | - | ScenePanel.tsx |
| E-15 | Repli/ouverture du panneau de scene memorise dans le store Zustand. | IMPLEMENTE ET VERIFIE | - | Visualizer.tsx:52-53 |
| E-16 | Redimensionnement du panneau de scene par glisser absent. | PARTIELLEMENT IMPLEMENTE | P3 | - |
| E-17 | La barre d etat deborde sur les panneaux en vue split (right: 290px fixe). | PARTIELLEMENT IMPLEMENTE | P2 | styles.css:451 |
| E-18 | FPS affiche dans la toolbar, pas dans la barre d etat. | PARTIELLEMENT IMPLEMENTE | P1 | Stage3D.tsx:236 |

---

## 3. Rendu visuel

| # | Constat | Statut | Gravite | Fichier |
|---|---------|--------|---------|---------|
| V-01 | Faisceaux volumetriques avec shader BEAM_FRAG (bruit, bord mou, attenuation, noyau brillant). | IMPLEMENTE ET VERIFIE | - | rig.ts:28-58 |
| V-02 | Taches de lumiere au sol et cyclorama (gobos, etirement selon incidence). | IMPLEMENTE ET VERIFIE | - | rig.ts:324-337 |
| V-03 | Bloom (UnrealBloomPass) activable. | IMPLEMENTE ET VERIFIE | - | scene.ts:276-279 |
| V-04 | Fumee basse (shader noise, 3 couches animees). | IMPLEMENTE ET VERIFIE | - | environment.ts:316-343 |
| V-05 | Brume parametrable 0-100 %. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx:241 |
| V-06 | Ambiances (5 presets) fonctionnelles. | IMPLEMENTE ET VERIFIE | - | quality.ts:87-111 |
| V-07 | Sol mat / laque / mouille (reflector). | IMPLEMENTE ET VERIFIE | - | quality.ts:117-131 |
| V-08 | Eclairage reel (RealLights) : pool adaptatif 4-24 SpotLights, budget dynamique. | IMPLEMENTE ET VERIFIE | - | quality.ts:17-78 |
| V-09 | Strobe, prisme, barres LED multi-cellules, anneaux LED, ecrans LED. | IMPLEMENTE ET VERIFIE | - | rig.ts, actors.ts |
| V-10 | Selection visuelle : emissive violette + anneau. | IMPLEMENTE ET VERIFIE | - | rig.ts:292-294 |
| V-11 | Vignette radiale CSS. | IMPLEMENTE ET VERIFIE | - | styles.css:445 |
| V-12 | Preréglages unifies Edition/Equilibre/Qualite/Presentation : absents. | ABSENT | P1 | - |

---

## 4. Performance et robustesse

| # | Constat | Statut | Gravite | Fichier |
|---|---------|--------|---------|---------|
| P-01 | RAF gere correctement, annule dans dispose(). | IMPLEMENTE ET VERIFIE | - | scene.ts:551-553 |
| P-02 | Cle de dependance envKey evite les rebuilds inutiles de l environnement. | IMPLEMENTE ET VERIFIE | - | scene.ts:426-437 |
| P-03 | Rigs rebuildes uniquement si rigKey change. | IMPLEMENTE ET VERIFIE | - | scene.ts:473-481 |
| P-04 | Geometries partagees creees une seule fois dans geometries() ; non liberees entre montages. | PARTIELLEMENT IMPLEMENTE | P1 | rig.ts:76 |
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
| T-02 | Montage/demontage du composant Stage3D : non teste. | ABSENT | P1 | - |
| T-03 | Changements de camera : non testes. | ABSENT | P2 | - |
| T-04 | Raccourcis clavier : non testes. | ABSENT | P2 | - |
| T-05 | Preferences persistantes (localStorage round-trip) : non testees. | ABSENT | P2 | - |
| T-06 | Undo/redo de scene cote service : couvert. | IMPLEMENTE ET VERIFIE | - | tests/unit/visualizer3d.test.ts:225 |
| T-07 | Preréglages de qualite : non couverts (a implementer). | ABSENT | P1 | - |

---

## 6. Accessibilite et i18n

| # | Constat | Statut | Gravite | Fichier |
|---|---------|--------|---------|---------|
| I-01 | useT() utilise pour les cles existantes. Texte en dur restant : Editer, Grille, labels FR du menu contextuel. | PARTIELLEMENT IMPLEMENTE | P2 | Stage3D.tsx:216,224 |
| I-02 | ARIA role=menu, role=menuitem, aria-pressed corrects. | IMPLEMENTE ET VERIFIE | - | Stage3D.tsx |
| I-03 | aria-label manquant sur les chips Move3d et Rotate3d (icone seule sans texte). | PARTIELLEMENT IMPLEMENTE | P2 | Stage3D.tsx:220-221 |

---

## 7. Plan de correction priorise

### P0 a implementer dans cette session

| ID | Action | Fichiers touches |
|----|--------|-----------------|
| C-01 | Preréglages de qualite (4 boutons dans le panneau Rendu) appliquant un jeu coherent de Prefs. | Stage3D.tsx, scene.ts |
| C-02 | Barre d etat enrichie : mode courant, nombre d objets, grille, niveau qualite, FPS deplace ici. | Stage3D.tsx, styles.css |
| C-03 | Inspecteur contextuel : proprietes cles de l objet selectionne dans un panneau discret a droite de la vue 3D. | Stage3D.tsx, styles.css |
| C-04 | disposeGeometries() appelee dans dispose(). | rig.ts, scene.ts |
| C-05 | Tests : loadPrefs/savePrefs round-trip, stageGeometry, preréglages de qualite. | tests/unit/stage3d.test.ts |

### P1 directement lies aux P0

| ID | Action |
|----|--------|
| C-06 | Corriger right: 290px de .stage3d-status. |
| C-07 | Ajouter aria-label aux boutons Move3d et Rotate3d. |
| C-08 | FPS deplace de la toolbar vers la barre d etat. |

---

## 8. Risques et limites connues

- WebGL non disponible en JSDOM : les tests de composant qui montent Stage3D echouent sur la detection WebGL ; ils couvrent le chemin d erreur, pas le rendu lui-meme.
- Reflecteur de sol : coute un render complet supplementaire ; desactive par defaut (sol mat).
- Pas de photometrie exacte : les avertissements sont des estimations sans occultation. Documente dans les tooltips.
- geo cache (rig.ts) : jamais libere entre montages. Acceptable si Stage3D n est pas remonte frequemment.
