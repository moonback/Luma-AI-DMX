# Refonte du design « Régie » inspirée des consoles MA Lighting

Statut : **plan à valider, rien n'est implémenté.**
Périmètre : le renderer Electron/React (`src/renderer`). Aucun changement du moteur, du modèle ni de l'IPC.

Objectif : donner à Luma AI DMX l'allure et l'ergonomie d'une console d'éclairage professionnelle de la famille grandMA3 : fond quasi noir, palette sobre, couleurs d'état codées, typographie compacte, grilles de « pools » à tuiles, barres de commande, encodeurs et faders, fenêtres en panneaux denses, ligne de commande et barre de vues.

Règle de propriété intellectuelle : on s'**inspire** des conventions du métier (densité, codes couleur, pools, encodeurs), on ne **copie** ni le nom, ni le logo, ni les icônes, ni les polices, ni les captures, ni les teintes exactes de MA Lighting. Aucun asset tiers n'est ajouté : les icônes restent celles de `lucide-react` et les polices restent Inter et les polices système. Le thème s'appelle « Régie » dans le code et la doc, jamais « MA ».

---

## 1. Inventaire du système visuel actuel

### 1.1 Tokens (`src/renderer/styles.css`, l. 4-30)

| Rôle | Token | Valeur actuelle |
|---|---|---|
| Fond | `--bg` | `#0b0d12` (bleu nuit) |
| Surfaces | `--panel`, `--panel-2`, `--panel-3` | `#121620`, `#191f2b`, `#202838` |
| Bordures | `--border`, `--border-strong` | `#283142`, `#36415a` |
| Texte | `--text`, `--text-2`, `--text-3` | `#f2f5fa`, `#98a3b5`, `#66718a` |
| Accent principal | `--violet` (+ `-soft`) | `#8b5cf6` : sélection, bouton primaire, onglet actif, focus des champs |
| Accent secondaire | `--cyan` (+ `-soft`) | `#22d3ee` : focus clavier, valeurs touchées, cue suivant, position |
| États | `--ok`, `--warn`, `--err` | vert, ambre, rouge |
| Formes | `--radius`, `--radius-sm` | 8 px, 5 px |
| Typo | `--font`, `--mono` | Inter / Segoe UI 13 px, JetBrains Mono / Cascadia |
| Mouvement | `--dur` | 120 ms, 0 ms en mouvement réduit (média + classe `.reduced-motion`) |

Constats :
- L'identité actuelle est celle d'une app « SaaS sombre » : dégradés violet → cyan (`.brand-mark`, `.progress`, `.dmx-cell .bar`), pastilles très arrondies (`999px` sur les badges, les chips et le mode), ombres portées, flou (`backdrop-filter` sur la 3D).
- Couleurs en dur hors tokens : une trentaine de `rgba(...)` dans `styles.css` et 56 hex dans le TS/TSX, dont 24 dans `features/visualizer/drawStage.ts`, d'autres dans `stage3d/textures.ts` et `rig.ts`, plus `QUICK_COLORS` dans `LiveConsole.tsx`.
- 252 `style={{…}}` en ligne dans les TSX (par exemple dans `TopBar` d'`App.tsx`), qui contournent les tokens.
- **Bug existant** : `.mode-badge.live` lance l'animation `pulse-live 1.6s infinite` sans tenir compte du mouvement réduit, car `--dur` n'agit pas sur `animation`. `.meter > div` a aussi `60ms` en dur.
- Les familles d'attributs ont déjà leur couleur : `.fam-intensity` (jaune), `.fam-color` (violet), `.fam-position` (cyan), `.fam-beam` (rose). C'est une bonne base pour coder la couleur des encodeurs.
- Réglages d'apparence existants (`core/settings/settings.ts`) : `reducedMotion`, `uiScale` (0,8 à 1,4, appliqué par `zoom`) et `language`. Pas de réglage de thème.

### 1.2 Feuille de style

Un seul fichier, `styles.css` (353 lignes), découpé en sections : Shell, Primitives, Overlays, Console, DMX monitor, Timeline, AI, 3D stage, Stage page. Le contrôle `check-file-size.mjs` ne porte que sur les `.ts/.tsx`, mais la refonte va faire grossir le fichier : on le découpera quand même (voir lot 1).

### 1.3 Composants (`src/renderer/components/ui.tsx`, 159 lignes)

`PageHead`, `Panel` (titre, actions, corps), `Empty`, `Field`, `NumberInput`, `Modal` (fermeture par Échap ou clic hors de la fenêtre, `role="dialog"`), `ConfirmHost`, `Tabs` (`role="tablist"`/`tab`), et les helpers `pct`, `dmx`, `useResolved`, `useThrottled`. D'autres primitives n'existent qu'en CSS, sans composant : `.btn` (+ `primary accent danger ghost sm lg icon on`), `.go-btn`, `.badge`, `.chip`, `.led`, `.table`, `.input/.select/.textarea`, `.check`, `.fader`, `.xy`, `.fx-grid/.fx-tile`, `.dmx-grid/.dmx-cell`, `.tl-*`, `.kpi`, `.progress`, `.meter`, `.toast`, `.drawer`.

À noter : `ConfirmHost` contient `Annuler` et `Modal` contient `Fermer (Échap)` en dur ; le cliquet i18n les compte.

### 1.4 Coque (`src/renderer/App.tsx`, 328 lignes)

Grille de `52px / 1fr / 26px` sur `212px / 1fr` (`56px` quand la navigation est repliée) :
- `TopBar` : marque, projet et cue courant, Nouveau/Ouvrir/Enregistrer, badge `SIMULATION`/`LIVE`, statuts Sortie, Moteur, BPM (tap), IA, aide, alertes, Blackout, STOP/Reprendre.
- `Sidebar` : les 14 pages de `PAGES` (`store.ts`), chacune avec son icône, son libellé et son raccourci, plus le bouton de repli.
- `StatusBar` : métriques du moteur, rig, programmeur, couches actives, Master, bouton Diagnostics.
- Calques : `DiagnosticsDrawer`, `Toasts`, `OnboardingHost`, `StartScreen`, `ConfirmHost`.

### 1.5 Espaces de travail (`features/*`)

| Page | Fichier (lignes) | Mise en page actuelle |
|---|---|---|
| Dashboard | `Dashboard.tsx` (115) | KPI en grille + panneaux |
| Fixtures | `Fixtures.tsx` (294) | tableau de patch + modale d'ajout |
| Live Console | `LiveConsole.tsx` (353) | `split console-split` : à gauche les tuiles de fixtures et les chips de sélection, à droite les panneaux par famille (faders, swatches, XY) |
| Programmer | `Programmer.tsx` (170) | panneaux Groupes / Scènes / valeurs en tableaux, textes encore en dur |
| Cues | `Cues.tsx` (140) | tableau de cues + GO |
| Effects | `Effects.tsx` (170) | liste + réglages |
| Timeline | `Timeline.tsx` (183) | pistes `.tl-*` |
| IA | `AiDirector.tsx` (176) | chat + cartes d'action |
| Visualizer 2D | `Visualizer.tsx`, `visualizer/*` | canvas + `ScenePanel` (306) |
| Stage 3D | `Stage3D.tsx` (299), `stage3d/*` | three.js + barre d'outils flottante |
| Audio / Musique | `Audio.tsx` (169), `Music.tsx` (207), `music/*` | panneaux + bandes de sections |
| Output | `Output.tsx` (317), `output/HardwarePanel.tsx` | onglets Sorties / Moniteur 512 / Diagnostics |
| Settings | `Settings.tsx` (430, extraction i18n non commitée en cours) | onglets de formulaires |
| Accueil | `StartScreen.tsx`, `Onboarding.tsx` (276) | modales |

### 1.6 Ce que les tests imposent

`tests/e2e/app.spec.ts` (746 lignes, captures dans `test-results/screens/NN-*.png`) s'appuie sur :
- des **data-testid** : `mode`, `welcome`, `welcome-skip`, `nav-<page>`, `save`, `blackout`, `stop-output`, `add-fixture`, `add-profile`, `add-confirm`, `patch-table`, `fixture-tiles`, `dimmer-fader`, `monitor-source`, `ai-prompt`, `ai-send`, `ai-apply`, `proposal`, `ai-report`, `stage-canvas`, `stage-3d`, `fps`, `cam-*`, `stage-settings(-toggle)`, `cue-table`, `go`, `cue-state`, `output-artnet`, `arm`, `test-pattern-*`, `hardware-report(-text)`, `app-version`, `update-state`, `usage-enabled`, `feedback-*`, `language`, `settings-save`, `flash-alert`, `diagnostics`…
- des **classes CSS** : `.fx-tile` (dans `fixture-tiles`), `.modal`, `.modal input.input` (l'ordre des champs compte), `.top-project`, `.dmx-cell[data-ch]`.
- des **rôles et textes français** : les onglets `Moniteur 512 canaux`, `Sorties`, `Diagnostics`, `Apparence`, `Général`, `Logs, diagnostic et retours` ; les boutons `Aucun`, `Enregistrer scène`, `Enregistrer`, `Liste`, `Valider`, `Ajouter un cue`, `Reprendre`, `Armer la sortie`, `Désarmer`, `Lancer la mire`, `Arrêter la mire`, `/Relâcher l’IA/`, `/Stop/` ; les textes `SIMULATION`, `STOP — émissions réelles arrêtées`, `Lyre 1`…
- la **nature des éléments** : `dimmer-fader` reçoit `fill('255')` et doit donc rester un `<input type="range">`, pas une `div` dessinée. `language`, `add-profile`, `monitor-source`, `test-pattern-kind` et les `select` du `cue-table` doivent rester des `<select>`.

Les tests `tests/components/*.test.tsx` (`console`, `workspaces`, `startScreen`, `sectionEditor`) utilisent `getByRole('button')` et `getByRole('slider')`.

---

## 2. Direction de design « Régie »

### 2.1 Principes

1. **Le noir est le canevas.** Les surfaces se distinguent par de légers paliers de gris neutres, pas par des ombres ni des dégradés.
2. **La couleur est une information.** Chaque couleur vive signifie un état (sélectionné, dans le programmeur, actif, suivant, live, erreur) ou une famille d'attributs. Aucune couleur n'est décorative.
3. **Densité et alignement.** Grille de 4 px, contrôles de 24 à 26 px, coins de 2 px, libellés en petites capitales, chiffres en mono tabulaire.
4. **Tout est fenêtre.** Chaque bloc a une courte barre de titre, colorée selon son type (pool, feuille, encodeurs, vue scène), comme les fenêtres d'une console.
5. **Les commandes critiques ne bougent jamais.** STOP, Blackout, GO et Master restent visibles et grands.

### 2.2 Tokens proposés

Les noms actuels restent disponibles pendant la migration (alias) ; ils sont remplacés par des noms sémantiques au lot 13.

```css
:root {
  /* Surfaces neutres (gris anthracite, sans teinte bleue) */
  --bg: #050505;          /* canevas */
  --panel: #121212;       /* fenêtre */
  --panel-2: #1b1b1b;     /* tuile / champ */
  --panel-3: #252525;     /* survol / en-tête de fenêtre */
  --border: #2e2e2e;
  --border-strong: #474747;
  --text: #ececec;
  --text-2: #b0b0b0;
  --text-3: #8c8c8c;      /* ≥ 4,5:1 sur --panel (l'actuel #66718a ne l'atteint pas) */

  /* États codés */
  --sel: #ffc21a;         /* sélection : jaune */
  --sel-soft: rgb(255 194 26 / 0.14);
  --prog: #ff7a1a;        /* valeur dans le programmeur : orange */
  --prog-soft: rgb(255 122 26 / 0.16);
  --run: #3ccf6e;         /* en cours / actif / GO */
  --next: #3bb4ff;        /* cue suivant, focus clavier */
  --live: #e5352b;        /* LIVE, STOP, erreurs graves */
  --warn: #f0a020;
  --err: var(--live);
  --ok: var(--run);

  /* Familles d'attributs (bande de couleur des encodeurs et des pools) */
  --fam-intensity: #e8c840;
  --fam-position: #3bb4ff;
  --fam-color: #d05cff;
  --fam-beam: #4fd1a5;
  --fam-focus: #8aa0ff;
  --fam-control: #9a9a9a;

  /* Types de fenêtre (barre de titre) */
  --win-pool: #3a3320;
  --win-sheet: #1f2b3a;
  --win-encoder: #3a2a1f;
  --win-view: #262626;

  --radius: 2px;
  --radius-sm: 2px;
  --h-ctl: 26px;          /* hauteur des contrôles */
  --h-ctl-sm: 22px;
  --space: 4px;
  --font: 'Inter', 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif;
  --mono: 'JetBrains Mono', 'Cascadia Mono', 'Consolas', ui-monospace, monospace;
  --fs: 12px;  --fs-sm: 11px;  --fs-xs: 10px;
  --dur: 80ms;
}
```

Correspondances pendant la migration : `--violet → --sel` et `--violet-soft → --sel-soft` ; `--cyan` devient `--next` (focus, cue suivant) ou `--prog` (valeurs touchées) selon l'usage. Chaque usage est tranché dans le lot qui le touche.

Contrastes à vérifier (niveau AA, soit 4,5:1 pour le texte courant) : `--text-3` sur `--panel` et `--panel-2`, texte noir sur `--sel` et `--run` (boutons pleins), `--prog` et `--next` employés comme couleur de texte sur `--bg`. Un test unitaire calcule ces ratios à partir d'une table JS des tokens (lot 1).

### 2.3 Typographie

- Corps en 12 px, interligne 1,35. Libellés de fenêtre et en-têtes de tableau en 10-11 px, majuscules, interlettrage de 0,6 px, couleur `--text-2`.
- Les valeurs (DMX, %, adresses, numéros de pool, BPM, timecode) s'affichent en `--mono` avec `tabular-nums`.
- Pas de graisse au-delà de 650, sauf pour GO et STOP.
- `uiScale` reste le moyen d'agrandir l'interface (écrans tactiles de régie).

### 2.4 Composants clés

| Composant | Rôle | Implémentation |
|---|---|---|
| **Window** (`Panel` revu) | barre de titre de 22 px colorée selon le type, actions à droite, corps dense | évolution de `Panel` avec une prop `kind?: 'pool' \| 'sheet' \| 'encoder' \| 'view'` ; API compatible |
| **Pool / PoolTile** | grille de tuiles carrées numérotées : numéro en haut à gauche (mono), nom au centre, bande ou pastille de couleur en bas ; états `sel` (cadre jaune), `prog` (coin orange), `run` (fond vert sombre), vide (pointillés et « + ») | nouveau `components/pool.tsx` ; vrais `<button>` avec `aria-pressed` |
| **Encoder / EncoderBar** | barre basse d'encodeurs pour la famille active : nom de l'attribut, valeur en mono, réglage par glissement vertical ou molette, saisie directe au clic | nouveau `components/encoder.tsx`, construit **autour d'un `<input type="range">`** (rôle `slider`, clavier, `fill()` Playwright) |
| **Fader** | fader vertical type exécuteur : piste sombre, poignée claire, remplissage à la couleur de la famille, valeur en mono au-dessus | CSS de `.fader` revu, toujours sur `input[type=range]` |
| **Executor** | bloc GO / BACK / PAUSE avec fader, nom du cue courant et du suivant | nouveau `components/executor.tsx`, qui réutilise `runShortcut` et les actions `cue.*` |
| **CommandLine** | bande au-dessus de la barre d'état : sélection courante et écho lisible de la dernière action (`Fixture 1 Thru 4 · Dimmer 78 %`, `Go Liste 1 Cue 3`), saisie en option | nouveau `components/CommandLine.tsx` ; phrases dans l'i18n ; la saisie fait l'objet d'un lot optionnel (§ 4, question 2) |
| **ViewBar** | barre de vues : boutons carrés numérotés de 1 à 14, avec icône et nom court, page active en jaune | évolution de `Sidebar` (garde `nav`, `aria-label` et `data-testid="nav-*"`) |
| **ControlBar** (`TopBar`) | barre de commande : projet, mode, statuts en « LED » rectangulaires, BPM/tap, Master, Blackout, STOP | évolution de `TopBar`, mêmes testids |
| **Sheet** (`.table` revu) | feuille dense : lignes de 22 px, zébrage léger, ligne active en vert, suivante en bleu, sélectionnée en jaune, colonnes numériques alignées à droite en mono | CSS seul |
| **Boutons** | rectangulaires, 26 px, fond `--panel-2` ; état « on » = fond `--sel-soft` et bordure `--sel` ; primaire = fond `--sel` et texte noir ; danger = `--live` | CSS seul |
| **Chips** | deviennent de petits boutons rectangulaires (fin des pilules) | CSS seul |

### 2.5 Mise en page par espace de travail

Coque commune :
```
┌ ControlBar 40px : projet · mode · sortie · moteur · BPM · IA ········ Master · Blackout · STOP ┐
├ ViewBar 64px ┬ zone de travail (fenêtres en grille, gouttière 4 px) ──────────────────────────┤
│ 1 Tableau    │                                                                                 │
│ 2 Fixtures   │                                                                                 │
│ …            │                                                                                 │
├──────────────┴ CommandLine 26px : [sélection] › écho de la dernière action ─────────────────────┤
└ StatusBar 22px : moteur Hz · charge · rig · programmeur · couches · Diagnostics ───────────────┘
```

| Espace | Disposition cible |
|---|---|
| **Live Console** | à gauche, le pool Fixtures (tuiles numérotées, testid `fixture-tiles`, classe `.fx-tile` conservée), au-dessus d'un pool Groupes et des boutons de sélection (Tout, Aucun, Inverser, Pairs, Impairs, Touchés) ; à droite, les fenêtres d'encodeurs par famille (Intensité, Couleur avec ses swatches en pool, Position avec le XY, Faisceau) ; en bas, l'EncoderBar de la famille active |
| **Programmer** | en haut, les pools de presets (Couleurs, Positions, Faisceaux, Scènes) ; en bas, la feuille du programmeur (fixture × attribut, valeurs en orange) ; barre d'actions Enregistrer scène / Relâcher / Relâcher l'IA |
| **Cues & séquences** | à gauche, le pool Séquences ; au centre, la feuille de cues (actif en vert, suivant en bleu) ; à droite, l'Executor (grand GO, BACK, PAUSE, fader) |
| **Fixtures (patch)** | feuille de patch pleine largeur, panneau latéral de propriétés, pool de profils dans la modale d'ajout |
| **Effects** | pool d'effets + fenêtre de réglages en encodeurs |
| **Timeline** | pistes denses, règle en mono, tête de lecture en `--live` |
| **IA** | fenêtre « Commande IA » (prompt façon ligne de commande), cartes d'action en feuille compacte, rapport en mono |
| **Visualizer 2D / 3D** | vue en fenêtre `kind="view"` ; barre d'outils plate et opaque (fini le flou et l'effet verre) ; palette du canvas lue depuis les tokens |
| **Audio / Musique** | vumètres segmentés (plus de dégradé continu), bandes de sections en tuiles |
| **DMX Output** | moniteur 512 en grille de cellules carrées, barre de niveau en `--fam-intensity`, cellules modifiées cerclées de `--warn` ; sorties en feuille avec LED d'état |
| **Dashboard** | tableau de bord en tuiles KPI façon pool |
| **Settings, Accueil, Onboarding, modales, toasts** | fenêtres plates, onglets rectangulaires, focus en `--next` |

### 2.6 Accessibilité et mouvement

- Focus clavier toujours visible : contour de 2 px en `--next`, distinct du jaune de la sélection.
- Un état ne repose jamais sur la seule couleur : tuile sélectionnée = cadre + `aria-pressed` ; valeur du programmeur = coin + couleur ; cue actif = icône ▶ + couleur.
- Cibles d'au moins 24 × 24 px (WCAG 2.2, critère 2.5.8), même en mode dense.
- Mouvement réduit : toutes les `animation` et `transition` passent par `--dur`, et `pulse-live` devient un état statique quand `--dur` vaut `0ms` (correction du bug du § 1.1).
- Clignotements : aucun clignotement d'interface au-delà de 3 Hz, en cohérence avec la garde anti-flash du produit.

---

## 3. Lots ordonnés

Vérification commune à **chaque** lot (critère de fin implicite) :
1. `npm run typecheck`
2. `npm run lint` (eslint + 600 lignes maximum + cliquet i18n qui ne doit pas monter)
3. `npm run test`
4. `npm run test:e2e`, puis comparaison visuelle de `test-results/screens/*.png` avec les captures « avant » du lot 0.
5. Contrôle manuel rapide de l'écran touché en `npm run dev`, avec `reducedMotion` activé puis désactivé, et `uiScale` à 1,4.

Règles transverses :
- **i18n** : tout nouveau texte passe par `useT`/`t`, avec sa clé dans `fr.ts` **et** dans `en.ts`. Le cliquet compte les textes en dur **par fichier** : déplacer du JSX qui contient du texte en dur vers un nouveau fichier fait échouer le contrôle, car la référence de ce fichier est 0. On extrait donc d'abord les textes vers l'i18n, puis on déplace le code. Après une baisse, lancer `node scripts/check-i18n.mjs --update`.
- **600 lignes** : on découpe tout fichier qui approche 550 lignes avant d'y ajouter du code. À surveiller : `LiveConsole.tsx` (353), `Settings.tsx` (430), et `stage3d/scene.ts` (580), à ne pas toucher sans le découper.
- **Tests** : aucun testid, rôle, nom accessible ou texte français cité au § 1.6 ne change. Si un sélecteur CSS de l'e2e doit bouger (`.fx-tile`, `.modal`, `.modal input.input`, `.top-project`, `.dmx-cell[data-ch]`), on garde l'ancienne classe à côté de la nouvelle.
- **Modifications non commitées actuelles** (`Settings.tsx`, `BetaPanel.tsx`, `fr.ts`, `en.ts`, `i18n-baseline.json`, `sceneFromText.ts`) : à commiter ou à mettre de côté avant le lot 1.
- Un lot = un commit (ou une PR) ; aucun lot ne dépend d'un lot ultérieur.

### Lot 0 — Captures de référence et garde-fous

- **Fichiers** : `docs/plans/refonte-ma/avant/*.png` (copie de `test-results/screens`) ; `tests/e2e/app.spec.ts`, avec deux captures de plus si elles manquent : le Programmer seul et la Live Console avec une sélection multiple (on garde l'actuelle `03-console.png`).
- **Fin** : captures « avant » archivées, e2e vert.
- **Risques** : aucun.
- **Fait le 2026-10-18** : 41 captures dans `docs/plans/refonte-ma/avant/`, dont la nouvelle `15b-console-selection.png`. L'e2e n'était **pas** vert avant la refonte : 5 à 6 scénarios échouaient déjà sur cette machine, avec ou sans la nouvelle capture. Il s'agit de `scène : avancée…` (vidéo WebM vide sous SwiftShader), puis, en cascade, `structures`, `interprètes`, `création rapide`, `localisation par caméra`, et parfois `bibliothèque`. Les captures 17 à 27 de ces scénarios peuvent donc être incomplètes. Référence pour les lots suivants : 17 scénarios verts sur 22, et ce nombre ne doit pas baisser.

### Lot 1 — Tokens et base CSS

- **Fichiers** : `src/renderer/styles.css` découpé en `src/renderer/styles/{tokens,base,shell,primitives,console,monitor,timeline,ai,stage}.css`, importés par `styles.css` (Vite gère `@import`) ; nouvelles valeurs des tokens + alias ; remplacement des `rgba(...)` en dur par des tokens `-soft` ; prise en compte du mouvement réduit par `pulse-live` et `.meter` ; `src/renderer/theme.ts` (table JS des tokens utiles au canvas et au test de contraste) ; `tests/components/theme.test.ts` (ratios de contraste).
- **Fin** : toute l'application passe aux gris neutres et à l'accent jaune sans qu'aucun TSX ne change ; plus de dégradé violet/cyan ; contraste AA vérifié par un test.
- **Risques** : des écrans peuvent devenir moins lisibles là où le violet servait à la fois de « sélection » et de « primaire » ; l'arbitrage entre `--sel` et `--next` est documenté dans `tokens.css`. Les couleurs en dur du TS (canvas, 3D) gardent l'ancienne palette jusqu'au lot 10 : incohérence visuelle temporaire acceptée.
- **Vérification** : vérification commune + test de contraste.

### Lot 2 — Composants de base

- **Fichiers** : `components/ui.tsx` (`Panel` avec la prop `kind`, `Tabs` rectangulaires, `Modal`, extraction i18n de `Annuler` et `Fermer (Échap)`) ; nouveaux `components/pool.tsx`, `components/encoder.tsx`, `components/executor.tsx`, et leur CSS dans `styles/primitives.css` et `styles/pool.css` ; tests `tests/components/pool.test.tsx` et `encoder.test.tsx` (rôle `slider`, flèches et PageUp au clavier, valeur affichée).
- **Fin** : composants disponibles et testés, pas encore branchés dans les pages, sauf `Panel`, `Tabs` et `Modal`, dont l'API ne change pas.
- **Risques** : `Panel` est utilisé partout, d'où une prop `kind` optionnelle avec un rendu neutre par défaut ; `Tabs` doit garder `role="tab"` et les libellés exacts.

### Lot 3 — Coque de l'application

- **Fichiers** : `App.tsx` (328 lignes) découpé en `components/shell/ControlBar.tsx`, `ViewBar.tsx`, `StatusBar.tsx` et `CommandLine.tsx` ; `App.tsx` garde la composition, les raccourcis et `bootstrap`. Dans `store.ts`, un état `lastCommand` (écho de la dernière action, alimenté par `act` dans `api.ts`). `styles/shell.css`. Clés i18n `cmd.*` pour les phrases de la ligne de commande.
- **Fin** : nouvelle barre de commande, barre de vues, ligne de commande en écho et barre d'état dense ; STOP, Blackout et Reprendre gardent leurs testids, leurs titres et leurs textes.
- **Risques** :
  - les textes en dur de `TopBar` (`LIVE`, `SIMULATION`, `STOP`, `Master`, `BPM`) doivent passer dans l'i18n **avant** le déplacement du composant (`SIMULATION` reste identique en `fr` et en `en`, puisque l'e2e le lit) ;
  - `.top-project` et `data-testid="mode"` sont à conserver ;
  - le `title` de `stop-output` doit toujours contenir `Shift+Esc` ;
  - la ligne de commande ne doit pas capturer le clavier (raccourcis globaux, `allowedWhileTyping`).
- **Vérification** : vérification commune + navigation complète de la coque au clavier (Tab, raccourcis de pages, Shift+Échap).

### Lot 4 — Live Console (priorité 1)

- **Fichiers** : `features/LiveConsole.tsx` découpé en `features/console/FixturePool.tsx` (ex-`FixtureTiles`), `console/FamilyEncoders.tsx` et `console/ColorPool.tsx` ; `styles/console.css`. `QUICK_COLORS` reste une donnée : ce sont des couleurs de lumière, pas de thème.
- **Fin** : disposition du § 2.5, tuiles de pool numérotées avec les états sel/prog, encodeurs par famille avec leurs bandes `--fam-*`, EncoderBar en bas ; la sélection multiple Ctrl/Maj ne change pas.
- **Risques** : `data-testid="fixture-tiles"` et la classe `.fx-tile` sur chaque tuile ; `dimmer-fader` reste un `<input type="range">` ; le bouton `Aucun` garde ce nom exact ; le scénario 3D clique sur `getByText('Lyre 1')` dans `fixture-tiles` ; `tests/components/console.test.tsx` doit rester vert. Les textes extraits vers les nouveaux fichiers passent par l'i18n avant le déplacement.
- **Vérification** : vérification commune + comparaison des captures `03-console` et `16*`.

### Lot 5 — Programmer (priorité 2)

- **Fichiers** : `features/Programmer.tsx`, avec extraction i18n des textes en dur au passage (`Groupes`, `Depuis la sélection`, titres…) ; éventuellement `features/programmer/PresetPools.tsx`.
- **Fin** : pools de presets et de scènes en tuiles, feuille du programmeur avec les valeurs en `--prog`, barre d'actions.
- **Risques** : boutons `Enregistrer scène` et `/Relâcher l’IA/`, modale (premier champ `.modal input.input`, bouton `Enregistrer`) ; scénario e2e « programmeur → scène → liste de cues → GO ».
- **Vérification** : vérification commune + capture `08-programmer`.

### Lot 6 — Cues & séquences + exécuteurs

- **Fichiers** : `features/Cues.tsx`, branchement de `components/executor.tsx`.
- **Fin** : pool de séquences, feuille de cues colorée, exécuteur GO/BACK/PAUSE.
- **Risques** : testids `cue-table`, `go`, `cue-state` ; boutons `Liste`, `Valider`, `Ajouter un cue`, `/Stop/` ; les `select` de la feuille restent des `<select>`.

### Lot 7 — Fixtures (patch)

- **Fichiers** : `features/Fixtures.tsx`.
- **Fin** : feuille de patch dense, modale d'ajout avec un pool de profils.
- **Risques** : l'e2e dépend de l'ordre des champs `.modal input.input` (univers, quantité, préfixe, tags) ; `add-profile` reste un `<select>` ; `patch-table` et le texte `7–12`.

### Lot 8 — Effects et Timeline

- **Fichiers** : `features/Effects.tsx`, `features/Timeline.tsx`, `styles/timeline.css`.
- **Fin** : pool d'effets + réglages en encodeurs ; pistes denses.
- **Risques** : glisser-déposer et poignées `.tl-ev .handle` (zones de saisie d'au moins 7 px à conserver).

### Lot 9 — DMX Output et moniteur

- **Fichiers** : `features/Output.tsx`, `features/output/HardwarePanel.tsx`, `styles/monitor.css`.
- **Fin** : feuille des sorties avec LED, moniteur 512 en cellules carrées.
- **Risques** : `.dmx-cell[data-ch]` ; onglets `Sorties`, `Moniteur 512 canaux`, `Diagnostics` ; testids `output-artnet`, `arm`, `monitor-source`, `test-pattern-*`, `hardware-report*` ; texte `STOP — émissions réelles arrêtées` ; bouton `Armer la sortie`.

### Lot 10 — Visualiseur 2D et scène 3D

- **Fichiers** : `features/visualizer/drawStage.ts` (ses 24 couleurs en dur passent dans `theme.ts`), `visualizer/ScenePanel.tsx`, `visualizer/sceneCards.tsx`, `features/Stage3D.tsx` (habillage seulement), `styles/stage.css` ; `stage3d/textures.ts` et `rig.ts` uniquement pour les couleurs d'interface, pas pour celles de la lumière. **Ne pas toucher `stage3d/scene.ts` (580 lignes).**
- **Fin** : barres d'outils plates et opaques, panneau scène en fenêtre dense, canvas aux couleurs du thème.
- **Risques** : testids `stage-canvas`, `stage-3d`, `fps`, `cam-*`, `stage-settings*` ; performances 3D (`npm run test:perf`) ; la suppression du `backdrop-filter` apporte un léger gain.
- **Vérification** : vérification commune + `npm run test:perf` + captures `07`, `16`, `16b`, `16c`.

### Lot 11 — IA, Audio, Musique

- **Fichiers** : `features/AiDirector.tsx`, `features/Audio.tsx`, `features/Music.tsx`, `features/music/*`, `styles/ai.css`.
- **Fin** : prompt IA façon ligne de commande, cartes d'action en feuille, vumètres segmentés, bandes de sections en tuiles.
- **Risques** : testids `ai-prompt`, `ai-send`, `ai-apply`, `proposal`, `ai-report`, et textes `Mode local déterministe`, `Ambiance lounge`, `Vérification de l’état calculé` ; `tests/components/sectionEditor.test.tsx`.

### Lot 12 — Dashboard, Settings, Accueil, Onboarding, overlays

- **Fichiers** : `features/Dashboard.tsx` ; `features/Settings.tsx` (après le commit de l'extraction i18n en cours ; 430 lignes, à découper si besoin) ; `features/settings/*` ; `features/StartScreen.tsx` ; `features/Onboarding.tsx` ; toasts et tiroir de diagnostics dans la coque.
- **Fin** : tous les écrans restants passent au thème Régie.
- **Risques** : testids `welcome`, `welcome-skip`, `app-version`, `update-state`, `usage-enabled`, `feedback-*`, `language`, `settings-save`, `diagnostics` ; onglets `Apparence`, `Général`, `Logs, diagnostic et retours` ; `tests/components/startScreen.test.tsx` et `workspaces.test.tsx`.

### Lot 13 — Nettoyage et documentation

- **Fichiers** : tous les `styles/*.css` (suppression des alias `--violet`/`--cyan`, renommage final) ; remplacement des `style={{…}}` restants par des classes ; `docs/screenshots/*.png` régénérées ; `docs/ARCHITECTURE.md` (section sur le thème, avec un lien vers ce plan) ; le `README` s'il cite des captures.
- **Fin** : `grep -- "--violet\|--cyan" src/renderer` ne renvoie plus rien ; les captures de la doc sont à jour ; les captures « après » sont archivées dans `docs/plans/refonte-ma/apres/`.
- **Risques** : régressions visuelles silencieuses ; la comparaison avant/après a déjà été faite à chaque lot, il s'agit ici d'une revue d'ensemble.

### Ordre et parallélisation

Les lots `0 → 1 → 2 → 3` sont séquentiels : chacun s'appuie sur le précédent. Viennent ensuite `4 → 5 → 6`, dans cet ordre (priorités demandées, et le lot 6 réutilise l'exécuteur). Les lots `7` à `12` sont indépendants entre eux (fichiers disjoints) et peuvent avancer en parallèle dans des worktrees séparés, à condition que deux lots n'éditent pas le même fichier `styles/*.css` (un fichier CSS par lot), ni `fr.ts`/`en.ts` en même temps (les clés i18n sont fusionnées en fin de lot). Le lot `13` vient en dernier.

---

## 4. Questions à trancher avant l'implémentation

1. **Bascule de thème** : remplacer l'ancien thème (recommandé : moins de code et de tests) ou ajouter un réglage `appearance.theme` « Régie / Classique » ?
2. **Ligne de commande** : simple écho lisible des actions (recommandé pour cette refonte) ou vraie saisie de syntaxe (`Fixture 1 Thru 4 At 50`) avec un analyseur, dans un lot séparé après le lot 13 ?
3. **Barre de vues** : garder la navigation à gauche (recommandé : moins de risque, habitudes conservées) ou la placer à droite comme sur une console ?
4. **Densité** : contrôles de 26 px par défaut avec `uiScale` pour le tactile (recommandé), ou un mode « tactile » dédié ?
