# Audit Song to Show — Luma-AI-DMX 1.9.0

> Audit réalisé le 2026-11-08 sur la branche `master` (commit `8467bfc`). Lecture directe du code : aucune capacité n'est retenue sans avoir été vérifiée dans la source. Les numéros de ligne renvoient à ce commit.
>
> **Mise à jour du 2026-11-08 :** les défauts des §3.1 à §3.6 ont été corrigés sur la branche `fix/timeline-track-bpm`. Le détail est en [§7](#7-correctifs-appliqués-mise-à-jour-du-2026-11-08) ; les constats d'origine sont conservés pour la traçabilité.

## 0. Grille de statut utilisée dans tous les documents

| Statut | Critère |
|---|---|
| **Opérationnel** | Chemin complet UI → commande → moteur → sortie DMX, vérifié dans le code, couvert par des tests. |
| **Partiel** | Fonctionne, mais une partie du comportement promis (par un nom, un commentaire, un schéma ou l'UI) n'est pas tenue. |
| **Simulé** | Produit une valeur plausible qui n'est pas mesurée (constante, heuristique déguisée en mesure). |
| **Déclaratif** | Présent dans un schéma, un type, un enum ou une UI, mais jamais consommé ou jamais rendu. |
| **Inexistant** | Aucune trace dans le code. |

## 1. Architecture réelle

```
Fichier audio (renderer)
  └─ musicPlayer.load()             SHA-256, décodage WebAudio, downmix mono 22,05 kHz
      └─ analyzeWorker.ts           Web Worker (repli sur le thread UI si le Worker échoue)
          └─ core/music/analyze.ts  analyzeAudio() → SongAnalysis (BPM, beats, downbeats, sections, tonalité, événements)
  └─ music.addTrack / music.storeAudio  (analyse dans le projet ; audio stocké dans <dataDir>/music/<hash>, hors projet)

music.generate (main, handlers/music.ts)
  ├─ planShow()       planLocally() (règles, showPlanner.ts)  ou  planShowWithOpenRouter() (LLM, validé + cache disque)
  └─ applyShow()      compileShow() (songToShow.ts) → scènes + effets + timeline + cue list
                      validateShowIntegrity() + evaluateArtisticQuality() → notices
                      removeGenerated() : supprime TOUT ce que le morceau avait généré avant

Lecture : musicPlayer.play() → envoie `timeline.timecode` toutes les 100 ms
          Engine.timelineChase() : la timeline avance seule, recale si l'écart dépasse 80 ms
```

Points forts d'architecture, réels et rares dans ce segment :
- **Séparation plan / compilation.** Le LLM ne produit jamais de DMX. Il produit un `ShowPlan` typé (zod), réparé si besoin (`repairShowSection`), puis compilé de façon déterministe. C'est la bonne architecture hybride.
- **Repli local systématique.** Sans clé, en erreur ou après annulation, les règles locales prennent le relais (`askOpenRouter`, `fallbackToLocal`).
- **Cache de réponses IA** indexé sur morceau, intention, rig, variante, modèle et effort : reproductible et gratuit au deuxième appel.
- **Sécurité intégrée au compilateur.** Le strobe n'est autorisé que via les paramètres, et le garde-fou photosensible (`effectFlashViolation`) est évalué par section, avec un remplacement expliqué.

## 2. Analyse fonctionnelle point par point (§3.1)

| Capacité | Statut | Ce que fait réellement le code | Limites vérifiées |
|---|---|---|---|
| Import et chargement audio | Opérationnel | `accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a"`, décodage WebAudio, empreinte SHA-256 (un fichier déjà analysé n'est pas réanalysé). | L'audio n'est **pas** dans le fichier projet : `project.export` n'écrit que le JSON (`saveProjectFile`). Sur une autre machine, le show s'ouvre mais ne se joue pas (« Fichier audio non chargé : réimportez-le »). |
| Analyse hors ligne | Opérationnel | `analyzeAudio()` dans un Web Worker, avec progression. Traitement du signal et règles explicites, sans modèle entraîné (en-tête de `analyze.ts`, l. 5-10). | Mono 22,05 kHz. Aucune mise en cache par version d'algorithme (`version: 1` figé). |
| Détection du BPM | Opérationnel | Peigne d'autocorrélation et a priori log-normal (`estimateTempo`, l. 95-113), puis régression linéaire sur les beats (l. 375-380). | Un seul BPM global est exploité par le compilateur. |
| Détection des beats | Opérationnel | Programmation dynamique d'Ellis 2007 (`trackBeats`, l. 116-137). | Grille unique pour tout le morceau. |
| `bpmConfidence` | Simulé (hypothèse à mesurer) | Calculée à partir du coefficient de variation des intervalles entre beats (l. 426-430). | Le traqueur DP produit par construction des intervalles réguliers. La confiance est donc vraisemblablement proche de 1 même sur une erreur d'octave. **Hypothèse non mesurée** : à valider sur un corpus. |
| Mesure 3/4 vs 4/4 | Partiel | `detectMeter` (l. 159-183) compare les phases d'après les flux de basse et les changements harmoniques. Le planificateur utilise `meter` (`showPlanner.ts`, `barSec`). | Le compilateur l'ignore : `barDuration = 60 / analysis.bpm * 4` (`songToShow.ts` l. 289). En 3/4, les sections longues sont mal comptées. |
| Changements de tempo | **Déclaratif** | `tempoChanges` est calculé (l. 383-417) et stocké dans le schéma. | Aucun consommateur dans `src`. Seul effet : le badge « variable » de l'UI. |
| Transitions et sections | Opérationnel | Matrice d'auto-similarité par mesure, nouveauté en damier, énergie et harmonie, avec un bonus de phrase (`boundaries`, l. 220-291). | Les frontières **ne sont pas éditables** par l'utilisateur (seul le libellé l'est : `music.setSection`). |
| Libellés intro / couplet / refrain / drop / break / build / pré-refrain / pont / outro | Partiel | Règles sur la répétition et l'énergie (`label`, l. 295-333). Un drop est un « refrain dominé par les basses et précédé d'un passage calme ». | Heuristique honnête (le README le dit), mais elle se trompe souvent sur les morceaux sans refrain répété. Le paramètre `vectors` est ignoré (`void vectors`, l. 331). |
| `confidence` de section | **Simulé** | `baseConf = 0.85`, +0,08 si le libellé est courant, +0,05 si la section dure au moins 8 s (l. 514-517). | Ce n'est pas une mesure. Elle est pourtant affichée dans l'explication (« classification estimée (confiance …) ») et transmise au LLM. |
| Analyse fréquentielle et spectrale | Opérationnel | 24 bandes log entre 40 Hz et 11 kHz (`dsp.ts`, `N_BANDS`, `BAND_LO/HI`), chroma, centroïde, RMS, flux spectral. | — |
| Basses / médiums / aigus | Partiel | `bass` et `high` sont extraits. La « brillance » est le centroïde spectral. | **Pas de bande médium exploitée.** L'analyseur live ne publie que `bass` et `brightness` (`AudioBands`). |
| Variations d'énergie | Opérationnel | RMS par mesure et par section, normalisé au maximum du morceau. | Normalisation relative : un morceau calme d'un bout à l'autre semble « énergique » à son pic. |
| Moments forts | Opérationnel | Impacts (onset ≥ 4 suivi d'un niveau 1,8× supérieur, l. 539-547), risers (montée des aigus sur au moins 2 mesures, l. 548-558), silences, voix. | Seuils fixes, non adaptés au genre. |
| Voix | Partiel | `vocals.ts` : activité des bandes 200-4000 Hz, segments d'au moins 1,5 s. | Heuristique : les synthés lead et les guitares sont souvent pris pour de la voix. Elle sert à la poursuite automatique et à la clarté vocale. |
| Tonalité | Opérationnel | Krumhansl-Schmuckler (`detectKey`, l. 351-362). Elle choisit une palette chaude ou froide si la confiance est d'au moins 0,3. | Le choix « mineur = froid » est une convention discutable (voir §4). |
| Structure | Partiel | Grappes de répétition par similarité cosinus > 0,9 (l. 489-494). | Le regroupement glouton dépend de l'ordre et n'a pas de garantie de stabilité. |
| Synchronisation des effets | Opérationnel *(corrigé, §7)* | Les effets ont `bpmSync: true` et sont relancés à chaque phrase. La timeline porte le BPM du morceau (`Timeline.bpm`). | Tempo fixe par morceau : la carte de tempo (`tempoChanges`) n'est pas encore exploitée. *Avant correctif : `engine.bpm` (§3.1).* |
| Génération des scènes | Opérationnel | Une scène par section, plus des surcouches (progression, blinder, accents, montées, poursuite, final). Une cue list GO est générée en parallèle. | Seulement 3 « couches » de machines : wash, moving, bars (`fixtureLayer`, l. 37-41). |
| Couleurs | Opérationnel | Palette chaude ou froide tournée par grappe, couleur d'accent sur les pics, rôles wash/lyres contrastés, symétrie miroir. | 8 couleurs codées en dur (`WARM`, `COLD`). Aucune harmonie calculée. |
| Mouvements | Opérationnel *(corrigé, §7)* | 13 types de mouvement, tous rendus ; mélange `offset` autour de la visée ; pas de mouvement erratique sur une section chantée. | Amplitude écrêtée près des butées pan/tilt. *Avant correctif : §3.2 et §3.3.* |
| Synchro DMX temps réel | Opérationnel | La timeline suit le timecode : envoi à 10 Hz, avance libre entre deux messages, recalage au-delà de 80 ms (`Engine.timelineChase`, l. 352-357). | IPC renderer → main. Pas de compensation de latence de sortie audio. |
| Personnalisation | Opérationnel | Intention texte, 4 curseurs d'ambiance, 5 préréglages de style, suggestions locales ou IA, retouche par section (texte libre ou éditeur), verrouillage, variantes, restauration. | Les règles locales ne comprennent **que le français** (commentaire de `Music.tsx` : « the local rules (parseIntent) only read French »). |
| Prévisualisation | Partiel | On joue le morceau : visualiseur 2D/3D et sortie virtuelle suivent le moteur. | Pas d'aperçu d'une section isolée sans lecture, ni de vignettes par section. L'audition A/B se limite à comparer les textes des plans (`VariantCompareModal`). |
| Export et sauvegarde | Partiel | Scènes, effets, timeline et cue list sont des objets standards du projet, donc éditables partout. | Pas d'export autonome du show (audio + timeline). Pas d'export vers d'autres consoles. |
| Qualité artistique | Partiel | `evaluateArtisticQuality` donne un score sur 100 (contraste, variété, narration, voix). | Il note le **plan**, pas le rendu compilé. Ses seuils et pondérations ne sont pas calibrés. Score visible dans l'UI (badge). |
| Intégrité | Partiel | `validateShowIntegrity` vérifie les références, la durée et le strobe, et avertit désormais (événements au-delà de la fin, timeline sans tempo propre, cues tronquées). | Les erreurs ne vont qu'au journal et aux notices, sans blocage. |

## 3. Défauts vérifiés, par ordre de gravité

### 3.1 [P0] Les effets du show ne tournent pas au tempo du morceau — ✅ corrigé (§7)

- `TimelineTransport.evaluate` calcule la phase des effets avec `effectRate(def, bpm, …)`, où `bpm` vaut `this.bpm` du moteur (`Engine.ts` l. 372).
- `engine.bpm` vient de `project.show.bpm` (`Engine.ts` l. 163), qui vaut **120 par défaut** (`createProject`, `format.ts`), ou du suivi BPM audio. Ce dernier est **désactivé par défaut** (`bpmFollow: { enabled: false }`, `schemas.ts` l. 319).
- `musicPlayer.play()` transmet `track.analysis.bpm` au seul prédicteur de drop (`audioEngine.startTrack`). Aucune commande ne règle le BPM du moteur sur celui du morceau. `grep analysis.bpm` ne renvoie aucun appel à `engine.bpm`.
- **Effet concret.** Pour un morceau à 128 BPM dans un projet à 120 BPM, l'écart est d'environ 6 %, soit à peu près 1 temps perdu tous les 16 temps. La dérive n'est remise à zéro qu'au début de l'événement suivant, car chaque événement repart de sa phase 0.
  - **Effets relancés à chaque phrase** : seuls l'effet principal et le mouvement **avec `phaseSpread > 0`** reçoivent une copie alternée et un événement par phrase (`songToShow.ts` l. 392-402). Pour eux (`wave`, `chase`, `chaseSlow`, `rainbow`, `colorChase`, `dimmerWave`, `gradient`, `panTilt`), la dérive atteint environ 2 temps en fin de phrase de 8 mesures.
  - **Effets sans relance** : tous les autres ont **un seul événement pour toute la section** (`if (!alt && j) return;`, fin = `sec.end`). Cela concerne `pulse`, `pulseSlow`, `glow`, les types strobe, les mouvements `fan`, `ballyhoo` et `random`, et tous les extras (`breathe`, `bassFollow`, `colorFollow`). Leur dérive s'accumule sur toute la section : **environ 8 temps sur un refrain de 60 s**. Le défaut est donc plus grave qu'une simple imprécision.
- Le garde-fou photosensible du compilateur, lui, évalue avec `analysis.bpm` (`songToShow.ts` l. 372). La **validation et la restitution n'utilisent donc pas le même tempo** : un effet jugé sûr à 128 BPM peut être joué à une autre cadence.
- **Correctif ciblé.** Ajouter un `bpm` facultatif au schéma `Timeline` (rempli par `compileShow`) et l'utiliser dans `TimelineTransport.evaluate` à la place de `engine.bpm`. Variante minimale : régler `engine.bpm` sur la valeur du morceau dans `timeline.timecode`. C'est moins propre, car cela touche les autres effets en cours.

### 3.2 [P0] `pendulum` et `zigzag` sont planifiés mais pas rendus — ✅ corrigé (§7)

- `moveFor` associe `pendulum` à la forme `'pingpong'` et `zigzag` à la forme `'zigzag'` (l. 215-216). Le schéma accepte ces formes (`schemas.ts` l. 238).
- `computeEffect`, cas `panTilt` (`engine/effects.ts`), ne traite que `circle`, `figure8` et `pan`. Tout le reste tombe dans `else set.tilt = …`.
- Résultat : les deux mouvements que le planificateur réserve aux sections denses (`perBeat >= 3`) et aux ponts sont **un simple balancement en tilt**. L'utilisateur lit « pendule » ou « zigzag » dans le tableau et voit autre chose.
- Aucun test ne couvre ces formes (`grep zigzag tests` est vide). Le LLM peut aussi les choisir.
- **Correctif.** Ajouter deux branches dans `computeEffect`, soit une dizaine de lignes et un test.

### 3.3 [P1] Les mouvements écrasent la position de repos dessinée — ✅ corrigé (§7)

- `sceneValues` calcule une visée soignée (croisement au sol, V vers le public, faisceaux aériens : `restingAim`, l. 103-107). Le commentaire de la l. 143 dit : « movement effects swing around it ».
- Or `moveFor` crée des effets `panTilt` / `fan` / `randomMove` en `blend: 'override'` sans `offset`. L'offset vaut donc 0,5 par défaut (`effectParamsSchema`), et `mergeSources` remplace la valeur (`override`). **Les lyres oscillent autour du centre DMX (0,5 / 0,5), pas autour de la visée.**
- Avec `focus === 'audience'`, seul le pan est remplacé et le tilt garde la visée : le cas « public » est donc partiellement juste.
- **Correctif.** Soit des effets de position relatifs (un `blend: 'offset'` additif autour de la valeur sous-jacente, à ajouter dans `merge.ts`), soit un `offset` égal au pan/tilt calculé, par machine. La première option profite aussi au Directeur IA et aux effets manuels.

### 3.4 [P1] `snap` et `flicker` ne sont pas des effets rythmiques, et la famille strobe est quasi inatteignable — ✅ corrigé (§7)

- `snap` et `flicker` sont des `strobe` **sans `bpmSync`** (l. 183, l. 186). `effectRate` prend donc `speed`, plafonné à `maxStrobeHz` (10 Hz par défaut). « Snap » n'est pas un flash par temps : c'est un strobe à 10 Hz avec un rapport cyclique de 10 %.
- `allowStrobe` vaut `false` par défaut (`settings.ts`). Tout effet de type `strobe` est alors remplacé par un chase, avec la notice « strobe non autorisé (Paramètres › IA) », y compris le `flicker` que le planificateur choisit **lui-même** pour les sections d'énergie 3 (`showPlanner.ts`, `effect = alt ? 'pulse' : 'flicker'`).
- Même avec le strobe autorisé, un strobe plein champ à 10 Hz dépasse très probablement les 3 flashes/s de `effectFlashViolation` (simulation de 3 s à 40 Hz) et devient une pulsation lente. **À confirmer par un test.** La famille strobe produit donc surtout des notices.
- **Correctif.** Redéfinir `snap` comme un flash synchronisé au temps (`bpmSync`, `beatsPerCycle: 1`, rapport cyclique court, sur un sous-ensemble de machines), ce qui reste sous les 3 flashes/s à moins de 180 BPM. Ne plus proposer `flicker` sans autorisation du strobe.

### 3.5 [P0 produit] Une régénération efface silencieusement les retouches de timeline — ✅ correctif minimal appliqué (§7)

- `applyShow` appelle `removeGenerated` : suppression des scènes, effets, timeline et cue list du morceau. Ce chemin sert à `music.generate`, `music.updateSection`, `music.regenerateSection` et `music.restorePrevious`.
- Toute modification faite à la main dans l'éditeur de timeline (`Timeline.tsx`, `timeline.upsert`) ou sur les scènes générées est **perdue sans avertissement** dès qu'on retouche une section, même autre.
- Il y a deux sources de vérité (`ShowPlan` d'un côté, objets compilés de l'autre) sans réconciliation.
- **Correctif minimal (quick win).** Mémoriser une empreinte des objets générés et, si elle a changé, demander confirmation avant d'écraser. **Correctif complet.** Marquer les événements « édités à la main » et les réinjecter après compilation (fusion sur la timeline).

### 3.6 [P2] Autres écarts constatés — ✅ traités (§7)

- `RigInfo` est déclarée deux fois (`songToShow.ts` et `showPlanner.ts`), avec une copie divergente des types.
- `explicitProps` dans `adjustSection` est calculé puis jeté (`void explicitProps`, commentaire « used to guard future auto-recompute »).
- Les paramètres `_hasVocals` et `_confidence` de `sectionPlan` ne sont pas utilisés : la voix n'influence pas le plan local, sauf via la poursuite au moment de la compilation.
- `ShowIntegrityReport.warnings` n'est jamais rempli.
- Changer le libellé d'une section (`music.setSection`) ne recompile pas : il faut cliquer sur « Régénérer », et rien ne le signale à l'utilisateur.
- `ARTISTIC_STRATEGIES[variant % 5]` : la 6e variante redonne « Équilibrée » avec seulement une palette tournée. Ce n'est pas une variante nouvelle, mais l'UI la présente comme telle.
- `phraseBars` (option du compilateur) n'est exposé ni dans l'UI ni dans les paramètres.
- `music.page.title` : la navigation dit « Show Musique », la documentation et le code disent « Song-to-Show ».

## 4. Ce que Song to Show fait bien, et qu'il faut préserver

1. **Un plan explicable.** Chaque section porte un `why` lisible (« Refrain, énergie mesurée 0,82 → niveau 5/5 ; même musique que la section 3 → même palette »). C'est un différenciateur réel face aux outils « boîte noire ».
2. **Une grammaire scénique crédible.** Respiration noire avant un drop, crossfade sur la durée du fade suivant, escalade des refrains répétés, montée par riser, button final sur le dernier impact, coupure de la timeline sur les silences, poursuite pendant le chant, symétrie miroir, alternance de direction par phrase. Ce sont des règles de concepteur lumière, pas des effets aléatoires.
3. **Le verrouillage par section** est conservé par la régénération locale comme par le LLM.
4. **La cue list GO générée en parallèle de la timeline** permet de jouer le show à la main (en live, sans lecteur audio).

Point à challenger : « tonalité mineure ⇒ palette froide » est une convention, pas une vérité. Beaucoup de titres pop ou EDM en mineur sont festifs. Il vaut mieux combiner brillance, énergie et intention, et laisser la tonalité en signal faible.

## 5. Évaluation des pistes d'évolution (§3.2)

Légende : **E** existe, **P** partiel, **N** nouveau. Verdict : ✅ recommandé, ⚠️ sous condition, ❌ déconseillé.

### 5.1 Analyse musicale intelligente

| Idée | État | Verdict | Justification |
|---|---|---|---|
| Intro / couplet / refrain / drop / break / outro | P | ✅ | Existe en heuristique. Gain le plus rentable : **rendre les frontières éditables** (glisser, scinder, fusionner) et apprendre des corrections. Plus fiable qu'un modèle. |
| Changements d'ambiance | P | ✅ | Chroma, brillance et énergie sont déjà là. Il suffit d'exposer un « mood vector » par section (tonalité locale, brillance, densité). |
| Instruments dominants | N | ❌ (pour l'instant) | Il faudrait un modèle (séparation de sources ou classification). C'est lourd (ONNX de plusieurs dizaines de Mo, latence d'import) et la valeur lumière est modeste face à « basses / aigus / voix ». À réserver à une option tardive. |
| Intensité émotionnelle | P | ⚠️ | L'énergie RMS et la brillance couvrent l'essentiel du besoin. Une « émotion » apprise ne serait pas vérifiable par l'opérateur. Préférer une **courbe d'énergie éditable**. |
| Moments nécessitant une transition | E | ✅ | Les frontières, impacts et risers existent. Il faut surtout exploiter `tempoChanges`, aujourd'hui déclaratif. |
| Prédiction des événements | E (live) | ✅ | `DropPredictor` (live) et `predictFromTrack` (piste connue) existent. Il manque une **UI de confiance et d'armement** visible pendant le show. |

### 5.2 Génération par IA

| Idée | État | Verdict | Justification |
|---|---|---|---|
| Show complet automatique | E | — | Existe déjà (local et LLM). |
| Plusieurs propositions par morceau | P | ✅ | Les variantes existent mais une seule est mémorisée (`previousPlan`). Il faudrait **N variantes nommées et comparables** (A/B/C) avec audition par section. |
| Palettes adaptées à l'ambiance | P | ✅ | Remplacer les 8 couleurs fixes par une génération par harmonie (analogue, complémentaire, triade), selon l'énergie, la brillance et la contrainte « couleurs de marque ». C'est déterministe et local. |
| Transitions intelligentes | P | ✅ | Les fades par sens d'énergie et la respiration existent. Ajouter le type de transition (cut, fondu, montée, wipe spatial) au `ShowSectionPlan`. |
| Mouvements synchronisés | P | ✅ | Corriger d'abord §3.2 et §3.3, puis ajouter des positions nommées (presets de focus) comme cibles. |
| Adaptation aux équipements | P | ✅ | Le classement en 3 couches est trop grossier. Il faut des **rôles** (face, contre, latéraux, sol, aérien, blinder, effet) déduits de la position et du profil. C'est le plus gros levier qualité (voir FEATURE_IDEAS F-04). |
| Styles concert / festival / club / mariage / corporate / art | P | ✅ | Aujourd'hui, 5 préréglages de **texte** et 5 stratégies. Il faudrait des **profils de style structurés** (bornes d'énergie, palette, densité d'effets, strobe, fumée, mouvement). |

### 5.3 Direction artistique

| Idée | État | Verdict | Justification |
|---|---|---|---|
| Style visuel et ambiance | P | ✅ | Voir les profils de style ci-dessus. |
| Langage naturel | E (FR seul en local) | ✅ | Le LLM comprend toutes les langues, mais les règles locales seulement le français. Il faut une **intention structurée** (chips) en plus du texte libre, indépendante de la langue. |
| Scènes alternatives | P | ✅ | Proposer 3 alternatives au niveau de la section (la commande `regenerateSection` existe déjà). |
| Anti-répétition | P | ✅ | Seulement l'alternance `alt` et le contrôle « 3 sections consécutives ». Il faut un **budget de répétition** global (même look au plus N fois, sauf grappe identique voulue). |
| Progression artistique | P | ✅ | L'escalade des refrains existe. Il faut une courbe d'arc global contrôlable (lente / classique / explosive). |

### 5.4 Édition et personnalisation

| Idée | État | Verdict |
|---|---|---|
| Édition manuelle après génération | P | ✅ Éditeur de section et timeline existent, mais la régénération efface les retouches (§3.5). C'est le défaut prioritaire. |
| Modifier une partie précise | E | — |
| Régénération d'une séquence | E | — |
| Conservation des séquences validées | E (plan) / absente (timeline) | ✅ Étendre le verrou aux événements de timeline. |
| Intensité et complexité | P | ✅ L'énergie par section existe. Ajouter un curseur global de **densité d'effets** et un plafond d'intensité (lieu, captation vidéo). |
| Points de synchronisation | N | ✅ Marqueurs « hit » posés à la main (sur un beat) qui forcent un accent ou une cue. |

### 5.5 Intelligence temps réel

| Idée | État | Verdict | Justification |
|---|---|---|---|
| Adaptation aux variations | P | ⚠️ | Un show pré-calculé n'a pas à s'adapter. L'enjeu réel est un **mode live** (DJ, groupe) où le planificateur s'appuie sur `TempoTracker` et `DropPredictor` : c'est un produit distinct, voir FEATURE_IDEAS F-06. |
| Faible latence | P | ✅ | Timecode à 10 Hz et recalage à 80 ms. Ajouter une **compensation de latence audio** réglable (`AudioContext.outputLatency`) et un retard DMX par sortie. |
| Effets dynamiques | E | — `bassFollow` et `brightnessColor` réagissent à l'audio joué. |
| Changements imprévus | N (pré-calculé) | ⚠️ | Seulement pertinent en live. |
| Continuité si l'analyse est incertaine | P | ✅ | En live, `STALE_MS` coupe la couche audio. En pré-calculé, il faudrait signaler les sections à faible confiance, avec une confiance **réellement mesurée** et non la constante actuelle. |

### 5.6 Optimisation professionnelle

| Idée | État | Verdict |
|---|---|---|
| Répartition sur les machines | P | ✅ Rôles de machines (F-04). |
| Capacités et attributs DMX | E | — `colorCapability`, `moduleKeys`, `beamToValues`, cellules multi-pixels déjà pris en compte. |
| Combinaisons incohérentes | P | ✅ Règles de cohérence (pas de rainbow avec palette imposée, pas de prisme sur un wash, pas de mouvement rapide en section chantée…), à vérifier après compilation. |
| Limitation des répétitions | P | ✅ Voir anti-répétition. |
| Priorités visuelles | N | ✅ Notion de « sujet » par section (chanteur, soliste, public, décor) dont découlent focus et intensités. |
| Performances | E | — La compilation est synchrone et rapide ; l'analyse est dans un Worker. |

## 6. Vision cible : Song to Show v2, en quatre étapes sans réécriture

1. **Fiabilité (S1).** Corriger §3.1 à §3.5 *(fait, sauf la fusion complète des retouches : voir §7)*. Sans cela, toute amélioration artistique est masquée par un rendu infidèle au plan.
2. **Maîtrise (S2).** Frontières éditables, grille de beats corrigeable (tap sur le premier temps), BPM par timeline, profils de style structurés, protection des retouches.
3. **Intelligence du rig (S3).** Rôles de machines, palettes par harmonie, budget anti-répétition, vérification de cohérence après compilation, score de qualité calculé sur le **rendu** (simulation des frames) et pas seulement sur le plan.
4. **Différenciation (S4).** Setlist enchaînée (transitions entre morceaux), mode live assisté (structure prédite et rôles), apprentissage local des préférences à partir des sections verrouillées ou retouchées. Pas de modèle cloud imposé.

Ce qui reste volontairement hors périmètre : la séparation de sources, la reconnaissance d'instruments et l'« émotion » apprise. Le coût est élevé, la valeur faible et le résultat invérifiable par l'opérateur.

## 7. Correctifs appliqués (mise à jour du 2026-11-08)

Branche `fix/timeline-track-bpm`. Les constats des §3.1 à §3.6 sont conservés tels qu'observés au commit `8467bfc`, pour la traçabilité. Ce tableau décrit ce qui a changé.

| § | Correctif | Fichiers | Tests |
|---|---|---|---|
| 3.1 | Champ facultatif `bpm` sur `Timeline`, rempli par `compileShow` avec le BPM du morceau. `TimelineTransport.evaluate` l'utilise (`tl.bpm ?? engine.bpm`). La validation (garde-fou) et la lecture utilisent désormais le même tempo. Les shows générés avant le correctif doivent être régénérés. | `model/schemas.ts`, `music/songToShow.ts`, `engine/timeline.ts` | `engine.test.ts` (timeline à 128 BPM, moteur à 120), `songToShow.test.ts` |
| 3.2 | Formes `pingpong` (pendule : balancement en pan, arc en tilt) et `zigzag` (balayage linéaire en pan, 4 allers-retours en tilt) implémentées dans `computeEffect`. | `engine/effects.ts` | `engine.test.ts` |
| 3.3 | Nouveau mode de mélange `offset` dans `mergeSources` : l'écart de l'effet autour de 0,5 s'ajoute à la valeur sous-jacente (borné à 0..1) ; sans valeur dessous, il se comporte comme `override`. Tous les mouvements Song to Show l'utilisent. Disponible dans l'éditeur d'effets (« Relatif ») et pris en compte par le garde-fou. | `engine/merge.ts`, `safety/flashGuard.ts`, `model/schemas.ts`, `music/songToShow.ts`, `features/Effects.tsx` | `engine.test.ts`, `songToShow.test.ts` |
| 3.4 | `snap` = un flash par temps (`bpmSync`, `beatsPerCycle: 1`, rapport cyclique 10 %) : il passe le garde-fou à 124 BPM (vérifié par test). Le planificateur ne propose plus `flicker` sans strobe autorisé (repli `chase`), et la retouche locale n'applique `flicker` / `snap` que si le strobe est autorisé. | `music/songToShow.ts`, `music/showPlanner.ts` | `songToShow.test.ts` |
| 3.5 | **Correctif minimal.** Empreinte SHA-256 des objets générés (normalisés par leurs schémas, clés triées : stable après sauvegarde et rechargement), stockée dans `created.fingerprint`. Nouvelle commande `music.generatedEdited`. Confirmation « Remplacer mes retouches » avant Générer, Variante, Revenir, retouche ou régénération d'une section. **Reste à faire** : la fusion des retouches (FEATURE_IDEAS F-09). | `handlers/music.ts`, `shared/commands.ts`, `model/schemas.ts`, `features/music/overwriteGuard.ts`, `Music.tsx`, `SectionEditor.tsx` | `songToShow.test.ts`, `sectionEditor.test.tsx` |
| 3.6 | `RigInfo` déclarée une seule fois (ré-export). `explicitProps` supprimé. `hasVocals` exploité (pas de ballyhoo ni d'aléatoire sur une section chantée) ; `_confidence` supprimé, la confiance de section restant simulée. `warnings` d'intégrité remplis. Notification après changement de libellé. Variantes toutes nommées (« Variante 6 · Équilibrée »). `phraseBars` exposé (`settings.ai.phraseBars`, sélecteur 4 / 8 / 16 sur la page). Navigation et titre renommés « Song to Show ». | `music/*`, `handlers/music.ts`, `settings/settings.ts`, `Music.tsx`, `SectionEditor.tsx`, i18n | `songToShow.test.ts` |

Écarts encore ouverts : `tempoChanges` toujours déclaratif, confiance de section simulée, mesure 3/4 ignorée par `compileShow` (`barDuration`), frontières de section non éditables, audio hors du projet.

Tests existants : `tests/unit/songToShow.test.ts`, `songToShow.fiability.test.ts`, `music.test.ts`, `phase2.musicIntelligence.test.ts`, sur des signaux synthétiques (`tests/music-synth.ts`). Aucun corpus de morceaux réels annotés : c'est la première dette à combler pour mesurer la qualité de l'analyse.
