# Feuille de route d’ingénierie — Luma AI DMX

> Document généré le 19/10/2026 à partir d’un audit du code source (commit `f787f53`, version `1.2.0` de `package.json`). Il remplace intégralement la feuille de route précédente.

## 1. Titre et objectif du document

Ce document fixe l’ordre et le contenu des travaux à mener sur **Luma AI DMX**, logiciel de bureau Electron de contrôle d’éclairage DMX assisté par IA. Il repose exclusivement sur l’état réel du code : ce qui fonctionne et est vérifié, ce qui est fragile, ce qui est présent mais inaccessible, et ce qui manque. Chaque élément est rédigé pour qu’un développeur, ou un agent de programmation, puisse le prendre, relire ses preuves, et commencer sans deviner l’intention.

Nombre d’éléments : **84**, identifiés `LUMA-001` à `LUMA-084`. Les identifiants sont stables : un élément terminé garde son numéro, et un élément abandonné est marqué comme tel au lieu d’être renuméroté.

## 2. Règles de lecture et méthode de preuve

- Seuls les fichiers de code, de configuration, de tests, de scripts et de données JSON du dépôt ont été lus. Aucun document Markdown du dépôt n’a été consulté : les anciens plans et descriptions n’ont pas été pris en compte.
- Un constat est un fait observé dans le code, avec chemin et ligne. Une proposition (nouvelle capacité) est signalée comme telle dans son constat, avec les composants existants qui serviront de point d’intégration.
- Les numéros de ligne correspondent au commit audité. S’ils dérivent, les noms de symboles cités font foi.
- Les chiffres de couverture et les résultats de tests proviennent d’exécutions réelles pendant l’audit (section 3). Un test présent mais non exécuté n’est jamais compté comme preuve de bon fonctionnement.
- Un élément n’est classé « IMPLÉMENTÉ ET VÉRIFIÉ » que si son parcours est raccordé et que des tests exécutés vérifient le comportement concerné.

**Statuts utilisés**

| Statut | Signification |
|---|---|
| IMPLÉMENTÉ ET VÉRIFIÉ | Code présent, parcours raccordé, tests exécutés qui démontrent le comportement. |
| IMPLÉMENTÉ, VALIDATION INSUFFISANTE | Comportement présent, mais tests absents, partiels ou non représentatifs (matériel réel, chemin distant). |
| PARTIELLEMENT IMPLÉMENTÉ | Une partie du parcours fonctionne ; une étape importante manque ou un défaut est démontré. |
| PRÉSENT MAIS NON RACCORDÉ | Le code existe, mais aucun parcours utilisateur complet ne permet de l’utiliser. |
| ABSENT | Capacité non implémentée dans le code examiné. |
| À INVESTIGUER | Les preuves disponibles ne permettent pas de trancher sans essai complémentaire. |

**Priorités** : P0 = blocage critique ou risque majeur ; P1 = indispensable ou à fort impact ; P2 = important mais non urgent ; P3 = secondaire ou à long terme.

**Efforts** : XS (moins d’une demi-journée), S (environ 1 jour), M (2 à 4 jours), L (1 à 2 semaines), XL (plus de 2 semaines). Ce sont des estimations relatives, pas des engagements de date.

**Nature des travaux** (distinction demandée entre corrections et nouvelles capacités) :

- A — Correction et rupture fonctionnelle
- B — Fiabilisation de l’existant
- C — Amélioration fonctionnelle
- D — Évolution structurelle
- E — Capacité future

## 3. Périmètre de l’audit et limites de vérification

**Périmètre examiné**

- Processus principal Electron : `src/main/index.ts`, `secrets.ts`, `updates.ts` ; preload `src/preload/index.ts`.
- Contrat partagé : `src/shared/commands.ts`, `api.ts`, `brand.ts`.
- Cœur applicatif `src/core/**` : service (`app/`), handlers par domaine, moteur, protocoles, profils, IA (locale et OpenRouter), musique, audio, sécurité photosensible, vision, visualiseur, persistance, journal, télémétrie.
- Rendu React `src/renderer/**` : application, store, contrôle externe, moteur audio, pages principales (lecture ciblée des pages Music, Settings, Visualizer, CameraLocate, LiveConsole).
- Tests (`tests/unit`, `integration`, `components`, `eval`, `perf`, `e2e`), configuration (Vite, Vitest, Playwright, ESLint, TypeScript, electron-builder) et scripts (`scripts/*.mjs`).

**Vérifications exécutées pendant l’audit**

| Commande | Résultat |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | Succès (0 erreur). |
| `npx vitest run` | Succès : 36 fichiers, 321 tests passés. |
| `npx eslint .` | Succès (0 erreur). |
| `node scripts/check-file-size.mjs` | Succès. |
| `node scripts/check-i18n.mjs` | Succès (cliquet) : 782 textes en dur. |
| `npx vitest run --config vitest.perf.config.ts` | Échec reproductible : p95 de la gigue 4,01 ms pour un seuil de 2 ms (1 puis 2 tests en échec sur 3). |
| `npx vitest run --coverage` | Échec : le `beforeAll` de `tests/unit/richShow.test.ts` dépasse le délai de hook par défaut (10 s). |
| `npx vitest run --coverage --hookTimeout=60000` | Succès : 321 tests ; `src/core` : 87,6 % instructions, 78,2 % branches, 88,0 % fonctions, 91,7 % lignes. |

**Limites**

- Les tests E2E Playwright (`npm run test:e2e`) n’ont pas été exécutés : ils imposent une build et le lancement de fenêtres Electron sur le poste. Leur contenu a été lu, mais leur réussite n’est pas affirmée.
- Aucun matériel DMX (interfaces USB, nœuds Art-Net ou sACN, testeur) n’était disponible : les constats sur le matériel reposent sur le code et sur ses propres avertissements.
- Aucun appel OpenRouter réel n’a été effectué (pas de clé fournie, appels payants) : le chemin distant est évalué par lecture du code et des tests simulés.
- Le rendu 3D (`src/renderer/features/stage3d/*`) et une partie des pages (Effects, Timeline, Fixtures, Onboarding) ont été parcourus de façon ciblée, sans audit ligne à ligne.
- Les mesures de performance proviennent d’une seule machine Windows 10 : elles signalent un écart, pas une valeur universelle.
- L’élément LUMA-024 (plein écran) reste à confirmer par un essai sur une build empaquetée.

## 4. Résumé de l’état technique réel de Luma AI DMX

Luma AI DMX est une application de bureau Electron (Windows) qui pilote de l’éclairage DMX depuis une console logicielle complète : patch et profils (GDTF, grandMA2, Open Fixture Library, format propre), programmeur, scènes, listes de cues, effets, timelines, visualiseur 2D et 3D, audio réactif, génération de shows à partir d’un morceau (Song-to-Show), localisation des projecteurs par caméra et « directeur lumière » IA (interpréteur local déterministe ou modèles via OpenRouter). Les sorties couvrent la sortie virtuelle, Art-Net, sACN, Enttec DMX USB Pro et Open DMX, avec RDM via Art-Net. Le contrôle externe passe par le MIDI, l’OSC, le timecode MTC et LTC, et une télécommande HTTP pour tablette.

Le socle est sérieux et majoritairement vérifié : frontière IPC unique validée par Zod avec routage exhaustif à la compilation, rendu isolé (sandbox, CSP stricte, aucune API Node), sorties réelles désarmées par défaut, fonctions dangereuses filtrées au rendu DMX, garde-fou photosensible, validation stricte de toute action IA, format de projet versionné avec migrations, écriture atomique avec copie `.bak`, et 321 tests unitaires et d’intégration qui passent avec 91,7 % des lignes du cœur couvertes.

L’audit révèle cependant des défauts concrets à fort impact en exploitation : double déclenchement des commandes MIDI quand la vue 3D est détachée (LUMA-001), limiteur de cadence qui peut diviser par deux la fréquence DMX (LUMA-002), localisation caméra qui reste active si le rendu plante (LUMA-003), analyse audio suspendue quand la fenêtre est réduite (LUMA-006), et test de gigue en échec (LUMA-007). Plusieurs fonctions sont présentes mais inaccessibles (`engine.releaseAll`, `profile.remove`), plusieurs références restent orphelines après suppression, et des opérations asynchrones longues ne sont ni annulables ni protégées contre les modifications concurrentes.

Côté processus, l’absence d’intégration continue, la couverture faible de zones clés (handler de programmation 29 %, autosauvegarde 36 %, audio réactif 54 %, processus principal et rendu hors couverture) et l’absence de validation sur matériel réel sont les principaux freins à la mise en production. Les capacités les plus attendues ensuite sont l’annulation globale, une interface réellement bilingue, la découverte des nœuds réseau et la maîtrise du coût de l’IA.

## 5. Architecture constatée

### Point d’entrée et cycle de vie

Le processus principal crée le `AppService` (indépendant d’Electron, dialogues et secrets injectés), enregistre l’unique canal IPC `luma:cmd`, relaie cinq événements (`project`, `runtime`, `values`, `log`, `locatePhoto`) vers toutes les fenêtres, puis affiche la fenêtre principale après une vidéo d’introduction. À la fermeture, il arrête proprement le moteur et les sorties (terminaison de flux sACN) avant une éventuelle installation de mise à jour.

- `src/main/index.ts:228-265` (démarrage), `:280-291` (arrêt propre)
- `src/preload/index.ts` (pont `window.luma` : `invoke` et `on`)
- `src/core/app/AppService.ts:158-207` (`init`, `dispose`)

### Bus de commandes et handlers

Toutes les actions du rendu, de l’OSC et de la télécommande passent par `AppService.handle`, qui route par préfixe de type (`project.*`, `fixture.*`…) vers un handler par domaine. Le routage est exhaustif à la compilation. Les erreurs d’utilisateur (`UserError`) sont renvoyées telles quelles, les autres sont journalisées.

- `src/shared/commands.ts:52-273` (schéma), `:328-441` (types de résultats)
- `src/core/app/routes.ts:21-31`
- `src/core/app/handlers/*.ts`

### Modèle de données et mutation

Le projet est un document JSON unique validé par Zod (format v3). Toute modification passe par `mutate` : clonage, modification du brouillon, réintégration des profils utilisés, revalidation complète, reconstruction de l’index, puis émission de l’état complet. L’historique d’annulation ne couvre que l’implantation de scène.

- `src/core/model/schemas.ts:554-560`
- `src/core/app/AppService.ts:262-310`
- `src/core/project/format.ts:30-37` (migrations)

### Moteur temps réel et sorties

Le moteur tourne dans le processus principal entre 10 et 44 Hz (40 par défaut). Il fusionne les couches (playbacks, IA, timeline, audio, localisation) par bandes de priorité (HTP pour l’intensité, LTP pour le reste), applique les effets puis le programmeur, qui l’emporte toujours, et rend les univers DMX en filtrant les valeurs dangereuses. `OutputManager` distribue les trames aux adaptateurs, avec une machine d’états et une reconnexion à backoff.

- `src/core/engine/Engine.ts:386-423` (tick), `:452-488` (ordonnanceur)
- `src/core/engine/merge.ts` (politique de priorité)
- `src/core/protocols/OutputManager.ts:125-148`, `types.ts:80-92`

### IA

Une requête produit une proposition : interpréteur local ou OpenRouter, puis validation stricte de chaque action contre le patch et les capacités, garde-fou photosensible simulé sur 3 s, et aperçu. Elle n’est appliquée qu’une fois, sur action explicite. Le Song-to-Show planifie les sections (règles locales ou OpenRouter avec cache disque) puis compile scènes, effets et timeline.

- `src/core/app/handlers/ai.ts`
- `src/core/ai/director.ts`
- `src/core/app/handlers/music.ts:128-213`

### Rendu

Application React avec un store Zustand alimenté par les événements. L’analyse audio, le MIDI et le timecode vivent hors de React (`audioEngine`, `externalControl`), dans la fenêtre principale et, à cause du démarrage commun, aussi dans la fenêtre 3D détachée (LUMA-001).

- `src/renderer/main.tsx`, `App.tsx:340-352`
- `src/renderer/store.ts:186-203`
- `src/renderer/audioEngine.ts`, `control.ts`

### Données locales

Le dossier `userData` contient `settings.json`, `secrets.json` (chiffré par l’OS), `profiles.json` (bibliothèque), `usage.json` (statistiques opt-in), `autosave/`, `music/` (audio par empreinte SHA-256), `ai-cache/` et `logs/` (rotation à 2 Mo, 4 fichiers).

- `src/core/app/AppService.ts:155-156`
- `src/core/app/library.ts:9`
- `src/core/app/handlers/music.ts:90`
- `src/core/log/fileSink.ts:25-26`

## 6. Inventaire synthétique des systèmes existants

| Système | Statut | Éléments principaux (preuves) | Éléments de la roadmap |
|---|---|---|---|
| Bus de commandes IPC typé (preload, Zod, routage par domaine) | IMPLÉMENTÉ ET VÉRIFIÉ | `src/shared/commands.ts:52-273`, `src/core/app/routes.ts:21-31` (routage exhaustif à la compilation), `src/main/index.ts:237-248`, E2E de sécurité `tests/e2e/app.spec.ts:41` | [LUMA-032](#luma-032) |
| Calcul moteur (fusion HTP/LTP, rendu DMX, playbacks, effets, timeline) | IMPLÉMENTÉ ET VÉRIFIÉ | `src/core/engine/*`, `tests/unit/engine.test.ts`, couverture `engine` à 90,7 % des lignes | [LUMA-021](#luma-021), [LUMA-026](#luma-026), [LUMA-068](#luma-068) |
| Ordonnanceur temps réel | PARTIELLEMENT IMPLÉMENTÉ | `src/core/engine/Engine.ts:452-488` ; test de performance en échec (p95 de la gigue 4 ms pour un seuil de 2 ms) | [LUMA-007](#luma-007), [LUMA-071](#luma-071) |
| Sorties virtuelle, Art-Net et sACN | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | `src/core/protocols/*`, `tests/unit/protocols.test.ts`, E2E d’armement et STOP ; limiteur de cadence défectueux | [LUMA-002](#luma-002), [LUMA-036](#luma-036), [LUMA-057](#luma-057), [LUMA-064](#luma-064) |
| Sorties USB Enttec Pro et Open DMX | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | `src/core/protocols/enttec.ts:6`, `opendmx.ts:9` (non vérifiées sur matériel) ; couverture d’`enttec.ts` à 42 % | [LUMA-037](#luma-037), [LUMA-038](#luma-038) |
| RDM via Art-Net | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | `src/core/protocols/rdm.ts` (nœud simulé uniquement), `tests/unit/rdm.test.ts` | [LUMA-038](#luma-038), [LUMA-078](#luma-078) |
| Import de profils (Luma, GDTF, grandMA2, OFL) et bibliothèque | IMPLÉMENTÉ ET VÉRIFIÉ | `src/core/fixtures/{gdtf,ma2,ofl,profiles}.ts`, tests `gdtf`, `ma2`, `fixtures`, `profile-library` ; suppression non raccordée ; QLC+ absent | [LUMA-020](#luma-020), [LUMA-029](#luma-029), [LUMA-044](#luma-044), [LUMA-083](#luma-083) |
| Patch, validation d’adresses, feuille de patch CSV et PDF, export MVR | IMPLÉMENTÉ ET VÉRIFIÉ | `src/core/fixtures/patch.ts`, `patchSheet.ts`, `src/core/project/mvr.ts`, tests `patchSheet` et `mvr`, E2E PDF et CSV | [LUMA-065](#luma-065) |
| Programmation (groupes, palettes, scènes, cues, effets, timelines) | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | `src/core/app/handlers/programming.ts` couvert à 28,9 % des lignes ; nettoyage des références incomplet | [LUMA-015](#luma-015), [LUMA-025](#luma-025), [LUMA-031](#luma-031), [LUMA-053](#luma-053) |
| Commande « tout relâcher » (`engine.releaseAll`) | PRÉSENT MAIS NON RACCORDÉ | `src/core/app/handlers/output.ts:23-30`, aucun consommateur | [LUMA-010](#luma-010) |
| IA locale déterministe | IMPLÉMENTÉ ET VÉRIFIÉ | `src/core/ai/local/interpreter.ts`, banc de 175 cas (`tests/eval`), couverture de 96 % ; anglais peu mesuré | [LUMA-056](#luma-056) |
| IA OpenRouter (propositions, scène depuis photo, liste des modèles) | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | `src/core/ai/providers/openrouter.ts`, tests unitaires avec réponses simulées ; ni banc, ni reprise, ni annulation, ni suivi des coûts | [LUMA-012](#luma-012), [LUMA-039](#luma-039), [LUMA-040](#luma-040), [LUMA-041](#luma-041), [LUMA-058](#luma-058), [LUMA-059](#luma-059) |
| Application des propositions IA (validation stricte, aperçu, vérification) | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | `src/core/ai/director.ts:429-587`, `tests/unit/ai.test.ts`, contrat versionné `tests/unit/ai-contract.test.ts` | [LUMA-022](#luma-022), [LUMA-023](#luma-023), [LUMA-027](#luma-027), [LUMA-028](#luma-028), [LUMA-070](#luma-070) |
| Song-to-Show (analyse, planification, compilation) | IMPLÉMENTÉ ET VÉRIFIÉ | `src/core/music/*`, `tests/unit/songToShow.test.ts`, `richShow.test.ts`, E2E « intelligence musicale » ; progression simulée, course possible | [LUMA-013](#luma-013), [LUMA-014](#luma-014), [LUMA-060](#luma-060), [LUMA-074](#luma-074) |
| Audio réactif (analyse dans le rendu, réactions dans le cœur) | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | `src/renderer/audioEngine.ts`, `src/core/audio/reactive.ts` couvert à 54 % ; cadencé par `requestAnimationFrame` | [LUMA-006](#luma-006), [LUMA-034](#luma-034), [LUMA-075](#luma-075) |
| Garde-fou photosensible | IMPLÉMENTÉ ET VÉRIFIÉ | `src/core/safety/flashGuard.ts`, `tests/unit/safety.test.ts`, couverture de 97 % | [LUMA-076](#luma-076) |
| Localisation des projecteurs par caméra | IMPLÉMENTÉ ET VÉRIFIÉ | `src/core/vision/*`, `tests/unit/vision.test.ts`, `locate-service.test.ts`, E2E avec caméra factice ; pas de libération sur perte du rendu | [LUMA-003](#luma-003), [LUMA-016](#luma-016) |
| Contrôle MIDI et timecode (MTC, LTC) | PARTIELLEMENT IMPLÉMENTÉ | `src/renderer/control.ts`, `tests/unit/control.test.ts:87-94` ; double instance dans la fenêtre détachée | [LUMA-001](#luma-001), [LUMA-052](#luma-052), [LUMA-062](#luma-062) |
| Serveur OSC | IMPLÉMENTÉ ET VÉRIFIÉ | `src/core/control/osc.ts` (couverture de 94 %), `src/core/app/control.ts:65-89` ; pas de limitation de débit ni de liste d’adresses autorisées | [LUMA-042](#luma-042), [LUMA-061](#luma-061), [LUMA-063](#luma-063) |
| Télécommande HTTP (jeton, cookie, SSE, limitation) | IMPLÉMENTÉ ET VÉRIFIÉ | `src/core/control/remote.ts`, `tests/unit/remote.test.ts`, couverture de 95 % | [LUMA-051](#luma-051), [LUMA-066](#luma-066), [LUMA-067](#luma-067) |
| Persistance des projets (format v3, migrations, écriture atomique, `.bak`) | IMPLÉMENTÉ ET VÉRIFIÉ | `src/core/project/{format,store}.ts`, tests d’intégration de réouverture et de fichier corrompu | [LUMA-018](#luma-018), [LUMA-043](#luma-043) |
| Autosauvegarde et récupération | PARTIELLEMENT IMPLÉMENTÉ | `src/core/app/files.ts` couvert à 36 % des lignes et 0 % des branches ; liste visible seulement dans les Paramètres | [LUMA-011](#luma-011), [LUMA-030](#luma-030), [LUMA-033](#luma-033) |
| Paramètres de l’application | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | `src/core/settings/settings.ts`, `handlers/system.ts:24-37` ; remplacement complet, réinitialisation totale si une valeur est invalide | [LUMA-017](#luma-017), [LUMA-045](#luma-045), [LUMA-077](#luma-077) |
| Magasin de secrets (safeStorage) | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | `src/main/secrets.ts`, aucun test unitaire ; lecture synchrone 10 fois par seconde | [LUMA-004](#luma-004), [LUMA-032](#luma-032), [LUMA-050](#luma-050) |
| Journal, diagnostic, rapport matériel | IMPLÉMENTÉ ET VÉRIFIÉ | `src/core/log/*`, `src/core/app/hardware.ts`, tests `diagnostic` et `hardware` ; pas de déduplication, chemins personnels exportés | [LUMA-005](#luma-005), [LUMA-047](#luma-047), [LUMA-048](#luma-048), [LUMA-049](#luma-049) |
| Mises à jour automatiques (electron-updater) | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | `src/main/updates.ts` (non testé), `tests/unit/updates.test.ts` (statut côté cœur) | [LUMA-046](#luma-046) |
| Visualiseur 2D et 3D, fenêtre détachée | IMPLÉMENTÉ ET VÉRIFIÉ | `src/core/visualizer/*`, `src/renderer/features/stage3d/*`, `tests/unit/visualizer3d.test.ts`, E2E 3D et fenêtre détachée | [LUMA-024](#luma-024), [LUMA-069](#luma-069) |
| Internationalisation de l’interface (FR et EN) | PARTIELLEMENT IMPLÉMENTÉ | Catalogues complets et identiques en clés ; 782 textes en dur (`scripts/check-i18n.mjs`) ; messages du cœur en français | [LUMA-054](#luma-054), [LUMA-055](#luma-055) |
| Intégration continue | ABSENT | `.github/` sans workflow ; `scripts/check-commits.mjs` non appelé | [LUMA-008](#luma-008) |
| Release et distribution (Windows NSIS) | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | `scripts/release.mjs`, `electron-builder.yml` ; signature facultative, macOS et Linux absents | [LUMA-046](#luma-046), [LUMA-082](#luma-082), [LUMA-084](#luma-084) |

## 7. Principaux blocages et risques techniques

1. **Double déclenchement en direct.** Avec le MIDI actif et la vue 3D détachée, chaque appui sur GO avance deux fois. ([LUMA-001](#luma-001))
2. **Qualité DMX inférieure à l’affichage.** Le limiteur de cadence et la gigue de l’ordonnanceur peuvent réduire la cadence réelle de moitié. ([LUMA-002](#luma-002), [LUMA-007](#luma-007))
3. **États de scène bloqués.** La localisation et la mire ne sont pas libérées si le rendu disparaît ; les réactions audio s’arrêtent si la fenêtre est réduite. ([LUMA-003](#luma-003), [LUMA-006](#luma-006))
4. **Aucune protection automatique contre les régressions.** Pas de CI, commande de couverture en échec, zones critiques peu testées. ([LUMA-008](#luma-008), [LUMA-009](#luma-009), [LUMA-031](#luma-031), [LUMA-032](#luma-032))
5. **Matériel non qualifié.** Les interfaces USB et le RDM ne sont vérifiés qu’en simulation. ([LUMA-038](#luma-038))
6. **Perte de données silencieuse.** Écritures concurrentes, paramètres réinitialisés en bloc, récupération après crash peu visible, éditions non annulables. ([LUMA-011](#luma-011), [LUMA-017](#luma-017), [LUMA-018](#luma-018), [LUMA-045](#luma-045), [LUMA-053](#luma-053))
7. **Thread principal surchargé.** Moteur, IPC, validation complète du projet et journal synchrone partagent le même thread. ([LUMA-004](#luma-004), [LUMA-005](#luma-005), [LUMA-071](#luma-071), [LUMA-073](#luma-073))

## 8. Principes de priorisation

- D’abord ce qui peut produire une erreur visible par le public ou mettre en danger des personnes sur scène (P0, puis P1 de la phase 0).
- Ensuite la porte qualité automatique, qui protège tout le reste du travail.
- Puis le raccordement de ce qui existe déjà, avant de créer de nouvelles capacités : coût faible, valeur immédiate.
- Préférer une correction ciblée à une refonte : la refonte structurelle (LUMA-071) n’est engagée que si les causes locales mesurées ne suffisent pas.
- Un élément ne passe avant ses dépendances que si la dépendance est triviale à réaliser en même temps.
- Aucune date n’est fixée : l’ordre est donné par les phases, l’effort relatif par la taille XS à XL.

## 9. Roadmap priorisée par phases

**Répartition par priorité**

| Priorité | Éléments |
|---|---|
| P0 | 1 |
| P1 | 14 |
| P2 | 36 |
| P3 | 33 |

**Répartition par statut actuel**

| Statut | Éléments |
|---|---|
| IMPLÉMENTÉ ET VÉRIFIÉ | 0 |
| IMPLÉMENTÉ, VALIDATION INSUFFISANTE | 10 |
| PARTIELLEMENT IMPLÉMENTÉ | 51 |
| PRÉSENT MAIS NON RACCORDÉ | 2 |
| ABSENT | 20 |
| À INVESTIGUER | 1 |

**Répartition par nature de travaux**

| Nature | Éléments |
|---|---|
| A — Correction et rupture fonctionnelle | 17 |
| B — Fiabilisation de l’existant | 29 |
| C — Amélioration fonctionnelle | 23 |
| D — Évolution structurelle | 8 |
| E — Capacité future | 7 |

### Phase 0 — Sûreté du show et porte qualité

**Objectif.** Supprimer les défauts qui peuvent produire une erreur visible en direct (double GO, cadence DMX divisée, scène figée après un plantage, réactions audio coupées) et remettre au vert une porte qualité fiable et automatique.

**Éléments (9).**

| ID | Titre | Priorité | Statut | Effort |
|---|---|---|---|---|
| [LUMA-001](#luma-001) | Empêcher la double exécution des commandes MIDI quand la fenêtre 3D détachée est ouverte | P0 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-002](#luma-002) | Corriger le limiteur de cadence par sortie, qui divise par deux la fréquence DMX effective | P1 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-003](#luma-003) | Libérer la séquence de localisation caméra et la mire de test quand le rendu disparaît | P1 | ABSENT | S |
| [LUMA-004](#luma-004) | Supprimer la lecture et le déchiffrement synchrones de la clé API dix fois par seconde | P1 | PARTIELLEMENT IMPLÉMENTÉ | XS |
| [LUMA-005](#luma-005) | Limiter le flot d’erreurs répétées du moteur dans le journal et les alertes | P1 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-006](#luma-006) | Garantir que l’analyse audio réactive continue quand la fenêtre principale est masquée ou réduite | P1 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | S |
| [LUMA-007](#luma-007) | Ramener la gigue de l’ordonnanceur sous le seuil du test de performance (p95 < 2 ms) | P1 | PARTIELLEMENT IMPLÉMENTÉ | M |
| [LUMA-008](#luma-008) | Mettre en place une intégration continue Windows (typecheck, lint, tests, conventions de commit) | P1 | ABSENT | S |
| [LUMA-009](#luma-009) | Rendre `npm run test:coverage` fiable (délai des hooks sous instrumentation) | P1 | PARTIELLEMENT IMPLÉMENTÉ | XS |

**Dépendances principales.** Aucune dépendance vers une phase ultérieure. Les éléments de cette phase sont pour la plupart indépendants et parallélisables. LUMA-007 attend LUMA-004 et LUMA-005, et LUMA-008 attend LUMA-009.

**Critères de sortie.** Voir la section 13 (phase 0).

**Risques bloquants.** Le test de performance dépend de la machine : sans référence stable, LUMA-007 peut rester bloqué. Il faut alors documenter le seuil par plateforme plutôt que bloquer la phase.

**Résultats concrets attendus.** Un appui MIDI produit un seul GO. Les sorties émettent à la cadence configurée. La scène est libérée si le rendu disparaît. L’audio réactif survit à une fenêtre réduite. La CI exécute typecheck, lint, tests et couverture à chaque push.

### Phase 1 — Fermeture des parcours incomplets

**Objectif.** Raccorder le code présent mais inaccessible, corriger les incohérences de références et de concurrence, et rendre les opérations longues maîtrisables (annulation, progression réelle, récupération après crash).

**Éléments (21).**

| ID | Titre | Priorité | Statut | Effort |
|---|---|---|---|---|
| [LUMA-010](#luma-010) | Raccorder la commande « Tout relâcher » (`engine.releaseAll`) à l’interface, à l’OSC et à la télécommande | P1 | PRÉSENT MAIS NON RACCORDÉ | S |
| [LUMA-011](#luma-011) | Proposer la récupération du travail au démarrage après une fermeture anormale | P1 | PARTIELLEMENT IMPLÉMENTÉ | M |
| [LUMA-012](#luma-012) | Permettre l’annulation d’une requête IA ou d’une génération de show en cours | P2 | ABSENT | M |
| [LUMA-013](#luma-013) | Remplacer la barre de progression simulée de la génération de show par une progression réelle | P2 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-014](#luma-014) | Protéger la génération de show contre les modifications concurrentes du projet pendant l’appel IA | P2 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-015](#luma-015) | Nettoyer les réactions audio qui pointent vers une liste de cues supprimée | P2 | PARTIELLEMENT IMPLÉMENTÉ | XS |
| [LUMA-016](#luma-016) | Rendre annulable l’application des positions issues de la localisation caméra | P2 | PARTIELLEMENT IMPLÉMENTÉ | XS |
| [LUMA-017](#luma-017) | Éviter l’écrasement de paramètres modifiés ailleurs lors de `settings.update` | P2 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-018](#luma-018) | Sérialiser les écritures atomiques concurrentes sur un même fichier | P2 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-019](#luma-019) | Signaler un échec d’enregistrement déclenché par la fermeture de la fenêtre | P2 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-020](#luma-020) | Permettre de supprimer un profil de la bibliothèque utilisateur depuis l’interface | P2 | PRÉSENT MAIS NON RACCORDÉ | S |
| [LUMA-021](#luma-021) | Reconstituer l’état des listes de cues après un saut de timeline (seek ou poursuite de timecode) | P2 | PARTIELLEMENT IMPLÉMENTÉ | M |
| [LUMA-022](#luma-022) | Ne plus accumuler dans le projet les définitions d’effets créées par chaque proposition IA | P2 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-023](#luma-023) | Rendre l’application d’une proposition IA atomique et annulable en une étape | P2 | PARTIELLEMENT IMPLÉMENTÉ | M |
| [LUMA-024](#luma-024) | Vérifier et corriger le plein écran F11 de la fenêtre 3D détachée face au filtre de permissions | P2 | À INVESTIGUER | XS |
| [LUMA-025](#luma-025) | Supprimer une timeline n’arrête que la lecture de cette timeline | P3 | PARTIELLEMENT IMPLÉMENTÉ | XS |
| [LUMA-026](#luma-026) | Retirer du moteur les playbacks de listes de cues supprimées | P3 | PARTIELLEMENT IMPLÉMENTÉ | XS |
| [LUMA-027](#luma-027) | Revalider une proposition IA contre l’état courant du projet au moment de l’appliquer | P3 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-028](#luma-028) | Ne pas marquer le projet comme modifié pour une simple requête IA non appliquée | P3 | PARTIELLEMENT IMPLÉMENTÉ | XS |
| [LUMA-029](#luma-029) | Retirer de la boîte d’import le filtre QLC+ annoncé mais refusé | P3 | ABSENT | XS |
| [LUMA-030](#luma-030) | Nettoyer les fichiers audio, le cache IA et les copies de récupération orphelins | P3 | ABSENT | M |

**Dépendances principales.** Aucune dépendance vers une phase ultérieure. LUMA-013 dépend de LUMA-012 (même infrastructure d’opération en cours).

**Critères de sortie.** Voir la section 13 (phase 1).

**Risques bloquants.** LUMA-011 et LUMA-017 modifient des formats locaux (métadonnées de récupération, révision des paramètres) : prévoir la compatibilité ascendante.

**Résultats concrets attendus.** « Tout relâcher » et la suppression de profils sont accessibles. Les références orphelines sont nettoyées. Les générations IA sont annulables et ne corrompent plus le projet en cas de modification concurrente. Le travail perdu après un crash est proposé au démarrage.

### Phase 2 — Fiabilisation et couverture de tests

**Objectif.** Couvrir les zones à faible couverture et à fort risque (programmation, processus principal, sorties, audio), valider le matériel réel, et rendre les intégrations externes résilientes et observables.

**Éléments (23).**

| ID | Titre | Priorité | Statut | Effort |
|---|---|---|---|---|
| [LUMA-031](#luma-031) | Couvrir par des tests le handler de programmation (groupes, palettes, scènes, cues, effets, timelines) | P1 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | M |
| [LUMA-032](#luma-032) | Tester le processus principal : garde IPC, magasin de secrets et flux de fermeture | P1 | ABSENT | M |
| [LUMA-038](#luma-038) | Mener la campagne de validation matérielle (Enttec Pro, Open DMX, RDM Art-Net, nœuds Art-Net et sACN) | P1 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | L |
| [LUMA-033](#luma-033) | Tester l’autosauvegarde et la liste des projets récents | P2 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | S |
| [LUMA-034](#luma-034) | Tester les réactions audio (flash sur le temps, couleur selon l’énergie, suiveurs, GO sur drop armé) | P2 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | S |
| [LUMA-035](#luma-035) | Étendre la couverture et les tests de composants au code de rendu | P2 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | L |
| [LUMA-036](#luma-036) | Tester la machine d’états des sorties (reconnexion avec backoff, fermeture pendant reconnexion, désarmement) | P2 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | M |
| [LUMA-037](#luma-037) | Rendre l’adaptateur Enttec Pro injectable et le tester avec un port série simulé | P2 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | S |
| [LUMA-039](#luma-039) | Ajouter une reprise contrôlée des appels OpenRouter sur 429, 5xx et erreurs réseau transitoires | P2 | ABSENT | S |
| [LUMA-041](#luma-041) | Évaluer le chemin OpenRouter avec un banc rejoué hors ligne | P2 | PARTIELLEMENT IMPLÉMENTÉ | M |
| [LUMA-042](#luma-042) | Limiter le débit des paquets OSC invalides ou inconnus et leur impact sur le journal | P2 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-043](#luma-043) | Rendre les écritures atomiques durables (fsync) et tolérantes aux verrous de fichiers Windows | P2 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-045](#luma-045) | Récupérer partiellement un fichier de paramètres invalide au lieu de tout réinitialiser | P2 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-046](#luma-046) | Renforcer la porte de release : tests de performance, E2E, signature de code et vérification de l’installeur | P2 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-052](#luma-052) | Tester de bout en bout la chaîne timecode (MTC et LTC dans le rendu vers la poursuite de timeline) et la perte de signal | P2 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | S |
| [LUMA-040](#luma-040) | Relancer une fois le modèle avec les erreurs de validation quand sa réponse ne respecte pas le schéma | P3 | ABSENT | S |
| [LUMA-044](#luma-044) | Transformer les lectures hors bornes du lecteur ZIP en erreurs `ZipError` explicites | P3 | PARTIELLEMENT IMPLÉMENTÉ | XS |
| [LUMA-047](#luma-047) | Retirer du diagnostic exporté les chemins personnels et les noms d’utilisateur | P3 | PARTIELLEMENT IMPLÉMENTÉ | XS |
| [LUMA-048](#luma-048) | Historiser les métriques du moteur et des sorties pour diagnostiquer un incident après coup | P3 | PARTIELLEMENT IMPLÉMENTÉ | M |
| [LUMA-049](#luma-049) | Mesurer et journaliser les commandes IPC lentes | P3 | ABSENT | XS |
| [LUMA-050](#luma-050) | Ne plus effacer silencieusement les autres secrets quand `secrets.json` est illisible | P3 | PARTIELLEMENT IMPLÉMENTÉ | XS |
| [LUMA-051](#luma-051) | Borner la mémoire des limiteurs de la télécommande par adresse IP | P3 | PARTIELLEMENT IMPLÉMENTÉ | XS |
| [LUMA-084](#luma-084) | Retirer de la CSP de production l’autorisation de connexion WebSocket vers localhost | P3 | PARTIELLEMENT IMPLÉMENTÉ | XS |

**Dépendances principales.** Cette phase s’appuie sur [LUMA-009](#luma-009), [LUMA-002](#luma-002), [LUMA-018](#luma-018), [LUMA-008](#luma-008), [LUMA-007](#luma-007), [LUMA-021](#luma-021), [LUMA-005](#luma-005) (phases antérieures). La phase suppose la CI de la phase 0 (LUMA-008) et la fiabilité de la couverture (LUMA-009).

**Critères de sortie.** Voir la section 13 (phase 2).

**Risques bloquants.** La campagne matérielle (LUMA-038) exige des interfaces physiques et un testeur DMX. Elle peut s’étaler sans bloquer le reste de la phase.

**Résultats concrets attendus.** Couverture des handlers supérieure à 85 %, processus principal testé, rendu inclus dans la couverture, interfaces matérielles qualifiées ou marquées expérimentales, appels IA repris sur incident transitoire, diagnostic sans données personnelles.

### Phase 3 — Améliorations fonctionnelles à fort impact

**Objectif.** Apporter les capacités attendues d’un logiciel d’éclairage utilisé en production : annulation globale, interface réellement bilingue, découverte réseau, maîtrise des coûts IA, portabilité des projets musicaux et intégrations de contrôle bidirectionnelles.

**Éléments (19).**

| ID | Titre | Priorité | Statut | Effort |
|---|---|---|---|---|
| [LUMA-053](#luma-053) | Étendre l’annulation et le rétablissement à toutes les éditions du projet | P1 | PARTIELLEMENT IMPLÉMENTÉ | L |
| [LUMA-054](#luma-054) | Internationaliser les messages du cœur et les dialogues du processus principal | P2 | PARTIELLEMENT IMPLÉMENTÉ | L |
| [LUMA-055](#luma-055) | Résorber les 782 textes d’interface écrits en dur dans le rendu | P2 | PARTIELLEMENT IMPLÉMENTÉ | L |
| [LUMA-056](#luma-056) | Mesurer et améliorer la compréhension des requêtes en anglais par l’interpréteur local | P2 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | M |
| [LUMA-057](#luma-057) | Découvrir automatiquement les nœuds Art-Net du réseau (ArtPoll et ArtPollReply) | P2 | ABSENT | M |
| [LUMA-058](#luma-058) | Suivre la consommation de jetons et le coût des appels OpenRouter | P2 | ABSENT | S |
| [LUMA-059](#luma-059) | Donner à l’IA distante le contexte des derniers échanges pour les demandes de raffinement | P2 | PARTIELLEMENT IMPLÉMENTÉ | M |
| [LUMA-060](#luma-060) | Exporter et importer un projet « paquet » qui embarque les fichiers audio des morceaux | P2 | PARTIELLEMENT IMPLÉMENTÉ | M |
| [LUMA-061](#luma-061) | Restreindre l’OSC réseau à une liste d’adresses autorisées | P2 | ABSENT | S |
| [LUMA-073](#luma-073) | Réduire le coût de chaque mutation (clonage et revalidation complète du projet) | P2 | PARTIELLEMENT IMPLÉMENTÉ | M |
| [LUMA-062](#luma-062) | Étendre le MIDI : faders vers niveaux de playback et d’effets, et retour d’état vers les contrôleurs | P3 | PARTIELLEMENT IMPLÉMENTÉ | M |
| [LUMA-063](#luma-063) | Publier l’état du show en OSC (retour d’état pour TouchOSC, QLab et autres) | P3 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-064](#luma-064) | Implémenter la découverte d’univers sACN (E1.31 §8) et la synchronisation optionnelle | P3 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-065](#luma-065) | Importer une implantation MVR (patch et positions) depuis Capture, Vectorworks ou grandMA3 | P3 | ABSENT | L |
| [LUMA-066](#luma-066) | Appairer la télécommande par QR code | P3 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-067](#luma-067) | Afficher l’état des sorties et les alertes critiques sur la télécommande | P3 | PARTIELLEMENT IMPLÉMENTÉ | XS |
| [LUMA-068](#luma-068) | Proposer un mode « tracking » optionnel pour les listes de cues | P3 | ABSENT | M |
| [LUMA-069](#luma-069) | Rendre le plan de scène 2D utilisable au clavier et par les lecteurs d’écran | P3 | PARTIELLEMENT IMPLÉMENTÉ | M |
| [LUMA-070](#luma-070) | Faire évoluer le contrat d’actions IA en v2 pour exposer les effets récents (fan, suiveurs de bandes) | P3 | PARTIELLEMENT IMPLÉMENTÉ | S |

**Dépendances principales.** Cette phase s’appuie sur [LUMA-031](#luma-031), [LUMA-041](#luma-041), [LUMA-042](#luma-042), [LUMA-001](#luma-001) (phases antérieures). L’annulation globale (LUMA-053) s’appuie sur la couverture du handler de programmation (LUMA-031) et sur la réduction du coût des mutations (LUMA-073), placée dans cette phase pour cette raison.

**Critères de sortie.** Voir la section 13 (phase 3).

**Risques bloquants.** LUMA-053 est l’élément le plus structurant de la phase. Son coût mémoire doit être mesuré avant d’être généralisé.

**Résultats concrets attendus.** Ctrl+Z annule toute édition. Les messages sont traduits. Les nœuds Art-Net sont découverts automatiquement. Le coût OpenRouter est visible et plafonnable. Les projets avec musique se déplacent d’une machine à l’autre.

### Phase 4 — Évolutions structurelles

**Objectif.** Supprimer les causes architecturales de gigue et de lenteur (moteur et commandes dans le même thread, état complet diffusé à chaque mutation, analyses lourdes dans le thread de l’interface) et résorber la dette signalée par les commentaires `shortcut:`.

**Éléments (7).**

| ID | Titre | Priorité | Statut | Effort |
|---|---|---|---|---|
| [LUMA-071](#luma-071) | Isoler le moteur temps réel et les sorties DMX hors de la boucle d’événements du processus principal | P2 | PARTIELLEMENT IMPLÉMENTÉ | XL |
| [LUMA-072](#luma-072) | Diffuser des changements incrémentaux du projet au lieu de l’état complet à chaque mutation | P2 | PARTIELLEMENT IMPLÉMENTÉ | L |
| [LUMA-074](#luma-074) | Déporter l’analyse musicale dans un Web Worker | P3 | PARTIELLEMENT IMPLÉMENTÉ | M |
| [LUMA-075](#luma-075) | Migrer le décodage LTC et l’analyse audio en direct vers un AudioWorklet | P3 | PARTIELLEMENT IMPLÉMENTÉ | M |
| [LUMA-076](#luma-076) | Réduire le coût par tick de la surveillance photosensible | P3 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-077](#luma-077) | Centraliser les modifications de `app.settings` dans une seule fonction transactionnelle | P3 | PARTIELLEMENT IMPLÉMENTÉ | S |
| [LUMA-078](#luma-078) | Prendre en charge le RDM via l’interface Enttec DMX USB Pro | P3 | ABSENT | L |

**Dépendances principales.** Cette phase s’appuie sur [LUMA-004](#luma-004), [LUMA-005](#luma-005), [LUMA-007](#luma-007), [LUMA-036](#luma-036), [LUMA-073](#luma-073), [LUMA-006](#luma-006), [LUMA-017](#luma-017), [LUMA-018](#luma-018), [LUMA-037](#luma-037), [LUMA-038](#luma-038) (phases antérieures). LUMA-071 ne s’engage que si les corrections locales de la phase 0 (LUMA-004, LUMA-005, LUMA-007) ne suffisent pas.

**Critères de sortie.** Voir la section 13 (phase 4).

**Risques bloquants.** LUMA-071 (XL) et LUMA-072 (L) touchent le cœur du système : à livrer derrière des tests de propriété et de performance, avec un mode de repli « même thread ».

**Résultats concrets attendus.** Gigue du moteur indépendante de la charge des commandes, événements de projet incrémentaux, analyse musicale et décodage LTC hors du thread de l’interface, écritures de paramètres centralisées.

### Phase 5 — Capacités futures

**Objectif.** Étendre le produit vers les usages professionnels : timelines multiples, verrouillage de show, redondance de sortie, nouvelles plateformes et nouveaux formats de profils.

**Éléments (5).**

| ID | Titre | Priorité | Statut | Effort |
|---|---|---|---|---|
| [LUMA-079](#luma-079) | Lire plusieurs timelines simultanément (couches indépendantes) | P3 | ABSENT | L |
| [LUMA-080](#luma-080) | Ajouter un mode « show verrouillé » qui interdit les éditions pendant l’exploitation | P3 | ABSENT | S |
| [LUMA-081](#luma-081) | Proposer une redondance de sortie par machine de secours sACN | P3 | ABSENT | L |
| [LUMA-082](#luma-082) | Construire et valider les versions macOS et Linux | P3 | ABSENT | L |
| [LUMA-083](#luma-083) | Importer les profils QLC+ (`.qxf`) | P3 | ABSENT | M |

**Dépendances principales.** Cette phase s’appuie sur [LUMA-021](#luma-021), [LUMA-071](#luma-071), [LUMA-064](#luma-064), [LUMA-008](#luma-008), [LUMA-038](#luma-038), [LUMA-029](#luma-029) (phases antérieures). Ces éléments supposent les fondations des phases 0 à 4 (CI multiplateforme, moteur isolé, découverte sACN).

**Critères de sortie.** Voir la section 13 (phase 5).

**Risques bloquants.** Ce sont des propositions nouvelles, sans code existant à prolonger pour la plupart : les cadrer par une conception courte avant de démarrer.

**Résultats concrets attendus.** Superposition de timelines, mode d’exploitation verrouillé, machine de secours sACN, builds macOS et Linux, import QLC+.

## 10. Fiches détaillées

### Fiches de la phase 0 — Sûreté du show et porte qualité

#### LUMA-001

- **ID** : LUMA-001
- **Titre** : Empêcher la double exécution des commandes MIDI quand la fenêtre 3D détachée est ouverte
- **Catégorie** : Contrôle externe (MIDI / timecode)
- **Nature** : A — Correction et rupture fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P0
- **Type** : correction de bug
- **Phase** : 0

**Constat technique.** La fenêtre 3D détachée charge le même bundle de rendu que la fenêtre principale. `main.tsx` appelle `bootstrap()` sans condition, et `bootstrap()` appelle `externalControl.configure(settings.control)`, qui ouvre Web MIDI et attache `onmidimessage` sur toutes les entrées. Chaque fenêtre possède donc sa propre instance d’`ExternalControl`, et chaque note MIDI mappée appelle `runShortcut()` dans les deux fenêtres. Dans la fenêtre détachée, `cueListId` vaut la première liste du projet (fixé au bootstrap), pas la liste sélectionnée par l’opérateur. Quand la source de timecode vaut `ltc`, l’entrée audio est aussi ouverte deux fois.

**Preuves dans le code.**

- `src/renderer/main.tsx:9-10` : `connectEvents(); void bootstrap();` est exécuté avant le choix entre `<DetachedStage3D />` et `<App />` (ligne 13).
- `src/renderer/App.tsx:348` : `void externalControl.configure(settings.control);` sans test de `location.hash`.
- `src/renderer/App.tsx:349-351` : le commentaire indique que `bootstrap` s’exécute aussi dans la fenêtre détachée ; seule l’ouverture automatique de la 3D est filtrée.
- `src/renderer/control.ts:47-60` (`ensureMidi`) attache `input.onmidimessage` ; `control.ts:81-85` appelle `runShortcut(m.action)` pour chaque mappage.
- `src/renderer/App.tsx:274` : l’action `go` envoie `cue.go` sur `useStore.getState().cueListId`.
- `src/main/index.ts:136-138` : la fenêtre `#stage3d` est créée avec le même `webPreferences` et le même renderer.

**Problème ou opportunité.** Avec le MIDI activé et la vue 3D détachée sur un second écran (usage prévu par le réglage `detachStage3dOnStart`), un seul appui sur la touche GO d’un contrôleur déclenche deux `cue.go` : la liste saute un cue, ou deux listes différentes avancent. C’est une erreur visible par le public, et le risque est maximal en exploitation.

**Résultat attendu.** Une seule instance du contrôle externe (MIDI, MTC, LTC) est active dans l’application, celle de la fenêtre principale. La fenêtre détachée ne fait que de l’affichage. Un appui MIDI produit exactement une commande.

**Travaux à effectuer.**

1. Dans `bootstrap()`, n’appeler `externalControl.configure` que si `location.hash !== DETACHED_STAGE_HASH`. Envisager de déplacer ce test dans `main.tsx`.
2. Vérifier que `Settings.tsx:307` (reconfiguration après enregistrement) ne peut s’exécuter que dans la fenêtre principale.
3. Ajouter une garde côté processus principal : journaliser un avertissement quand deux `webContents` différents envoient des commandes `cue.go` identiques à moins de 20 ms d’écart (diagnostic de régression).
4. Documenter dans le code de `control.ts` que l’instance est propre à la fenêtre principale.

**Critères d’acceptation.**

- [ ] Avec la fenêtre détachée ouverte et un mappage MIDI `go`, une note produit exactement un `cue.go` (compté côté `AppService`).
- [ ] La fenêtre détachée n’appelle jamais `navigator.requestMIDIAccess` ni `getUserMedia`.
- [ ] Aucune régression sur l’apprentissage MIDI de la page Paramètres.

**Tests requis.**

- Test de composant ou unitaire : `bootstrap()` exécuté avec `location.hash = "#stage3d"` n’appelle pas `externalControl.configure` (module simulé).
- E2E Playwright : ouvrir la fenêtre détachée, injecter un message MIDI simulé (bouchon de `requestMIDIAccess` dans les deux fenêtres) et vérifier un seul GO via `cue.go` compté par l’historique virtuel.

**Dépendances.** Indépendant. — Débloque : [LUMA-062](#luma-062).

**Effort estimé.** S

**Impact attendu.** élevé — supprime un double déclenchement en direct

**Risques et précautions.** Ne pas casser l’ouverture MIDI paresseuse de la page Paramètres (`ensureMidi` pendant l’apprentissage).

#### LUMA-002

- **ID** : LUMA-002
- **Titre** : Corriger le limiteur de cadence par sortie, qui divise par deux la fréquence DMX effective
- **Catégorie** : Sorties DMX (OutputManager)
- **Nature** : A — Correction et rupture fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P1
- **Type** : correction de bug
- **Phase** : 0

**Constat technique.** `OutputManager.sendFrames` saute une trame quand `now - last < 1000 / maxFps - 1`, avec `Date.now()` à la milliseconde. Valeurs par défaut : moteur à 40 Hz (période 25 ms) et `maxFps` à 40 (seuil 24 ms). Une trame en avance de plus de 1 ms est sautée, et l’envoi suivant n’a lieu qu’au tick d’après, environ 50 ms plus tard. À `rateHz = 44` (valeur maximale autorisée) avec `maxFps = 40`, l’intervalle de 22,7 ms est toujours inférieur à 24 ms : une trame sur deux est envoyée, soit environ 22 fps. Le test de performance mesure une gigue p95 d’environ 4 ms sur cette machine.

**Preuves dans le code.**

- `src/core/protocols/OutputManager.ts:130-132` : `if (now - last < 1000 / a.config.maxFps - 1) continue;` puis `this.lastSentAt.set(id, now)`.
- `src/core/settings/settings.ts:69` : `rateHz` de 10 à 44, 40 par défaut ; `src/core/protocols/config.ts:17` : `maxFps` de 1 à 44, 40 par défaut.
- Exécution locale de `npm run test:perf` (19/10/2026) : `expected 4.01… to be less than 2` (p95 de la gigue), `tests/perf/engine.perf.test.ts:33`.

**Problème ou opportunité.** La cadence DMX réelle peut tomber à environ la moitié de la valeur affichée. Les fondus et les mouvements deviennent saccadés sur le matériel, alors que l’indicateur moteur affiche 40 Hz. `measuredFps` rend le défaut visible, mais aucun test ne le couvre.

**Résultat attendu.** Pour une sortie configurée à N fps, le nombre de trames émises en 10 s reste à ±5 % de min(N, rateHz) malgré une gigue de ±5 ms des ticks.

**Travaux à effectuer.**

1. Remplacer le test « temps depuis le dernier envoi » par une échéance glissante : `nextDue += 1000/maxFps`, recalée quand le retard dépasse une période, avec une tolérance d’une demi-période.
2. Utiliser `performance.now()` (sub-milliseconde) au lieu de `Date.now()` pour le limiteur, en gardant l’horloge injectable du constructeur.
3. Quand `maxFps >= rateHz`, ne pas limiter du tout (court-circuit).

**Critères d’acceptation.**

- [ ] Avec une horloge simulée et des ticks à 25 ms ± 3 ms, une sortie `maxFps = 40` émet au moins 38 trames/s.
- [ ] Avec `rateHz = 44` et `maxFps = 40`, une sortie émet entre 38 et 41 trames/s.
- [ ] Avec `maxFps = 10`, la sortie n’émet jamais plus de 10,5 trames/s.

**Tests requis.**

- Unitaire `OutputManager` avec horloge injectée (paramètre `now` existant) et suite de ticks avec gigue pseudo-aléatoire déterministe.
- Ajout d’une assertion sur `stats.measuredFps` dans `tests/unit/protocols.test.ts`.

**Dépendances.** Indépendant. — Débloque : [LUMA-038](#luma-038).

**Effort estimé.** S

**Impact attendu.** élevé — fluidité réelle du DMX sur toutes les sorties

**Risques et précautions.** Ne pas dépasser la cadence matérielle des interfaces série (Open DMX limité à 40 fps dans le schéma) : garder la borne supérieure.

#### LUMA-003

- **ID** : LUMA-003
- **Titre** : Libérer la séquence de localisation caméra et la mire de test quand le rendu disparaît
- **Catégorie** : Sécurité scène / localisation caméra
- **Nature** : A — Correction et rupture fonctionnelle
- **Statut actuel** : ABSENT
- **Priorité** : P1
- **Type** : sécurité
- **Phase** : 0

**Constat technique.** La localisation caméra pose une couche externe `locate` de priorité 1000 qui éteint tout le kit sauf les projecteurs éclairés en blanc (jusqu’à 60 %). Elle n’est retirée que par `locate.end`, que le rendu envoie au démontage du composant `CameraLocate`. Si le rendu plante ou est rechargé, `render-process-gone` est seulement journalisé. La couche reste active et la scène reste figée sur la mire de localisation. La mire de test brute (`output.testPattern`) n’a pas non plus de libération automatique.

**Preuves dans le code.**

- `src/core/app/handlers/locate.ts:69` : `setExternal("locate", { layer: { … priority: 1000 … } })`.
- `src/renderer/features/CameraLocate.tsx:87` : `locate.end` est envoyé seulement dans le nettoyage de `useEffect`.
- `src/main/index.ts:223` : `render-process-gone` appelle uniquement `logFatal`.
- `src/core/app/handlers/output.ts:88-99` : `e.testPattern` persiste jusqu’à `pattern: null`.

**Problème ou opportunité.** Un plantage du rendu pendant une localisation, alors que des personnes peuvent se trouver sur scène, laisse la scène dans un état inattendu, sans indication pour l’opérateur. Seul un redémarrage complet ou l’arrêt des émissions en sort.

**Résultat attendu.** Quand la fenêtre principale disparaît, plante ou est rechargée, le processus principal termine la localisation, arrête une mire active et journalise l’action. Une séquence de localisation sans activité pendant plus de 2 minutes s’arrête aussi d’elle-même.

**Travaux à effectuer.**

1. Exposer sur `AppService` une méthode `onRendererLost()` qui appelle `endLocate()` et met `engine.testPattern = null`, avec un avertissement journalisé.
2. L’appeler depuis `render-process-gone` et depuis `did-start-navigation`/`did-finish-load` de la fenêtre principale (rechargement).
3. Ajouter un minuteur d’inactivité dans `handleLocate` : chaque `locate.frame` le réarme, et son expiration appelle `endLocate`.
4. Afficher l’état « localisation interrompue » dans les alertes.

**Critères d’acceptation.**

- [ ] Simuler la perte du rendu pendant une localisation retire la couche `locate` au tick suivant.
- [ ] Une séquence sans `locate.frame` pendant le délai configuré s’arrête et journalise un avertissement.
- [ ] Une mire active est arrêtée à la perte du rendu.

**Tests requis.**

- Unitaire `AppService` : `locate.begin`, puis `onRendererLost()`, puis le snapshot moteur ne contient plus la couche ; `runtimeState().locate === null`.
- Unitaire avec minuteurs simulés (`vi.useFakeTimers`) pour l’expiration d’inactivité.

**Dépendances.** Indépendant.

**Effort estimé.** S

**Impact attendu.** élevé — sûreté des personnes sur scène

**Risques et précautions.** Ne pas arrêter la localisation quand seule la fenêtre détachée se ferme : filtrer sur la fenêtre principale.

#### LUMA-004

- **ID** : LUMA-004
- **Titre** : Supprimer la lecture et le déchiffrement synchrones de la clé API dix fois par seconde
- **Catégorie** : Performance du processus principal
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P1
- **Type** : performance
- **Phase** : 0

**Constat technique.** `runtimeState()` calcule `hasKey: !!this.opts.secrets.get(OPENROUTER_KEY)`. Il est appelé à chaque émission `runtime`, soit toutes les 100 ms depuis `onFrame`, et aussi à chaque image de localisation. `createSecretStore().get()` fait un `readFileSync` de `secrets.json`, un `JSON.parse` et un `safeStorage.decryptString` (DPAPI) à chaque appel, sur le thread qui fait aussi tourner le moteur temps réel.

**Preuves dans le code.**

- `src/core/app/AppService.ts:243` : `hasKey: !!this.opts.secrets.get(OPENROUTER_KEY)`.
- `src/core/app/monitor.ts:25-28` : émission `runtime` toutes les 100 ms.
- `src/main/secrets.ts:12-26` : `read()` appelle `readFileSync` et `get()` appelle `decryptString`, sans cache.

**Problème ou opportunité.** Dix entrées/sorties disque et appels DPAPI synchrones par seconde ajoutent de la gigue au moteur, qui partage la boucle d’événements. C’est l’un des contributeurs plausibles à l’échec du test de gigue (LUMA-007). Avec un antivirus ou un disque lent, chaque lecture peut bloquer plusieurs millisecondes.

**Résultat attendu.** Pendant le fonctionnement normal, la présence de la clé est connue sans aucun accès disque. Le déchiffrement n’a lieu qu’au moment d’un appel OpenRouter.

**Travaux à effectuer.**

1. Ajouter à `SecretStore` une méthode `has(name)` qui s’appuie sur un cache mémoire de l’ensemble chiffré, invalidé par `set()`.
2. Utiliser `has()` dans `runtimeState()` et garder `get()` pour `aiPropose`, `askOpenRouter` et `sceneFromPhoto`.
3. Mettre en cache le contenu chiffré lu une seule fois au démarrage dans `createSecretStore`.

**Critères d’acceptation.**

- [ ] En fonctionnement nominal sur 10 s, `readFileSync` de `secrets.json` est appelé zéro fois (espion dans un test).
- [ ] `hasKey` reflète immédiatement un `ai.setKey`.

**Tests requis.**

- Unitaire `createSecretStore` avec un `safeStorage` simulé (module `electron` remplacé) : `has()` sans lecture disque, invalidation après `set()`.
- Unitaire `AppService` : `runtimeState()` n’appelle pas `secrets.get` (espion sur le `SecretStore` injecté).

**Dépendances.** Indépendant. — Débloque : [LUMA-007](#luma-007), [LUMA-071](#luma-071).

**Effort estimé.** XS

**Impact attendu.** moyen — réduit la contention du thread moteur

**Risques et précautions.** Garder le refus d’enregistrer quand le chiffrement est indisponible (`secrets.ts:33`).

#### LUMA-005

- **ID** : LUMA-005
- **Titre** : Limiter le flot d’erreurs répétées du moteur dans le journal et les alertes
- **Catégorie** : Moteur temps réel / observabilité
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P1
- **Type** : fiabilité
- **Phase** : 0

**Constat technique.** Quand `Engine.tick` lève une exception, il émet `error` à chaque tick, soit 40 fois par seconde. `AppService` transforme chaque erreur en `logger.error`, qui est écrit de façon synchrone par `FileLogSink` (`appendFileSync`), poussé dans les alertes et diffusé à toutes les fenêtres. Aucune déduplication ni temporisation n’existe. Pendant ces ticks, aucune trame n’est envoyée : le `sendFrames` se trouve dans le même bloc `try`.

**Preuves dans le code.**

- `src/core/engine/Engine.ts:419-421` : `catch (err) { this.emit("error", …) }` à chaque tick fautif.
- `src/core/app/AppService.ts:144` : `this.engine.on("error", (err) => this.logger.error("Moteur", err.message))`.
- `src/core/log/fileSink.ts:43` : `appendFileSync` synchrone pour chaque entrée.
- `src/core/app/AppService.ts:136-142` : chaque `warn`/`error` est ajouté aux alertes (30 au maximum) et émis.

**Problème ou opportunité.** Une donnée de projet qui fait échouer le calcul produit 2 400 lignes d’erreur par minute, sature le fichier de journal (rotation à 2 Mo) et efface l’historique utile. Les écritures synchrones aggravent la gigue au moment même où le moteur est dégradé.

**Résultat attendu.** Une même erreur moteur est journalisée au plus une fois toutes les 5 s, avec un compteur d’occurrences. Une alerte unique et persistante signale le mode dégradé, et la dernière trame valide est maintenue pour les sorties.

**Travaux à effectuer.**

1. Dans `AppService`, regrouper les erreurs moteur par message : journaliser la première, puis un résumé « × N » toutes les 5 s.
2. Dans `Engine.tick`, en cas d’erreur, renvoyer la dernière trame calculée (`this.universes`) pour garder le keep-alive DMX, et l’indiquer dans `metrics()` avec un champ `errors`.
3. Exposer le compteur dans le diagnostic et dans `hardware.report`.

**Critères d’acceptation.**

- [ ] Une erreur injectée à chaque tick pendant 10 s produit au plus 3 entrées de journal.
- [ ] Pendant l’erreur, les sorties continuent de recevoir la dernière trame valide.

**Tests requis.**

- Unitaire `Engine` avec un index dont une fixture lève à `finalizeFixture` (bouchon) : la trame précédente est renvoyée.
- Unitaire `AppService` : comptage des entrées de journal sous `vi.useFakeTimers`.

**Dépendances.** Indépendant. — Débloque : [LUMA-007](#luma-007), [LUMA-048](#luma-048), [LUMA-071](#luma-071).

**Effort estimé.** S

**Impact attendu.** moyen — préserve le journal et la continuité DMX

**Risques et précautions.** Ne pas masquer une erreur nouvelle de message différent : regrouper par message, pas globalement.

#### LUMA-006

- **ID** : LUMA-006
- **Titre** : Garantir que l’analyse audio réactive continue quand la fenêtre principale est masquée ou réduite
- **Catégorie** : Audio réactif / rendu
- **Nature** : A — Correction et rupture fonctionnelle
- **Statut actuel** : IMPLÉMENTÉ, VALIDATION INSUFFISANTE
- **Priorité** : P1
- **Type** : fiabilité
- **Phase** : 0

**Constat technique.** La boucle d’analyse audio (`AudioEngine.loop`) est cadencée par `requestAnimationFrame` dans le rendu de la fenêtre principale, et c’est elle qui envoie `audio.features` au processus principal. Chromium suspend `requestAnimationFrame` dans une fenêtre réduite ou masquée, et `webPreferences` ne désactive pas `backgroundThrottling`. Le cas d’usage « vue 3D détachée en plein écran, fenêtre principale réduite » coupe donc les réactions audio : `AudioReactive` les relâche après 1 s sans données (`STALE_MS`).

**Preuves dans le code.**

- `src/renderer/audioEngine.ts:139-156` : `this.raf = requestAnimationFrame(this.loop)` et envoi de `audio.features`.
- `src/main/index.ts:104-111` : `webPreferences` sans `backgroundThrottling: false`.
- `src/core/audio/reactive.ts:26` et `:99-106` : relâche des contributions audio après 1 s sans données fraîches.
- Aucun test e2e ne couvre une fenêtre réduite (`tests/e2e/app.spec.ts`).

**Problème ou opportunité.** Les réactions audio (flash sur le temps, couleur selon l’énergie, GO sur un drop prédit) s’arrêtent sans alerte dès que l’opérateur réduit la régie. L’opérateur croit le show réactif alors qu’il ne l’est plus.

**Résultat attendu.** L’analyse audio continue au même rythme (au moins 20 envois par seconde) quand la fenêtre principale est réduite ou masquée. Une alerte est émise si les données audio cessent alors qu’une source est active.

**Travaux à effectuer.**

1. Remplacer le cadencement `requestAnimationFrame` de l’analyse par un minuteur (`setInterval` à 20 ms) non lié à l’affichage. Le rendu visuel garde son rAF.
2. Ajouter `backgroundThrottling: false` à la fenêtre principale, et vérifier l’impact CPU.
3. Dans `AudioReactive`, journaliser un avertissement quand la source passe de « active » à « périmée » sans `stop()` explicite.

**Critères d’acceptation.**

- [ ] Fenêtre réduite pendant 30 s avec une source simulée : `runtime.audio.active` reste vrai en continu.
- [ ] Arrêt volontaire de la source : aucun avertissement.

**Tests requis.**

- E2E Playwright : démarrer la source simulée, appeler `BrowserWindow.minimize()` via `app.evaluate`, puis vérifier `audio.active` pendant 5 s.
- Unitaire `AudioReactive` : transition de « fraîche » à « périmée » avec avertissement unique.

**Dépendances.** Indépendant. — Débloque : [LUMA-075](#luma-075).

**Effort estimé.** S

**Impact attendu.** élevé — fiabilité du mode audio-réactif en exploitation

**Risques et précautions.** La désactivation du throttling augmente la consommation en arrière-plan : la limiter à la fenêtre principale.

#### LUMA-007

- **ID** : LUMA-007
- **Titre** : Ramener la gigue de l’ordonnanceur sous le seuil du test de performance (p95 < 2 ms)
- **Catégorie** : Moteur temps réel
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P1
- **Type** : performance
- **Phase** : 0

**Constat technique.** Le test `tests/perf/engine.perf.test.ts` échoue de façon reproductible sur la machine d’audit : p95 de la gigue à 4,01 ms (seuil 2 ms), avec deux échecs sur la seconde exécution. `npm run check` inclut `test:perf`, et la porte qualité complète est donc rouge. `scripts/release.mjs` n’exécute pas `test:perf` et ne voit pas la régression.

**Preuves dans le code.**

- Exécutions locales du 19/10/2026 : `Tests 1 failed | 2 passed (3)`, puis `Tests 2 failed | 1 passed (3)` sur une machine au repos.
- `tests/perf/engine.perf.test.ts:31-33` : assertions sur le taux mesuré et sur `p95 < 2`.
- `package.json` : `"check": "… && npm run test:perf"` ; `scripts/release.mjs:31-34` : sans `test:perf`.
- `src/core/engine/Engine.ts:452-488` : ordonnanceur `setTimeout` puis `setImmediate` dans le thread principal.

**Problème ou opportunité.** La qualité temps réel promise par l’ordonnanceur n’est pas tenue sur Windows dans les conditions du test. Sans diagnostic, on ignore si le défaut vient de l’environnement (minuteries Windows) ou du code (allocation par tick, contention).

**Résultat attendu.** Le test passe dix fois de suite sur la machine de référence. À défaut, le seuil est justifié par une mesure documentée par plateforme, et la cause de la gigue est identifiée dans un rapport de profilage.

**Travaux à effectuer.**

1. Profiler un tick avec `--cpu-prof` sur le scénario du test pour mesurer les allocations dans `mergeSources`, `finalizeFixture` et `structuredClone`.
2. Mesurer l’effet de `timeBeginPeriod` (Electron et Node sous Windows) ou d’un attente active bornée sur les dernières 2 ms.
3. Réduire les allocations par tick (réutilisation des objets de `compute`).
4. Si le seuil reste inatteignable sur Windows, le rendre dépendant de la plateforme avec une justification mesurée, sans le baisser sans preuve.

**Critères d’acceptation.**

- [ ] `npm run test:perf` passe dix fois consécutives sur la machine de référence.
- [ ] Le rapport de profilage est archivé dans `test-results/`.

**Tests requis.**

- Le test de performance existant, plus un test d’allocation (nombre d’objets créés par tick, mesuré via `process.memoryUsage().heapUsed` sur 10 000 ticks).

**Dépendances.** [LUMA-004](#luma-004), [LUMA-005](#luma-005) — Débloque : [LUMA-046](#luma-046), [LUMA-071](#luma-071).

**Effort estimé.** M

**Impact attendu.** élevé — porte qualité et qualité DMX

**Risques et précautions.** Une attente active sur le thread principal dégrade l’IPC : borner sa durée et la mesurer.

#### LUMA-008

- **ID** : LUMA-008
- **Titre** : Mettre en place une intégration continue Windows (typecheck, lint, tests, conventions de commit)
- **Catégorie** : Qualité / livraison
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : ABSENT
- **Priorité** : P1
- **Type** : tests
- **Phase** : 0

**Constat technique.** Le dossier `.github` ne contient qu’un modèle de pull request, sans workflow. Le script `scripts/check-commits.mjs` existe mais rien ne l’appelle (ni hook, ni CI, ni script npm). Les vérifications ne sont lancées qu’à la main ou par `npm run release`.

**Preuves dans le code.**

- Listing de `.github` : uniquement `pull_request_template.md`, aucun dossier `workflows/`.
- `scripts/check-commits.mjs` : prend `<base-ref>` en argument, et aucune référence ne figure dans `package.json`.
- `package.json` : scripts `typecheck`, `lint`, `test`, `test:perf`, `test:e2e` présents.

**Problème ou opportunité.** Les régressions (comme l’échec du test de performance ou du test de couverture, LUMA-007 et LUMA-009) ne sont détectées qu’au moment de la release, ou jamais. Les contributions extérieures ne sont pas vérifiées.

**Résultat attendu.** Chaque push et chaque pull request lancent sur `windows-latest` : `npm ci`, `typecheck`, `lint` (avec taille et i18n), `test`, `test:coverage` avec seuils et `check-commits`. Les E2E sont lancés quotidiennement ou à la demande.

**Travaux à effectuer.**

1. Créer `.github/workflows/ci.yml` (Windows, Node à la version de `package.json`, cache npm).
2. Ajouter un job E2E (`xvfb` inutile sous Windows) avec téléversement de `test-results/` en cas d’échec.
3. Brancher `node scripts/check-commits.mjs origin/master` sur les pull requests.
4. Publier le rapport de couverture (`json-summary`) en artefact.

**Critères d’acceptation.**

- [ ] Une pull request qui casse un test est marquée en échec.
- [ ] Un commit « up » sur une pull request fait échouer `check-commits`.

**Tests requis.**

- Exécution du workflow sur une branche témoin contenant un test volontairement cassé.

**Dépendances.** [LUMA-009](#luma-009) — Débloque : [LUMA-035](#luma-035), [LUMA-046](#luma-046), [LUMA-084](#luma-084), [LUMA-082](#luma-082).

**Effort estimé.** S

**Impact attendu.** élevé — protection permanente contre les régressions

**Risques et précautions.** Le test de performance est sensible à la machine : l’exécuter dans un job séparé non bloquant tant que LUMA-007 n’est pas résolu.

#### LUMA-009

- **ID** : LUMA-009
- **Titre** : Rendre `npm run test:coverage` fiable (délai des hooks sous instrumentation)
- **Catégorie** : Tests
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P1
- **Type** : tests
- **Phase** : 0

**Constat technique.** `vitest.config.ts` fixe `testTimeout` à 20 s, mais pas `hookTimeout`, qui reste à 10 s par défaut. Sous instrumentation V8, le `beforeAll` de `tests/unit/richShow.test.ts` (analyse de trois morceaux synthétiques) dépasse 10 s : la suite échoue et ses 10 tests sont ignorés. Avec `--hookTimeout=60000`, les 36 fichiers passent (321 tests).

**Preuves dans le code.**

- Exécution locale : `FAIL tests/unit/richShow.test.ts — Error: Hook timed out in 10000ms` (`tests/unit/richShow.test.ts:23`).
- `vitest.config.ts:12` : `testTimeout: 20_000` seul.
- Seconde exécution avec `--hookTimeout=60000` : `Test Files 36 passed (36)`.

**Problème ou opportunité.** La commande de couverture, qui vérifie les seuils de non-régression (`thresholds`), échoue pour une raison d’outillage. Les seuils ne sont donc pas réellement appliqués.

**Résultat attendu.** `npm run test:coverage` passe de façon déterministe et applique les seuils configurés.

**Travaux à effectuer.**

1. Ajouter `hookTimeout: 60_000` dans `vitest.config.ts`.
2. Mettre en cache dans le module de test l’analyse des morceaux de `richShow.test.ts` partagée avec `songToShow.test.ts`, si elle est dupliquée.

**Critères d’acceptation.**

- [ ] `npm run test:coverage` passe trois fois de suite.
- [ ] Les seuils `lines 85 / branches 70` restent appliqués.

**Tests requis.**

- Exécution de la commande de couverture dans la CI (LUMA-008).

**Dépendances.** Indépendant. — Débloque : [LUMA-008](#luma-008), [LUMA-031](#luma-031).

**Effort estimé.** XS

**Impact attendu.** moyen — rend effectif le cliquet de couverture

**Risques et précautions.** Aucun.

### Fiches de la phase 1 — Fermeture des parcours incomplets

#### LUMA-010

- **ID** : LUMA-010
- **Titre** : Raccorder la commande « Tout relâcher » (`engine.releaseAll`) à l’interface, à l’OSC et à la télécommande
- **Catégorie** : Contrôle du show
- **Nature** : A — Correction et rupture fonctionnelle
- **Statut actuel** : PRÉSENT MAIS NON RACCORDÉ
- **Priorité** : P1
- **Type** : fonctionnalité
- **Phase** : 1

**Constat technique.** Le processus principal implémente `engine.releaseAll`, qui relâche le programmeur et la couche IA et arrête effets, playbacks et timeline. Aucun composant du rendu ne l’envoie, aucune adresse OSC ne le déclenche, et aucun test ne le couvre. Le bouton « Tout relâcher » de la Live Console envoie en réalité `programmer.release`, comme le précise son infobulle.

**Preuves dans le code.**

- `src/core/app/handlers/output.ts:23-30` : implémentation de `engine.releaseAll`.
- Recherche dans `src/renderer` : aucune occurrence de `engine.releaseAll` ; `src/renderer/features/LiveConsole.tsx:377` envoie `programmer.release`.
- `src/core/app/control.ts:65-89` : la table OSC n’a pas d’adresse de relâche globale ; `src/core/control/remote.ts:86` : non autorisé à distance.
- Recherche dans `tests/` : aucune occurrence.

**Problème ou opportunité.** En cas de dérive (effets IA, timeline et playbacks superposés), l’opérateur ne dispose d’aucun moyen en un geste de revenir à un état neutre sans couper les émissions. Le libellé « Tout relâcher » entretient la confusion.

**Résultat attendu.** Une action « Tout relâcher » est accessible depuis la barre supérieure (avec confirmation), par un raccourci configurable, par l’OSC `/luma/releaseall` et par la télécommande. Le bouton de la Live Console est renommé « Relâcher le programmeur ».

**Travaux à effectuer.**

1. Ajouter l’action `releaseAll` à `SHORTCUT_ACTIONS` (`settings.ts`) et à `runShortcut` (`App.tsx`).
2. Ajouter un bouton dans la barre supérieure, à côté de Blackout, avec `confirmAction`.
3. Ajouter `/luma/releaseall` dans `onOsc` et `engine.releaseAll` dans `ALLOWED` de `remote.ts`.
4. Corriger les clés i18n `console.releaseAll*`.

**Critères d’acceptation.**

- [ ] Après `engine.releaseAll`, le snapshot moteur ne contient ni effet, ni playback actif, ni timeline en lecture, ni couche IA, ni programmeur.
- [ ] L’action est déclenchable par les quatre canaux (interface, raccourci, OSC, télécommande).

**Tests requis.**

- Unitaire `AppService` : état complet après `engine.releaseAll`.
- Unitaire `onOsc` : `/luma/releaseall`.
- Unitaire `validateRemoteCommand` : acceptée.
- E2E : bouton et confirmation.

**Dépendances.** Indépendant.

**Effort estimé.** S

**Impact attendu.** élevé — geste de sécurité opérateur

**Risques et précautions.** Ne pas inclure le blackout ni l’arrêt des émissions dans cette action : ce sont des gestes distincts.

#### LUMA-011

- **ID** : LUMA-011
- **Titre** : Proposer la récupération du travail au démarrage après une fermeture anormale
- **Catégorie** : Persistance / reprise après crash
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P1
- **Type** : fiabilité
- **Phase** : 1

**Constat technique.** Une copie de récupération est écrite toutes les `autosaveMinutes` dans `<userData>/autosave/<projectId>.luma.json` quand le projet est modifié. Elle n’est supprimée qu’après un enregistrement. Au démarrage, rien n’indique à l’utilisateur qu’une copie plus récente existe : la liste n’est visible que dans l’onglet Paramètres › Sauvegardes. Après `project.openRecovery`, `projectPath` vaut `null`, et le lien avec le fichier d’origine est perdu.

**Preuves dans le code.**

- `src/core/app/files.ts:14-32` : `autosaveFile`, `autosave` et `clearAutosave`.
- `src/renderer/features/Settings.tsx:300` : `project.listRecovery` appelé seulement quand `tab === "backups"`.
- `src/core/app/handlers/project.ts:34` : `projectPath = null` pour `openRecovery`.
- `src/core/app/AppService.ts:190` : minuteur d’autosauvegarde toutes les 15 s.

**Problème ou opportunité.** Après un plantage ou une coupure de courant, l’utilisateur rouvre son fichier sans savoir qu’une version plus récente existe : il perd jusqu’à `autosaveMinutes` de travail. Les copies orphelines s’accumulent aussi dans le dossier de récupération.

**Résultat attendu.** Au démarrage, si une copie de récupération plus récente que le fichier d’origine existe, une boîte de dialogue propose de la restaurer, de l’ignorer ou de la supprimer. Le fichier d’origine est mémorisé pour que « Enregistrer » le réécrive après confirmation.

**Travaux à effectuer.**

1. Ajouter au format de copie de récupération le chemin d’origine (métadonnée hors projet, fichier `<id>.meta.json`).
2. Ajouter une commande `project.recoveryCandidates` qui compare les dates de modification et la lancer dans `bootstrap()`.
3. Afficher un dialogue dans `StartScreen` ou `OnboardingHost`.
4. Lors de la restauration, renseigner `projectPath` avec le chemin d’origine, en gardant `dirty`.

**Critères d’acceptation.**

- [ ] Modifier un projet, tuer le processus, relancer : le dialogue de récupération apparaît.
- [ ] Restaurer puis enregistrer écrit dans le fichier d’origine, et l’ancien est conservé en `.bak`.

**Tests requis.**

- Intégration `AppService` : écriture d’autosauvegarde, nouvelle instance, `project.recoveryCandidates` non vide.
- E2E : relance avec un profil `LUMA_USER_DATA` préparé.

**Dépendances.** Indépendant.

**Effort estimé.** M

**Impact attendu.** élevé — protection contre la perte de travail

**Risques et précautions.** Ne pas proposer une copie plus ancienne que le fichier enregistré.

#### LUMA-012

- **ID** : LUMA-012
- **Titre** : Permettre l’annulation d’une requête IA ou d’une génération de show en cours
- **Catégorie** : IA / opérations longues
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : ABSENT
- **Priorité** : P2
- **Type** : fonctionnalité
- **Phase** : 1

**Constat technique.** Les appels OpenRouter (`ai.propose`, `ai.sceneFromPhoto`, `music.generate`, `music.regenerateSection`) ne s’interrompent qu’à l’expiration du délai (`timeoutSec`, jusqu’à 300 s). L’`AbortController` reste interne à `request()`. Aucune commande d’annulation n’existe. Le modal de génération musicale ne peut pas être fermé, et un commentaire indique que la commande ne peut pas être annulée. Le verrou `aiBusy` bloque toute autre requête pendant ce temps.

**Preuves dans le code.**

- `src/core/ai/providers/openrouter.ts:170-181` : `AbortController` local, piloté uniquement par `timeoutMs`.
- `src/shared/commands.ts:222-229` : commandes `ai.*` sans annulation.
- `src/renderer/features/Music.tsx:78` : commentaire sur la fenêtre bloquante et non annulable.
- `src/core/app/handlers/ai.ts:75-76` et `music.ts:140-141` : `aiBusy`.

**Problème ou opportunité.** Une requête lente ou bloquée immobilise l’interface de génération jusqu’à 5 minutes, pendant une répétition ou un réglage.

**Résultat attendu.** Une commande `ai.cancel` interrompt la requête en cours sous 200 ms, libère `aiBusy`, ne modifie pas le projet et affiche « annulée ». Le modal de génération propose un bouton Annuler.

**Travaux à effectuer.**

1. Passer un `AbortSignal` externe à `OpenRouterOptions` et le combiner au délai dans `request()` (`AbortSignal.any`).
2. Conserver dans `AppService` l’`AbortController` de la requête active, et ajouter la commande `ai.cancel` au schéma et au handler.
3. Vérifier que `applyShow` et `storeProposal` ne s’exécutent pas après une annulation.
4. Ajouter le bouton Annuler dans `GeneratingModal` et dans l’IA Director.

**Critères d’acceptation.**

- [ ] Une requête simulée de 30 s annulée à 1 s : la promesse est rejetée avec une `UserError` « annulée », `aiBusy` vaut faux et `project.revision` n’a pas changé.
- [ ] Aucune écriture tardive après l’annulation.

**Tests requis.**

- Unitaire `completeJson` avec un `fetchImpl` simulé qui respecte le `signal`.
- Intégration `music.generate` annulé : le projet est inchangé.

**Dépendances.** Indépendant. — Débloque : [LUMA-013](#luma-013).

**Effort estimé.** M

**Impact attendu.** moyen — maîtrise des opérations longues

**Risques et précautions.** Ne pas mettre en cache une réponse partielle (`ResponseCache.set`).

#### LUMA-013

- **ID** : LUMA-013
- **Titre** : Remplacer la barre de progression simulée de la génération de show par une progression réelle
- **Catégorie** : Musique (Song-to-Show) / UX
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : amélioration
- **Phase** : 1

**Constat technique.** Le modal de génération affiche une barre qui tend vers 95 % selon une exponentielle du temps écoulé, avec des libellés d’étapes déduits de ce pourcentage. Le handler `music.generate` n’émet aucune progression. Un commentaire `shortcut:` signale cette limite.

**Preuves dans le code.**

- `src/renderer/features/Music.tsx:83-86` : `setP(0.95 * (1 - Math.exp(-(Date.now() - t0) / 8000)))`.
- `src/core/app/handlers/music.ts:55-60` : `planShow` puis `applyShow`, sans événement intermédiaire.
- `src/shared/commands.ts:451-457` : `AppEvents` sans événement de progression.

**Problème ou opportunité.** Les étapes affichées (« analyse », « sections », « looks »…) ne correspondent pas au traitement réel : c’est une information fausse. Avec le cache IA, la génération est instantanée, mais avec un modèle lent la barre reste à 95 % sans explication.

**Résultat attendu.** Le processus principal émet des événements `progress` (étape réelle : cache, requête IA, validation, compilation, application) et le modal les affiche. La barre n’est plus simulée.

**Travaux à effectuer.**

1. Ajouter un événement `progress: { op: string; step: string; p: number | null }` à `AppEvents` et le relayer dans `main/index.ts`.
2. L’émettre dans `askOpenRouter`, `planShow`, `compileShow` et `applyShow`.
3. Faire consommer cet événement par `GeneratingModal`, avec une barre indéterminée pendant la requête réseau.

**Critères d’acceptation.**

- [ ] Chaque génération émet au moins les étapes « planification » et « compilation ».
- [ ] Aucune étape affichée sans traitement correspondant.

**Tests requis.**

- Unitaire : séquence d’événements `progress` lors d’un `music.generate` local.
- Test de composant `GeneratingModal`.

**Dépendances.** [LUMA-012](#luma-012)

**Effort estimé.** S

**Impact attendu.** moyen — honnêteté de l’interface

**Risques et précautions.** Limiter la fréquence des événements (au plus 10 par seconde).

#### LUMA-014

- **ID** : LUMA-014
- **Titre** : Protéger la génération de show contre les modifications concurrentes du projet pendant l’appel IA
- **Catégorie** : Musique (Song-to-Show) / concurrence
- **Nature** : A — Correction et rupture fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : correction de bug
- **Phase** : 1

**Constat technique.** `music.generate` capture le morceau `t` avant l’`await planShow(...)`, qui peut durer jusqu’à `timeoutSec`. Pendant ce temps, d’autres commandes restent acceptées, y compris `music.removeTrack` ou l’ouverture d’un autre projet. `applyShow` compile ensuite avec l’index courant et fait `d.music.tracks.find((x) => x.id === t.id)!`. Si le morceau a disparu, l’assertion non nulle provoque une `TypeError` non gérée. Si un autre projet a été ouvert, le show est compilé contre le mauvais kit.

**Preuves dans le code.**

- `src/core/app/handlers/music.ts:55-59` : `const t = track(...)`, puis `await planShow(...)`, puis `applyShow(app, t, …)`.
- `src/core/app/handlers/music.ts:199-201` : `d.music.tracks.find((x) => x.id === t.id)!`.
- `src/core/app/handlers/project.ts:26-39` : `project.open` n’est pas bloqué pendant `aiBusy`.

**Problème ou opportunité.** Ce cas produit une erreur technique incompréhensible, journalisée comme erreur interne, ou un show généré pour un projet qui n’est plus ouvert.

**Résultat attendu.** Après l’appel IA, la génération vérifie que le projet (`project.id`) et le morceau existent toujours. Sinon, elle s’arrête avec un message clair, sans modifier le projet.

**Travaux à effectuer.**

1. Mémoriser `app.project.id` et `t.id` avant l’`await`, puis les revérifier dans `applyShow`.
2. Remplacer l’assertion `!` par une `UserError` explicite.
3. Étendre la même garde à `music.regenerateSection` et à `aiPropose` (le contexte de validation est recalculé après l’appel).

**Critères d’acceptation.**

- [ ] Supprimer le morceau pendant une génération simulée lente lève une `UserError` « morceau supprimé pendant la génération ».
- [ ] Ouvrir un autre projet pendant la génération laisse le nouveau projet intact.

**Tests requis.**

- Intégration avec un `fetchImpl` OpenRouter simulé et retardé, et des commandes concurrentes.

**Dépendances.** Indépendant.

**Effort estimé.** S

**Impact attendu.** moyen — robustesse des opérations asynchrones

**Risques et précautions.** Aucun.

#### LUMA-015

- **ID** : LUMA-015
- **Titre** : Nettoyer les réactions audio qui pointent vers une liste de cues supprimée
- **Catégorie** : Intégrité des références du projet
- **Nature** : A — Correction et rupture fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : correction de bug
- **Phase** : 1

**Constat technique.** Le nettoyage de `audio.reactions.energyRiseGo.cueListId` se trouve dans le traitement de `effect.remove`, et non dans celui de `cueList.remove`. Supprimer une liste de cues laisse donc `energyRiseGo.cueListId` et `dropGo.cueListId` pointer vers une liste inexistante. `dropGo` n’est nettoyé nulle part. Le schéma Zod ne vérifie pas l’intégrité référentielle.

**Preuves dans le code.**

- `src/core/app/handlers/programming.ts:148-155` : `effect.remove` contient la ligne `energyRiseGo.cueListId … = null`.
- `src/core/app/handlers/programming.ts:132-138` : `cueList.remove` ne touche pas `d.audio`.
- `src/core/model/schemas.ts:332` et `:346-348` : `cueListId: idSchema.nullable()` pour les deux réactions.
- `src/core/audio/reactive.ts:69` et `:93-94` : `cueGo` sur l’identifiant configuré.

**Problème ou opportunité.** L’interface Audio continue d’afficher une réaction armée vers une liste fantôme. `cueGo` échoue silencieusement : le GO sur montée d’énergie ou sur drop ne se déclenche plus, sans alerte. Si un identifiant est réutilisé (import), la réaction vise une autre liste.

**Résultat attendu.** Supprimer une liste remet à `null` toutes les références vers elle (`energyRiseGo`, `dropGo`, événements de timeline) et journalise l’information. La ligne erronée de `effect.remove` est retirée.

**Travaux à effectuer.**

1. Déplacer le nettoyage dans `cueList.remove` et y ajouter `dropGo`.
2. Ajouter une fonction `validateReferences(project)` dans `src/core/model` qui liste les références orphelines, appelée au chargement pour réparer et avertir.

**Critères d’acceptation.**

- [ ] Après `cueList.remove`, `d.audio.reactions.energyRiseGo.cueListId` et `dropGo.cueListId` valent `null` s’ils visaient cette liste.
- [ ] Un projet chargé avec une référence orpheline est réparé et un avertissement est journalisé.

**Tests requis.**

- Unitaires sur `handleProgramming` (actuellement couvert à 28,9 % des lignes) et sur `validateReferences`.

**Dépendances.** Indépendant.

**Effort estimé.** XS

**Impact attendu.** moyen — fiabilité des déclenchements audio

**Risques et précautions.** Aucun.

#### LUMA-016

- **ID** : LUMA-016
- **Titre** : Rendre annulable l’application des positions issues de la localisation caméra
- **Catégorie** : Historique de scène
- **Nature** : A — Correction et rupture fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : correction de bug
- **Phase** : 1

**Constat technique.** L’historique de scène couvre les champs `position`, `height`, `rotation`, `mount`, `mountTilt` et `trussId` : `fixture.update` et `fixture.place` passent par `sceneMutate`. `locate.apply`, qui réécrit justement `position` et `height` de jusqu’à 2 048 projecteurs, utilise `mutate`. Cette modification massive n’est donc pas annulable.

**Preuves dans le code.**

- `src/core/app/shared.ts:7` : `SCENE_FIELDS = ["position", "height", …]`.
- `src/core/app/handlers/fixtures.ts:158` et `:180-181` : `sceneMutate` pour les champs de scène.
- `src/core/app/handlers/locate.ts:34-46` : `app.mutate(...)` pour `locate.apply`.

**Problème ou opportunité.** Une localisation ratée (mauvais calibrage) écrase l’implantation soignée de tout le kit, sans retour possible autre qu’une ancienne sauvegarde.

**Résultat attendu.** `locate.apply` crée une seule étape d’historique de scène, et `scene.undo` restaure toutes les positions précédentes.

**Travaux à effectuer.**

1. Remplacer `app.mutate` par `app.sceneMutate` dans `locate.apply`.
2. Afficher dans l’interface de résultat « Annulable avec Ctrl+Z ».

**Critères d’acceptation.**

- [ ] `locate.apply`, puis `scene.undo` : positions identiques à celles d’avant l’application.
- [ ] `sceneHistory.undo` est incrémenté de 1.

**Tests requis.**

- Unitaire dans `tests/unit/locate-service.test.ts`.

**Dépendances.** Indépendant.

**Effort estimé.** XS

**Impact attendu.** moyen — protège l’implantation

**Risques et précautions.** Aucun.

#### LUMA-017

- **ID** : LUMA-017
- **Titre** : Éviter l’écrasement de paramètres modifiés ailleurs lors de `settings.update`
- **Catégorie** : Paramètres / concurrence
- **Nature** : A — Correction et rupture fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : correction de bug
- **Phase** : 1

**Constat technique.** `settings.update` remplace tout l’objet `app.settings` par la copie envoyée par la page Paramètres, en ne préservant que `sacn`. Pendant que cette page est ouverte, le processus principal peut modifier lui-même `general.recentProjects` (ouverture ou enregistrement, `addRecent`) et `onboarding` (`onboarding.update`). L’enregistrement de la page restaure alors les anciennes valeurs. `output.configure` écrit aussi `settings.outputs` par un autre chemin.

**Preuves dans le code.**

- `src/core/app/handlers/system.ts:24-27` : `app.settings = { ...cmd.settings, sacn: app.settings.sacn }`.
- `src/renderer/features/Settings.tsx:307` : envoi de la copie locale `s` entière.
- `src/core/app/files.ts:9-12` : `addRecent` modifie les paramètres en arrière-plan.
- `src/core/app/handlers/output.ts:31-34` : `output.configure` écrit `settings.outputs`.

**Problème ou opportunité.** Les projets récents et l’état de l’onboarding modifiés pendant que la page Paramètres est ouverte disparaissent au prochain enregistrement. Si une page future édite les sorties en parallèle, la configuration des sorties sera écrasée, ce qui fermera des sorties armées.

**Résultat attendu.** `settings.update` n’applique que les sections modifiées (patch partiel) et refuse un enregistrement basé sur une révision périmée, ou fusionne les champs gérés par le processus principal.

**Travaux à effectuer.**

1. Ajouter une révision `settingsRevision` renvoyée par `settings.get` et exigée par `settings.update` (conflit, donc `UserError` et rechargement).
2. Exclure du remplacement les champs gérés par le processus principal (`general.recentProjects`, `onboarding`, `control.remote.token` s’il est absent).
3. Dans la page Paramètres, recharger après un conflit.

**Critères d’acceptation.**

- [ ] Scénario : page Paramètres ouverte, `project.open` d’un fichier, puis enregistrement : le fichier apparaît dans les projets récents.
- [ ] Un enregistrement avec une révision périmée est refusé avec un message explicite.

**Tests requis.**

- Unitaire `handleSystem` : conflit de révision et préservation de `recentProjects`.

**Dépendances.** Indépendant. — Débloque : [LUMA-077](#luma-077).

**Effort estimé.** S

**Impact attendu.** moyen — intégrité de la configuration

**Risques et précautions.** Compatibilité : le rendu doit envoyer la révision, sinon le contrôle est désactivé pendant une version.

#### LUMA-018

- **ID** : LUMA-018
- **Titre** : Sérialiser les écritures atomiques concurrentes sur un même fichier
- **Catégorie** : Persistance
- **Nature** : A — Correction et rupture fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : fiabilité
- **Phase** : 1

**Constat technique.** `writeFileAtomic` écrit toujours dans le même fichier temporaire `<file>.tmp`, puis le renomme. Deux appels concurrents sur la même cible partagent ce fichier : la seconde écriture peut tronquer le temporaire pendant que la première le renomme, ou provoquer un `ENOENT` au second renommage. `persistSettings` est appelé en mode « fire-and-forget » par `addRecent`, et peut chevaucher un autre `persistSettings` (`onboarding.update`, `settings.update`, `output.configure`).

**Preuves dans le code.**

- `src/core/project/store.ts:10-22` : le temporaire vaut toujours `${file}.tmp`, puis `writeFile`, puis `rename`.
- `src/core/app/files.ts:11` : `void app.persistSettings().catch(…)`.
- `src/core/app/AppService.ts:218-220` : `persistSettings` sans verrou.
- `src/core/app/AppService.ts:169-178` : un `settings.json` illisible fait repartir des valeurs par défaut, qui sont réécrites ligne 181.

**Problème ou opportunité.** Dans le pire cas, `settings.json` est tronqué. Au démarrage suivant, la configuration des sorties, des contrôles et le jeton de télécommande sont remplacés par les valeurs par défaut, et le fichier abîmé est écrasé.

**Résultat attendu.** Les écritures sur un même chemin sont mises en file (une à la fois), et chaque écriture utilise un temporaire unique. Un `settings.json` invalide est conservé en `.invalid`, y compris en cas d’erreur JSON.

**Travaux à effectuer.**

1. Ajouter une file par chemin (`Map<string, Promise>`) dans `writeFileAtomic`.
2. Nommer le temporaire `<file>.<pid>.<random>.tmp`.
3. Dans `AppService.init`, copier aussi en `.invalid` quand `JSON.parse` échoue (lignes 176-178).

**Critères d’acceptation.**

- [ ] Cent appels concurrents à `persistSettings` laissent un `settings.json` valide et égal au dernier état.
- [ ] Un `settings.json` tronqué est sauvegardé en `.invalid` avant d’être remplacé.

**Tests requis.**

- Unitaire de concurrence sur `writeFileAtomic` (`Promise.all` de 100 écritures).
- Unitaire `init` avec un JSON tronqué.

**Dépendances.** Indépendant. — Débloque : [LUMA-033](#luma-033), [LUMA-043](#luma-043), [LUMA-077](#luma-077).

**Effort estimé.** S

**Impact attendu.** moyen — prévient une perte de configuration

**Risques et précautions.** Garder le comportement `.bak` existant pour les projets.

#### LUMA-019

- **ID** : LUMA-019
- **Titre** : Signaler un échec d’enregistrement déclenché par la fermeture de la fenêtre
- **Catégorie** : Cycle de vie de l’application
- **Nature** : A — Correction et rupture fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : correction de bug
- **Phase** : 1

**Constat technique.** À la fermeture avec des modifications non enregistrées, le choix « Enregistrer » appelle `service.execute({ type: "project.save" }).then(...)` sans `catch`. Si l’enregistrement échoue (disque plein, fichier verrouillé, droits), la promesse rejetée devient un `unhandledRejection` journalisé. La fenêtre reste ouverte sans message expliquant pourquoi.

**Preuves dans le code.**

- `src/main/index.ts:159-166` : `void service.execute(...).then((r) => { if (r.path) { … w.close(); } })`.
- `src/main/index.ts:222` : `unhandledRejection` seulement journalisé.

**Problème ou opportunité.** L’utilisateur croit avoir enregistré, ou ne comprend pas pourquoi l’application refuse de se fermer.

**Résultat attendu.** Un échec d’enregistrement à la fermeture affiche une boîte d’erreur native avec la cause et propose « Réessayer », « Enregistrer sous… » ou « Quitter sans enregistrer ».

**Travaux à effectuer.**

1. Ajouter un `catch` qui affiche `dialog.showMessageBox` avec ces options.
2. Factoriser le flux de fermeture dans une fonction testable injectée (dialogues simulés).

**Critères d’acceptation.**

- [ ] Avec un chemin de projet en lecture seule, la fermeture puis « Enregistrer » affiche l’erreur et ne laisse aucune promesse rejetée non gérée.

**Tests requis.**

- Unitaire du flux de fermeture extrait, avec un `AppService` simulé dont `project.save` est rejeté.

**Dépendances.** Indépendant.

**Effort estimé.** S

**Impact attendu.** moyen — évite une fausse impression de sauvegarde

**Risques et précautions.** Aucun.

#### LUMA-020

- **ID** : LUMA-020
- **Titre** : Permettre de supprimer un profil de la bibliothèque utilisateur depuis l’interface
- **Catégorie** : Profils de projecteurs
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : PRÉSENT MAIS NON RACCORDÉ
- **Priorité** : P2
- **Type** : fonctionnalité
- **Phase** : 1

**Constat technique.** La commande `profile.remove` est implémentée : elle refuse un profil utilisé, le retire de `profiles.json` et des profils intégrés au projet, et elle est testée. Aucun composant du rendu ne l’appelle. Les profils importés (GDTF, grandMA2, OFL, Luma) s’accumulent donc sans moyen de les retirer.

**Preuves dans le code.**

- `src/core/app/handlers/fixtures.ts:117-123` : implémentation de `profile.remove`.
- `tests/unit/profile-library.test.ts:26-28` : test de refus puis de suppression.
- Recherche dans `src/renderer` : aucune occurrence de `profile.remove`.

**Problème ou opportunité.** La bibliothèque grossit avec les imports d’essai et les doublons, et la liste de sélection du patch devient difficile à parcourir.

**Résultat attendu.** La page Fixtures liste les profils de la bibliothèque avec un bouton Supprimer (désactivé et expliqué quand le profil est utilisé), avec confirmation.

**Travaux à effectuer.**

1. Ajouter une section « Bibliothèque » dans `Fixtures.tsx` avec les compteurs d’utilisation.
2. Appeler `profile.remove`, puis afficher un toast.
3. Ajouter les clés i18n FR et EN.

**Critères d’acceptation.**

- [ ] Un profil inutilisé disparaît de la bibliothèque et du projet.
- [ ] Un profil utilisé ne peut pas être supprimé, et l’interface indique par combien de projecteurs il est utilisé.

**Tests requis.**

- Test de composant pour la liste et le bouton désactivé.
- E2E import puis suppression.

**Dépendances.** Indépendant.

**Effort estimé.** S

**Impact attendu.** faible — hygiène de la bibliothèque

**Risques et précautions.** Aucun : la garde existe déjà côté processus principal.

#### LUMA-021

- **ID** : LUMA-021
- **Titre** : Reconstituer l’état des listes de cues après un saut de timeline (seek ou poursuite de timecode)
- **Catégorie** : Timeline / timecode
- **Nature** : A — Correction et rupture fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : correction de bug
- **Phase** : 1

**Constat technique.** Les événements `cue` d’une timeline ne sont déclenchés qu’au franchissement de leur instant entre deux ticks (`fire(prev, next)`). `seek` déplace seulement la tête de lecture. La poursuite de timecode (`timelineChase`) fait un `seek` dès que l’écart dépasse 80 ms. Après un saut en arrière ou en avant, les listes de cues pilotées par la timeline restent sur le dernier cue déclenché, et non sur celui qui correspond à la nouvelle position.

**Preuves dans le code.**

- `src/core/engine/timeline.ts:40-42` : `seek(seconds)` ne fait que `this.timeMs = …`.
- `src/core/engine/timeline.ts:53-70` : `fire(a, b)` ne déclenche que les cues dont l’instant est dans [a, b).
- `src/core/engine/Engine.ts:321-326` : `timelineChase` appelle `timeline.seek` quand l’écart dépasse 0,08 s.
- Les scènes et effets de timeline sont, eux, évalués en fonction pure de la tête de lecture (`timeline.ts`, `evaluate`), d’où une incohérence entre les couches.

**Problème ou opportunité.** En répétition, quand on revient au refrain dans le lecteur musical (le timecode suit), les scènes de timeline sont justes mais les cues déclenchés par la timeline ne le sont pas. Le rendu sur scène diffère donc de la première lecture.

**Résultat attendu.** Après un `seek` ou un recalage de timecode, chaque liste de cues visée par des événements de la timeline est positionnée (`cueGoto`, sans fondu) sur le dernier cue dont l’instant précède la nouvelle position.

**Travaux à effectuer.**

1. Ajouter à `TimelineTransport` une méthode `resolveCueState(tl, t)` qui renvoie, par liste, le dernier événement `cue` avant `t`.
2. Dans `Engine.timelineSeek` et `timelineChase`, appliquer cet état via `cueGoto`, avec une option « fondu nul » à ajouter à `CueListPlayback.goto`.
3. Avant la première occurrence d’une liste, la remettre à zéro (`cueStop`).

**Critères d’acceptation.**

- [ ] Timeline avec des cues à 10 s et 20 s : après un seek à 15 s, la liste est sur le premier cue ; après un seek à 5 s, elle est à l’arrêt.
- [ ] Un timecode qui saute de 30 s à 12 s replace les listes de façon cohérente.

**Tests requis.**

- Unitaires dans `tests/unit/engine.test.ts` sur `timelineSeek` et `timelineChase`.

**Dépendances.** Indépendant. — Débloque : [LUMA-052](#luma-052), [LUMA-079](#luma-079).

**Effort estimé.** M

**Impact attendu.** moyen — cohérence des répétitions et du timecode

**Risques et précautions.** Éviter de redéclencher les effets d’un cue à chaque recalage de timecode (seuil de 80 ms déjà présent).

#### LUMA-022

- **ID** : LUMA-022
- **Titre** : Ne plus accumuler dans le projet les définitions d’effets créées par chaque proposition IA
- **Catégorie** : IA Director / données du projet
- **Nature** : A — Correction et rupture fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : dette technique
- **Phase** : 1

**Constat technique.** Chaque action `startEffect` appliquée crée une nouvelle définition `Effect` (`origin: "ai"`), poussée dans `project.effects`, puis démarrée. `ai.release` et l’action `releaseAi` arrêtent les instances, mais ne retirent jamais ces définitions. Une session de travail avec l’IA laisse donc des dizaines d’effets « IA » persistés et enregistrés dans le fichier.

**Preuves dans le code.**

- `src/core/ai/director.ts:471-479` : `effectFromSpec` puis `ctx.mutate((d) => { d.effects.push(def); })`, puis `engine.startEffect(def.id, "ai")`.
- `src/core/ai/director.ts:401` : `origin: "ai"`.
- `src/core/app/handlers/ai.ts:34-37` : `ai.release` arrête les instances `owner === "ai"` sans toucher au projet.

**Problème ou opportunité.** La liste des effets de la page Effects est polluée, le fichier de projet grossit, et l’IA (`liveState`) peut confondre des effets homonymes.

**Résultat attendu.** Les effets IA « éphémères » (démarrés en direct et non enregistrés par l’utilisateur) sont retirés du projet quand leur instance s’arrête, ou au relâchement de l’IA. L’utilisateur peut « conserver » un effet IA, ce qui le rend permanent (`origin: "user"`).

**Travaux à effectuer.**

1. Ajouter un drapeau `transient` aux effets créés par `startEffect` IA (schéma Zod avec valeur par défaut `false`, migration additive).
2. Dans `ai.release` et `releaseAi`, supprimer les effets `transient` qui ne sont plus en cours.
3. Ajouter le bouton « Conserver » dans la page Effects pour les effets IA en cours.

**Critères d’acceptation.**

- [ ] Proposer et appliquer 5 fois un effet IA, puis `ai.release` : `project.effects` ne contient plus d’effet `transient`.
- [ ] Un effet IA conservé survit à `ai.release`.

**Tests requis.**

- Unitaires dans `tests/unit/ai.test.ts` : cycle proposer, appliquer, relâcher.

**Dépendances.** Indépendant.

**Effort estimé.** S

**Impact attendu.** moyen — hygiène du projet

**Risques et précautions.** Les effets référencés par un cue ou une timeline ne doivent jamais être supprimés automatiquement.

#### LUMA-023

- **ID** : LUMA-023
- **Titre** : Rendre l’application d’une proposition IA atomique et annulable en une étape
- **Catégorie** : IA Director
- **Nature** : A — Correction et rupture fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : fiabilité
- **Phase** : 1

**Constat technique.** `executeProposal` exécute les actions une par une, et chaque action qui crée un objet appelle `ctx.mutate` séparément. Une erreur au milieu (refus de validation du projet) est consignée comme « ignorée » mais laisse les objets déjà créés. Aucune annulation n’est proposée : l’historique d’annulation ne couvre que l’implantation de scène.

**Preuves dans le code.**

- `src/core/ai/director.ts:429-587` : boucle `for (const v of proposal.actions)`, avec un `try` par action et un `ctx.mutate` par action créatrice.
- `src/core/app/handlers/ai.ts:23-33` : `executeProposal`, puis rapport, sans instantané préalable.
- `src/core/app/AppService.ts:262-270` : `mutate` valide et remplace le projet à chaque appel.

**Problème ou opportunité.** Une proposition partiellement appliquée laisse le projet dans un état intermédiaire difficile à nettoyer à la main (scènes, listes de cues, effets créés). Sans annulation, l’utilisateur hésite à appliquer les propositions de l’IA.

**Résultat attendu.** L’application d’une proposition produit une seule mutation du projet (tout ou rien pour la partie persistante), et la commande `ai.undoApply` restaure le projet et relâche la couche IA de cette proposition.

**Travaux à effectuer.**

1. Accumuler les modifications persistantes dans un brouillon unique, puis faire un seul `mutate` en fin d’exécution.
2. Conserver un instantané du projet (ou un patch inverse) associé à `proposalId`, pour une seule annulation.
3. Ajouter la commande `ai.undoApply` et le bouton dans l’IA Director.

**Critères d’acceptation.**

- [ ] Une proposition dont la troisième action provoque un refus de validation ne crée aucun objet persistant.
- [ ] `ai.undoApply` remet `project` à l’identique de l’état précédent (comparaison profonde hors `modifiedAt`).

**Tests requis.**

- Unitaires dans `tests/unit/ai.test.ts` avec une action provoquant volontairement un refus de schéma.

**Dépendances.** Indépendant.

**Effort estimé.** M

**Impact attendu.** moyen — confiance dans l’IA

**Risques et précautions.** Si l’annulation globale (LUMA-053) est livrée, réutiliser son mécanisme au lieu d’en créer un second.

#### LUMA-024

- **ID** : LUMA-024
- **Titre** : Vérifier et corriger le plein écran F11 de la fenêtre 3D détachée face au filtre de permissions
- **Catégorie** : Fenêtre détachée / sécurité Electron
- **Nature** : A — Correction et rupture fonctionnelle
- **Statut actuel** : À INVESTIGUER
- **Priorité** : P2
- **Type** : correction de bug
- **Phase** : 1

**Constat technique.** La fenêtre détachée gère F11 via `document.documentElement.requestFullscreen()`. Le processus principal installe des gestionnaires de permissions qui n’autorisent que `media`, `midi` et `midiSysex`. Dans Electron, la demande de plein écran HTML passe par le type de permission `fullscreen` : elle est probablement refusée. Aucun test ne couvre F11.

**Preuves dans le code.**

- `src/renderer/features/Visualizer.tsx:25-29` : gestion de F11 et `requestFullscreen()`.
- `src/main/index.ts:231-233` : `allowed = new Set(["media", "midi", "midiSysex"])` pour les gestionnaires de requête et de vérification.
- Recherche dans `tests/e2e/app.spec.ts` : aucune occurrence de `F11` ni de `fullscreen`.

**Problème ou opportunité.** Sur le second écran (projection de la 3D pour le client ou le metteur en scène), le plein écran annoncé peut ne pas fonctionner, ou ne fonctionner que par accident.

**Résultat attendu.** F11 bascule la fenêtre détachée en plein écran de façon fiable, sans élargir les permissions de la fenêtre principale. On peut par exemple utiliser `BrowserWindow.setFullScreen` via une commande dédiée, ou autoriser `fullscreen` seulement pour la fenêtre détachée.

**Travaux à effectuer.**

1. Reproduire le comportement dans une build empaquetée.
2. Si la demande est refusée, ajouter `fullscreen` à la liste autorisée, filtrée par `webContents` de la fenêtre détachée, ou passer par une commande `window.toggleFullscreen` côté processus principal.

**Critères d’acceptation.**

- [ ] F11 dans la fenêtre détachée passe `isFullScreen()` à vrai, puis à faux au second appui.

**Tests requis.**

- E2E Playwright : `detached.keyboard.press("F11")`, puis `app.evaluate` sur `BrowserWindow.isFullScreen()`.

**Dépendances.** Indépendant.

**Effort estimé.** XS

**Impact attendu.** faible — confort du second écran

**Risques et précautions.** Ne pas autoriser d’autre permission par effet de bord.

#### LUMA-025

- **ID** : LUMA-025
- **Titre** : Supprimer une timeline n’arrête que la lecture de cette timeline
- **Catégorie** : Timeline
- **Nature** : A — Correction et rupture fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : correction de bug
- **Phase** : 1

**Constat technique.** `timeline.remove` appelle `e.timelineStop()` sans vérifier quelle timeline est en lecture. Supprimer une timeline inactive arrête donc la timeline en cours, par exemple celle d’un morceau en lecture.

**Preuves dans le code.**

- `src/core/app/handlers/programming.ts:172-174` : `e.timelineStop()`, puis `mutate` de suppression.
- `src/core/app/handlers/music.ts:198` : à l’inverse, `applyShow` ne stoppe la timeline que si elle correspond au morceau (`timelineId === t.created.timelineId`).

**Problème ou opportunité.** Faire le ménage dans les timelines pendant une lecture coupe le show de façon inattendue.

**Résultat attendu.** Seule la suppression de la timeline en cours de lecture arrête le transport.

**Travaux à effectuer.**

1. Comparer `e.snapshot().timeline.timelineId` à `cmd.id` avant d’appeler `timelineStop()`.

**Critères d’acceptation.**

- [ ] Supprimer une timeline B pendant la lecture de A laisse A en lecture.

**Tests requis.**

- Unitaire `handleProgramming`.

**Dépendances.** Indépendant.

**Effort estimé.** XS

**Impact attendu.** faible — évite une coupure inattendue

**Risques et précautions.** Aucun.

#### LUMA-026

- **ID** : LUMA-026
- **Titre** : Retirer du moteur les playbacks de listes de cues supprimées
- **Catégorie** : Moteur temps réel
- **Nature** : A — Correction et rupture fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : dette technique
- **Phase** : 1

**Constat technique.** `Engine.setIndex` purge le programmeur et les instances d’effets orphelins, mais pas `this.playbacks`. Une liste supprimée (par `project.open`, par import ou par une suppression directe ailleurs que dans `cueList.remove`) laisse une entrée dans la map. `snapshot()` expose ces playbacks avec `cueId: null`, et `tick` appelle `stop()` à chaque passage.

**Preuves dans le code.**

- `src/core/engine/Engine.ts:166-170` : `setIndex` sans nettoyage des playbacks.
- `src/core/engine/Engine.ts:527` : `playbacks: [...this.playbacks.values()].map(...)`.
- `src/core/engine/playback.ts:126-129` : `tick(…, list undefined)` appelle `stop()`.

**Problème ou opportunité.** Les instantanés `runtime` (émis 10 fois par seconde) grossissent avec des playbacks fantômes, et la télécommande ou l’interface peuvent afficher des états périmés.

**Résultat attendu.** `setIndex` supprime les playbacks dont la liste n’existe plus.

**Travaux à effectuer.**

1. Dans `setIndex`, appeler `stop()` puis `delete` sur chaque playback dont la liste est absente de `index.cueLists`.

**Critères d’acceptation.**

- [ ] Après l’ouverture d’un autre projet, `snapshot().playbacks` ne contient que des listes du nouveau projet.

**Tests requis.**

- Unitaire dans `tests/unit/engine.test.ts`.

**Dépendances.** Indépendant.

**Effort estimé.** XS

**Impact attendu.** faible

**Risques et précautions.** Aucun.

#### LUMA-027

- **ID** : LUMA-027
- **Titre** : Revalider une proposition IA contre l’état courant du projet au moment de l’appliquer
- **Catégorie** : IA Director
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : fiabilité
- **Phase** : 1

**Constat technique.** Une proposition est validée au moment de `ai.propose`, puis conservée (au plus 20) et appliquée plus tard par `ai.apply` sans nouvelle validation. Les `fixtureIds` résolus à la création sont réutilisés (`immediateValues` les filtre par `allowed`). Si le patch a changé entre-temps (projecteurs supprimés ou readressés, groupes renommés), l’aperçu montré à l’utilisateur ne correspond plus à ce qui est appliqué.

**Preuves dans le code.**

- `src/core/app/handlers/ai.ts:23-33` : `executeProposal(p, …)` sur la proposition stockée.
- `src/core/app/handlers/ai.ts:69-72` : stockage FIFO de 20 propositions sans date d’expiration.
- `src/core/ai/director.ts:264-295` (`immediateValues`) : filtrage par les `fixtureIds` capturés.

**Problème ou opportunité.** L’opérateur valide un aperçu qui n’est plus exact. Le contrat « l’IA ne fait que ce qui a été montré » est affaibli.

**Résultat attendu.** À l’application, si `project.revision` a changé depuis la proposition, les actions sont revalidées (`validateActions`). Si le résultat diffère, l’application est refusée avec « proposition périmée, régénérez l’aperçu » (ou l’aperçu est régénéré).

**Travaux à effectuer.**

1. Mémoriser `revision` dans `AiProposal`.
2. Dans `ai.apply`, comparer et revalider via `buildProposal`, puis signaler les différences.

**Critères d’acceptation.**

- [ ] Supprimer un projecteur ciblé entre la proposition et l’application produit un refus explicite ou un nouvel aperçu.

**Tests requis.**

- Unitaire dans `tests/unit/ai.test.ts`.

**Dépendances.** Indépendant.

**Effort estimé.** S

**Impact attendu.** faible — exactitude de l’aperçu

**Risques et précautions.** Ne pas invalider les propositions pour des changements sans rapport (notes du projet) : comparer le patch et les groupes, pas toute la révision.

#### LUMA-028

- **ID** : LUMA-028
- **Titre** : Ne pas marquer le projet comme modifié pour une simple requête IA non appliquée
- **Catégorie** : IA Director / état du document
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : amélioration
- **Phase** : 1

**Constat technique.** `aiPropose` termine par `app.mutate(...)` pour mémoriser le prompt dans `d.ai.recentPrompts`. `mutate` incrémente `revision`, et le projet devient « modifié » (`dirty`). Une simple question à l’IA déclenche donc la boîte « modifications non enregistrées » à la fermeture et une autosauvegarde.

**Preuves dans le code.**

- `src/core/app/handlers/ai.ts:103` : `app.mutate((d) => { d.ai.recentPrompts = … })`.
- `src/core/app/AppService.ts:209-211` : `dirty` est vrai dès que `revision !== savedRevision`.
- `src/main/index.ts:148-158` : dialogue de fermeture quand `service.dirty`.

**Problème ou opportunité.** C’est une fausse alerte de perte de données, qui habitue l’utilisateur à ignorer le dialogue de fermeture.

**Résultat attendu.** Mémoriser l’historique des prompts ne rend pas le projet « modifié », tout en restant enregistré à la prochaine sauvegarde. Autre option : stocker l’historique dans les paramètres, hors du projet.

**Travaux à effectuer.**

1. Ajouter une variante `mutate(fn, { silent: true })` qui ne change pas `dirty`, ou déplacer `recentPrompts` dans les paramètres (`settings.ai`).

**Critères d’acceptation.**

- [ ] `ai.propose` sur un projet propre laisse `dirty === false`.

**Tests requis.**

- Unitaire `AppService`.

**Dépendances.** Indépendant.

**Effort estimé.** XS

**Impact attendu.** faible

**Risques et précautions.** L’option « déplacer » nécessite une migration du format v3 vers v4 si le champ est retiré du schéma projet.

#### LUMA-029

- **ID** : LUMA-029
- **Titre** : Retirer de la boîte d’import le filtre QLC+ annoncé mais refusé
- **Catégorie** : Profils de projecteurs / UX
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : ABSENT
- **Priorité** : P3
- **Type** : amélioration
- **Phase** : 1

**Constat technique.** La boîte de dialogue d’import propose un filtre « QLC+ (bientôt) » (`.qxf`), et le handler refuse ensuite explicitement ce format. L’utilisateur peut donc choisir un fichier pour se voir répondre que le format n’est pas pris en charge.

**Preuves dans le code.**

- `src/main/index.ts:74` et `:78` : `extensions: ["json", "gdtf", "xml", "qxf"]` et `{ name: "QLC+ (bientôt)", extensions: ["qxf"] }`.
- `src/core/app/handlers/fixtures.ts:24` : `if (ext === ".qxf") throw new UserError(…pas encore pris en charge…)`.

**Problème ou opportunité.** L’interface promet une fonctionnalité absente.

**Résultat attendu.** Le filtre `.qxf` disparaît tant que l’import QLC+ (LUMA-083) n’est pas livré.

**Travaux à effectuer.**

1. Retirer `qxf` des filtres de `openProfile` et garder le message du handler pour un appel direct.

**Critères d’acceptation.**

- [ ] La boîte d’import ne propose plus `.qxf`.

**Tests requis.**

- Aucun test automatisé pertinent hors E2E de dialogue (simulé) : vérification manuelle.

**Dépendances.** Indépendant. — Débloque : [LUMA-083](#luma-083).

**Effort estimé.** XS

**Impact attendu.** faible

**Risques et précautions.** Aucun.

#### LUMA-030

- **ID** : LUMA-030
- **Titre** : Nettoyer les fichiers audio, le cache IA et les copies de récupération orphelins
- **Catégorie** : Gestion des fichiers locaux
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : ABSENT
- **Priorité** : P3
- **Type** : dette technique
- **Phase** : 1

**Constat technique.** Les fichiers audio importés sont copiés dans `<userData>/music/<sha256>`, jusqu’à 500 Mo chacun. `music.removeTrack` ne les supprime pas. Le cache de réponses IA (`ai-cache/`) n’a aucune éviction, comme l’indique un commentaire `shortcut:`. Les copies de récupération `autosave/<projectId>.luma.json` des projets abandonnés sans enregistrement restent indéfiniment.

**Preuves dans le code.**

- `src/core/app/handlers/music.ts:28-34` : `writeFile(audioFile(app, cmd.hash), cmd.data)`.
- `src/core/app/handlers/music.ts:37-44` : `removeTrack` sans suppression du fichier audio.
- `src/core/ai/responseCache.ts:11` : « shortcut: no eviction ».
- `src/core/app/files.ts:14-15` et `:30-32` : autosauvegarde par identifiant de projet, supprimée seulement à l’enregistrement.

**Problème ou opportunité.** L’occupation disque croît sans limite ni visibilité : plusieurs Go après quelques mois d’import de morceaux.

**Résultat attendu.** Un onglet Paramètres › Stockage affiche la taille de chaque dossier et permet de purger les éléments non référencés. Le cache IA est borné (taille ou âge), et les copies de récupération de plus de 30 jours sont proposées à la suppression.

**Travaux à effectuer.**

1. Ajouter la commande `storage.report` (tailles et éléments orphelins) et la commande `storage.purge` (avec confirmation).
2. Ajouter une éviction LRU au `ResponseCache` (par exemple 50 Mo).
3. Ne jamais supprimer automatiquement un fichier audio sans action de l’utilisateur : il peut être utilisé par un autre projet.

**Critères d’acceptation.**

- [ ] La taille du cache IA ne dépasse pas la borne configurée.
- [ ] La purge ne supprime aucun fichier audio référencé par le projet ouvert ni par les projets récents.

**Tests requis.**

- Unitaires sur `ResponseCache` (éviction) et sur le calcul des orphelins dans un dossier temporaire.

**Dépendances.** Indépendant.

**Effort estimé.** M

**Impact attendu.** faible — maîtrise de l’espace disque

**Risques et précautions.** Un fichier audio peut servir à un projet absent des récents : la purge doit rester manuelle et explicite.

### Fiches de la phase 2 — Fiabilisation et couverture de tests

#### LUMA-031

- **ID** : LUMA-031
- **Titre** : Couvrir par des tests le handler de programmation (groupes, palettes, scènes, cues, effets, timelines)
- **Catégorie** : Tests
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : IMPLÉMENTÉ, VALIDATION INSUFFISANTE
- **Priorité** : P1
- **Type** : tests
- **Phase** : 2

**Constat technique.** Couverture mesurée lors de l’audit (V8, `src/core`) : `src/core/app/handlers/programming.ts` est couvert à 28,9 % des lignes, 20,5 % des branches et 16,7 % des fonctions. C’est le handler qui contient le plus de règles d’intégrité (nettoyage des références à la suppression, validation des références de cues et timelines). Le défaut LUMA-015 se trouve précisément dans ce code non testé.

**Preuves dans le code.**

- Rapport `vitest --coverage` exécuté lors de l’audit : `programming.ts L 28.9 B 20.52 F 16.66`.
- `src/core/app/handlers/programming.ts:15-188` : quarante cas de commandes.

**Problème ou opportunité.** Les régressions sur la suppression et l’édition des objets de programmation passent inaperçues, alors qu’elles abîment le contenu du show.

**Résultat attendu.** Chaque commande du domaine a au moins un test nominal et un test d’erreur. Le fichier dépasse 85 % des lignes et 75 % des branches.

**Travaux à effectuer.**

1. Créer `tests/unit/programming.test.ts` avec `AppService` sans démarrage automatique (`autoStart: false`, `logDir: false`).
2. Couvrir l’intégrité référentielle : `scene.remove`, `cueList.remove`, `effect.remove`, `group.remove` et `fixture.remove`.
3. Couvrir les refus : cue vers une scène inconnue, timeline vers une référence inconnue, palette vide.

**Critères d’acceptation.**

- [ ] Couverture de `programming.ts` d’au moins 85 % des lignes.
- [ ] Chaque cas `case` est exécuté au moins une fois.

**Tests requis.**

- Unitaires (cet élément est lui-même un livrable de tests).

**Dépendances.** [LUMA-009](#luma-009) — Débloque : [LUMA-053](#luma-053), [LUMA-068](#luma-068).

**Effort estimé.** M

**Impact attendu.** élevé — protège le contenu des shows

**Risques et précautions.** Aucun.

#### LUMA-032

- **ID** : LUMA-032
- **Titre** : Tester le processus principal : garde IPC, magasin de secrets et flux de fermeture
- **Catégorie** : Tests / sécurité
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : ABSENT
- **Priorité** : P1
- **Type** : tests
- **Phase** : 2

**Constat technique.** La couverture est limitée à `src/core/**`. Les trois fichiers du processus principal (`index.ts`, `secrets.ts`, `updates.ts`), qui portent la frontière de confiance (vérification de l’origine IPC, validation Zod, gestion des erreurs `UserError`) et le chiffrement de la clé API, n’ont aucun test unitaire. Seul l’E2E vérifie l’absence de Node dans le rendu.

**Preuves dans le code.**

- `vitest.config.ts:15` : `include: ["src/core/**"]`.
- `src/main/index.ts:31-34` (`isTrustedSender`) et `:237-248` (gestionnaire `luma:cmd`).
- `src/main/secrets.ts:10-39` : chiffrement et refus en clair.
- `tests/e2e/app.spec.ts:41` : seul test de sécurité Electron.

**Problème ou opportunité.** Une modification de la garde d’origine ou du traitement des erreurs (exposition de messages internes) ne serait détectée par aucun test rapide.

**Résultat attendu.** La logique du processus principal est extraite en fonctions pures testables (garde d’origine, enveloppe d’exécution des commandes, secrets avec `safeStorage` injecté), testées en unitaire.

**Travaux à effectuer.**

1. Extraire `isTrustedSender` et le corps du gestionnaire IPC dans `src/main/ipc.ts`, sans dépendance directe à `electron`.
2. Injecter `safeStorage` dans `createSecretStore`.
3. Ajouter les tests : origine refusée, commande invalide (message tronqué à 3 erreurs), `UserError` non journalisée, erreur interne journalisée, refus en clair.

**Critères d’acceptation.**

- [ ] Les cas ci-dessus sont couverts.
- [ ] `src/main/**` est inclus dans la couverture avec un seuil.

**Tests requis.**

- Unitaires (livrable).

**Dépendances.** Indépendant. — Débloque : [LUMA-050](#luma-050).

**Effort estimé.** M

**Impact attendu.** élevé — protège la frontière de confiance

**Risques et précautions.** Le refactoring ne doit pas modifier le comportement : comparer avec l’E2E de sécurité existant.

#### LUMA-038

- **ID** : LUMA-038
- **Titre** : Mener la campagne de validation matérielle (Enttec Pro, Open DMX, RDM Art-Net, nœuds Art-Net et sACN)
- **Catégorie** : Validation matérielle
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : IMPLÉMENTÉ, VALIDATION INSUFFISANTE
- **Priorité** : P1
- **Type** : tests
- **Phase** : 2

**Constat technique.** Le code déclare lui-même que les implémentations Enttec Pro, Open DMX et RDM n’ont pas été vérifiées sur du matériel réel. L’outillage de campagne existe : mire `signature`, rapport `hardware.report` avec critères (8 h, reconnexion en moins de 10 s, zéro erreur), et l’E2E « campagne matériel » en simulation. Aucun résultat de campagne réelle n’est enregistré dans un artefact non Markdown du dépôt.

**Preuves dans le code.**

- `src/core/protocols/enttec.ts:6` : « NOT verified against physical hardware ».
- `src/core/protocols/opendmx.ts:9` : « Not verified on hardware ».
- `src/core/protocols/rdm.ts:7` : « not verified on real hardware ».
- `src/core/app/hardware.ts:14` (`RECONNECT_MAX_S = 10`) et `:69` (session d’au moins 8 h).
- `tests/e2e/app.spec.ts:194` : campagne en simulation uniquement.

**Problème ou opportunité.** Un logiciel de console d’éclairage utilisé en direct sur des interfaces non validées expose l’utilisateur à des pannes au pire moment : timing de BREAK Open DMX, cadrage Enttec, RDM.

**Résultat attendu.** Pour chaque interface prise en charge, un rapport de session (sortie de `hardware.report`) est archivé dans `tests/hardware/` en JSON ou CSV, avec le modèle, le firmware, la durée, les reconnexions et la vérification au testeur DMX. Le statut de chaque interface est affiché dans l’interface (« validée » ou « expérimentale »).

**Travaux à effectuer.**

1. Définir le protocole de test : mire `signature` vérifiée au testeur, débranchement et rebranchement, 8 h de fonctionnement.
2. Ajouter un export JSON structuré en plus du Markdown de `hardware.report`, pour l’archivage machine.
3. Afficher le niveau de validation par type de sortie dans `Output.tsx`.

**Critères d’acceptation.**

- [ ] Chaque type de sortie réelle a au moins un rapport de session conforme aux critères, ou est marqué « expérimental » dans l’interface.

**Tests requis.**

- Tests matériels manuels instrumentés, et test unitaire du nouvel export JSON.

**Dépendances.** [LUMA-002](#luma-002), [LUMA-037](#luma-037) — Débloque : [LUMA-078](#luma-078), [LUMA-082](#luma-082).

**Effort estimé.** L

**Impact attendu.** élevé — crédibilité en exploitation réelle

**Risques et précautions.** Le matériel est nécessaire. Ne jamais lancer la mire sur un kit avec du public : la mire pilote les canaux de reset et de lampe.

#### LUMA-033

- **ID** : LUMA-033
- **Titre** : Tester l’autosauvegarde et la liste des projets récents
- **Catégorie** : Tests / persistance
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : IMPLÉMENTÉ, VALIDATION INSUFFISANTE
- **Priorité** : P2
- **Type** : tests
- **Phase** : 2

**Constat technique.** `src/core/app/files.ts` est couvert à 36,4 % des lignes et 0 % des branches. La logique d’autosauvegarde (intervalle, désactivation à 0, `force`, erreur d’écriture journalisée) et la liste des récents (déduplication, limite de 10) ne sont pas vérifiées.

**Preuves dans le code.**

- Rapport de couverture : `files.ts L 36.36 B 0 F 66.66`.
- `src/core/app/files.ts:9-32`.

**Problème ou opportunité.** La protection contre la perte de travail repose sur un code non vérifié.

**Résultat attendu.** Toutes les branches de `files.ts` sont exécutées par des tests, à 100 % des branches.

**Travaux à effectuer.**

1. Tests avec `vi.useFakeTimers` sur `autosave` : non modifié, intervalle non atteint, `autosaveMinutes = 0`, `force`, échec d’écriture.
2. Tests de `addRecent` : ordre, déduplication et limite.

**Critères d’acceptation.**

- [ ] Couverture des branches de `files.ts` à 100 %.

**Tests requis.**

- Unitaires (livrable).

**Dépendances.** [LUMA-018](#luma-018)

**Effort estimé.** S

**Impact attendu.** moyen

**Risques et précautions.** Aucun.

#### LUMA-034

- **ID** : LUMA-034
- **Titre** : Tester les réactions audio (flash sur le temps, couleur selon l’énergie, suiveurs, GO sur drop armé)
- **Catégorie** : Tests / audio réactif
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : IMPLÉMENTÉ, VALIDATION INSUFFISANTE
- **Priorité** : P2
- **Type** : tests
- **Phase** : 2

**Constat technique.** `src/core/audio/reactive.ts` est couvert à 53,9 % des lignes et 43,6 % des branches. Les suiveurs de basses et de brillance, le mouvement selon les attaques et la planification du GO sur drop prédit (conversion d’horloge, retrait de prédiction) sont peu ou pas testés.

**Preuves dans le code.**

- Rapport de couverture : `reactive.ts L 53.93 B 43.61`.
- `src/core/audio/reactive.ts:83-98` : `scheduleDrop` et déclenchement ; `:127-145` : suiveurs.

**Problème ou opportunité.** Le GO sur drop prédit déclenche une liste de cues de façon automatique : une erreur de planification produit un GO au mauvais moment, en direct.

**Résultat attendu.** La couverture de `reactive.ts` atteint au moins 85 % des lignes, avec des tests déterministes (horloge `now` injectée, déjà disponible dans le constructeur).

**Travaux à effectuer.**

1. Tests du GO sur drop : armé, prédiction en dessous du seuil, prédiction retirée avant 600 ms, un seul déclenchement, désarmement.
2. Tests des suiveurs avec des valeurs de caractéristiques fixées.

**Critères d’acceptation.**

- [ ] Couverture d’au moins 85 % des lignes.
- [ ] Aucun test ne dépend de l’horloge réelle.

**Tests requis.**

- Unitaires (livrable).

**Dépendances.** Indépendant.

**Effort estimé.** S

**Impact attendu.** moyen

**Risques et précautions.** Aucun.

#### LUMA-035

- **ID** : LUMA-035
- **Titre** : Étendre la couverture et les tests de composants au code de rendu
- **Catégorie** : Tests / interface
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : IMPLÉMENTÉ, VALIDATION INSUFFISANTE
- **Priorité** : P2
- **Type** : tests
- **Phase** : 2

**Constat technique.** Le rendu compte environ 10 000 lignes (`src/renderer`), mais il est absent de la couverture et ne dispose que de 4 fichiers de tests de composants, soit 16 tests (console, éditeur de section, écran d’accueil, espaces). Les pages critiques en exploitation (Output avec armement et confirmation, Cues, Music, Settings) ne sont vérifiées que par l’E2E, plus lent et non lancé en CI.

**Preuves dans le code.**

- `vitest.config.ts:15` : couverture limitée à `src/core/**`.
- `tests/components/*.test.tsx` : 7 + 2 + 2 + 5 tests.
- Fichiers volumineux sans test dédié : `src/renderer/features/Output.tsx` (317 lignes), `Settings.tsx` (466), `Music.tsx` (316).

**Problème ou opportunité.** Les régressions d’interface (bouton STOP, confirmation d’armement, raccourcis) ne sont détectées qu’en E2E, voire jamais.

**Résultat attendu.** La couverture inclut `src/renderer/**`, avec un seuil initial mesuré puis une progression par cliquet. Les composants Output, Cues, Settings et GeneratingModal ont des tests (API `window.luma` simulée).

**Travaux à effectuer.**

1. Créer un utilitaire `tests/components/mockLuma.ts` qui simule `invoke` et `on`.
2. Écrire les tests d’Output (armement avec confirmation, STOP), de Cues (GO, BACK) et de Settings (enregistrement, conflit LUMA-017).
3. Ajouter `src/renderer/**` à `coverage.include` avec un seuil égal à la mesure.

**Critères d’acceptation.**

- [ ] Au moins 40 tests de composants.
- [ ] Le seuil de couverture du rendu est appliqué en CI.

**Tests requis.**

- Tests de composants (livrable).

**Dépendances.** [LUMA-008](#luma-008)

**Effort estimé.** L

**Impact attendu.** moyen — prévention des régressions visibles

**Risques et précautions.** Three.js (Stage3D) est difficile à tester sous jsdom : l’exclure explicitement.

#### LUMA-036

- **ID** : LUMA-036
- **Titre** : Tester la machine d’états des sorties (reconnexion avec backoff, fermeture pendant reconnexion, désarmement)
- **Catégorie** : Tests / sorties DMX
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : IMPLÉMENTÉ, VALIDATION INSUFFISANTE
- **Priorité** : P2
- **Type** : tests
- **Phase** : 2

**Constat technique.** `OutputAdapter` gère les états `connecting`, `ready`, `error` et `disarmed`, avec une reconnexion à backoff exponentiel plafonné à 10 s, et `OutputManager` gère l’armement. Couverture des branches : 59,1 % pour `types.ts` et 65,3 % pour `OutputManager.ts`. Les courses (fermeture pendant le minuteur de reconnexion, `configure` d’une sortie armée en erreur) ne sont pas testées.

**Preuves dans le code.**

- Rapport de couverture : `types.ts B 59.09`, `OutputManager.ts B 65.27`.
- `src/core/protocols/types.ts:80-92` : `fail` et reconnexion ; `:37-47` : `close`.
- `src/core/protocols/OutputManager.ts:54-83` : `configure` avec `wasArmed`.

**Problème ou opportunité.** Les règles de sûreté (« une sortie réelle ne s’arme jamais seule ») reposent sur ces branches, et une régression peut réarmer une sortie après une modification de configuration.

**Résultat attendu.** Toutes les transitions sont couvertes par des tests à minuteurs simulés, et la propriété « aucune sortie réelle n’est ouverte sans `arm()` préalable » est vérifiée sur des séquences aléatoires d’opérations.

**Travaux à effectuer.**

1. Tests de transitions avec `VirtualOutput` et l’injection `fail-next` et `disconnect` (déjà disponibles).
2. Test de propriété : séquences aléatoires de `configure`, `arm`, `disarm` et `fail` avec un adaptateur réel simulé.

**Critères d’acceptation.**

- [ ] Couverture des branches d’au moins 85 % sur `types.ts` et `OutputManager.ts`.
- [ ] La propriété de sûreté tient sur 1 000 séquences.

**Tests requis.**

- Unitaires et tests de propriété (livrable).

**Dépendances.** Indépendant. — Débloque : [LUMA-071](#luma-071).

**Effort estimé.** M

**Impact attendu.** élevé — sûreté de l’armement

**Risques et précautions.** Aucun.

#### LUMA-037

- **ID** : LUMA-037
- **Titre** : Rendre l’adaptateur Enttec Pro injectable et le tester avec un port série simulé
- **Catégorie** : Tests / sorties USB
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : IMPLÉMENTÉ, VALIDATION INSUFFISANTE
- **Priorité** : P2
- **Type** : tests
- **Phase** : 2

**Constat technique.** `EnttecProOutput` importe directement `serialport` dans `doOpen`, sans fabrique injectable. Il est couvert à 42,1 % des lignes et 21,4 % des fonctions. `OpenDmxOutput` accepte déjà une `PortFactory` (86 % des lignes). Le traitement « trame ignorée si occupé », la déconnexion et la fermeture ne sont pas vérifiés.

**Preuves dans le code.**

- `src/core/protocols/enttec.ts:66-82` : constructeur sans fabrique, avec `await import("serialport")`.
- `src/core/protocols/opendmx.ts:52` : `constructor(config, private readonly factory: PortFactory = defaultFactory)`.
- Rapport de couverture : `enttec.ts L 42.1 F 21.42`.

**Problème ou opportunité.** La seule interface USB « intelligente » prise en charge n’est vérifiée ni par les tests ni sur du matériel (LUMA-038).

**Résultat attendu.** `EnttecProOutput` accepte une fabrique de port comme `OpenDmxOutput`. Des tests vérifient le cadrage, l’abandon de trame quand le port est occupé, l’erreur de déconnexion et la reconnexion.

**Travaux à effectuer.**

1. Introduire `SerialFactory` dans `enttec.ts`, avec la fabrique par défaut basée sur `serialport`.
2. Écrire des tests avec un port simulé en mémoire.

**Critères d’acceptation.**

- [ ] Couverture d’au moins 85 % des lignes de `enttec.ts`.

**Tests requis.**

- Unitaires (livrable).

**Dépendances.** Indépendant. — Débloque : [LUMA-038](#luma-038), [LUMA-078](#luma-078).

**Effort estimé.** S

**Impact attendu.** moyen

**Risques et précautions.** Aucun.

#### LUMA-039

- **ID** : LUMA-039
- **Titre** : Ajouter une reprise contrôlée des appels OpenRouter sur 429, 5xx et erreurs réseau transitoires
- **Catégorie** : IA / intégration OpenRouter
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : ABSENT
- **Priorité** : P2
- **Type** : fiabilité
- **Phase** : 2

**Constat technique.** `request()` transforme toute réponse non OK en `OpenRouterError` sans nouvelle tentative, y compris le 429 (limite de débit, message « réessayez plus tard »), les 502 et 503, et les coupures réseau. Le repli local masque l’échec, mais l’utilisateur perd la qualité du modèle distant sur un incident d’une seconde.

**Preuves dans le code.**

- `src/core/ai/providers/openrouter.ts:170-195` : un seul `fetch`, aucune boucle de reprise.
- `openrouter.ts:191` : message dédié au 429.

**Problème ou opportunité.** Les incidents transitoires, fréquents chez les agrégateurs de modèles, dégradent inutilement les propositions et la planification des shows.

**Résultat attendu.** Les requêtes en lecture seule (liste des modèles) et les complétions sont reprises au plus 2 fois sur 429, 502, 503, 504 et erreurs réseau, avec un backoff exponentiel et du jitter, en respectant `Retry-After` et en restant dans le délai global `timeoutSec`.

**Travaux à effectuer.**

1. Ajouter une boucle de reprise dans `request()` avec une classification des erreurs.
2. Garder le délai global (budget de temps partagé entre les tentatives).
3. Indiquer dans les `notices` le nombre de tentatives.

**Critères d’acceptation.**

- [ ] Un `fetchImpl` simulé qui répond 503 puis 200 : succès avec une notice « 2 tentatives ».
- [ ] Un 401 n’est jamais repris.
- [ ] Le délai global est respecté.

**Tests requis.**

- Unitaires dans `tests/unit/ai.test.ts` avec un `fetchImpl` simulé.

**Dépendances.** Indépendant. — Débloque : [LUMA-040](#luma-040).

**Effort estimé.** S

**Impact attendu.** moyen

**Risques et précautions.** Une complétion est payante : ne pas reprendre après un succès HTTP dont le contenu est invalide (cas traité par LUMA-040).

#### LUMA-041

- **ID** : LUMA-041
- **Titre** : Évaluer le chemin OpenRouter avec un banc rejoué hors ligne
- **Catégorie** : IA / évaluation
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : tests
- **Phase** : 2

**Constat technique.** Le banc d’évaluation (175 cas, dont 33 adverses) ne mesure que l’interpréteur local déterministe (`proposeLocally`). La chaîne distante (prompt système, description du kit, extraction du JSON, réparation `clean`, validation stricte, garde-fou photosensible) n’est évaluée sur aucun corpus. Les tests unitaires utilisent des réponses simulées ponctuelles.

**Preuves dans le code.**

- `tests/eval/ai.eval.test.ts:30-31` : `proposeLocally(c.prompt, ctx, engine)`.
- `tests/eval/cases.json` : 175 cas (comptage lors de l’audit).

**Problème ou opportunité.** Une modification du prompt système ou du schéma JSON peut dégrader la qualité des propositions distantes sans qu’aucun indicateur ne le montre.

**Résultat attendu.** Un mode d’enregistrement capture des réponses réelles d’OpenRouter (avec une clé fournie localement, jamais commitée) dans `tests/eval/recordings/`. Le banc rejoue ces réponses hors ligne et mesure la validité, le respect de la sécurité et la reconnaissance. Il échoue sur toute violation de sécurité.

**Travaux à effectuer.**

1. Ajouter un `fetchImpl` d’enregistrement et de rejeu indexé par le hachage de la requête.
2. Ajouter un script `npm run eval:record` (manuel) et étendre `npm run eval` au rejeu.
3. Définir une référence initiale et un cliquet, comme pour le mode local.

**Critères d’acceptation.**

- [ ] Le banc rejoué passe hors ligne en CI.
- [ ] Une réponse enregistrée contenant un strobe interdit est refusée (sécurité bloquante).

**Tests requis.**

- Banc d’évaluation (livrable).

**Dépendances.** Indépendant. — Débloque : [LUMA-059](#luma-059), [LUMA-070](#luma-070).

**Effort estimé.** M

**Impact attendu.** moyen — qualité mesurable de l’IA distante

**Risques et précautions.** Ne jamais enregistrer la clé API ni des données client dans les enregistrements.

#### LUMA-042

- **ID** : LUMA-042
- **Titre** : Limiter le débit des paquets OSC invalides ou inconnus et leur impact sur le journal
- **Catégorie** : Contrôle externe / OSC
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : sécurité
- **Phase** : 2

**Constat technique.** Chaque paquet OSC mal formé émet un `error`, transformé en `logger.warn`, ajouté aux alertes et écrit de façon synchrone dans le fichier de journal. En mode `0.0.0.0` (réseau local, sans authentification), un émetteur malveillant ou défaillant peut saturer le journal et les alertes. Chaque message reçoit aussi une réponse `/luma/ack`, ce qui permet un effet de réflexion vers une adresse usurpée.

**Preuves dans le code.**

- `src/core/control/osc.ts:68-76` : `emit("error", new Error("Paquet OSC ignoré…"))` pour chaque paquet invalide, et `ack` vers `rinfo`.
- `src/core/app/AppService.ts:148` : `osc.on("error") → logger.warn`.
- `src/core/settings/settings.ts:105-111` : `bind` `0.0.0.0` possible, sans authentification.

**Problème ou opportunité.** Le contrôle OSC sur réseau partagé est une surface d’attaque peu coûteuse contre la stabilité du journal et du thread principal.

**Résultat attendu.** Les erreurs OSC sont agrégées (au plus une ligne toutes les 10 s par émetteur), le traitement est limité par émetteur (par exemple 200 paquets par seconde), et les accusés de réception sont désactivables.

**Travaux à effectuer.**

1. Ajouter un limiteur par adresse IP dans `OscServer` (réutiliser le principe de `RemoteLimiter`).
2. Agréger les erreurs de parsing.
3. Ajouter un réglage `osc.ack` (vrai par défaut).

**Critères d’acceptation.**

- [ ] 10 000 paquets invalides en 1 s produisent au plus 1 entrée de journal.
- [ ] Le traitement des paquets valides d’un autre émetteur n’est pas affecté.

**Tests requis.**

- Unitaire `OscServer` sur un port local éphémère (le parsing est déjà testé dans `tests/unit/control.test.ts`).

**Dépendances.** Indépendant. — Débloque : [LUMA-061](#luma-061).

**Effort estimé.** S

**Impact attendu.** moyen

**Risques et précautions.** Ne pas limiter `/luma/timecode` en dessous de 30 Hz.

#### LUMA-043

- **ID** : LUMA-043
- **Titre** : Rendre les écritures atomiques durables (fsync) et tolérantes aux verrous de fichiers Windows
- **Catégorie** : Persistance
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : fiabilité
- **Phase** : 2

**Constat technique.** `writeFileAtomic` écrit le temporaire puis le renomme, sans `fsync` du fichier ni du dossier. Après une coupure de courant, le renommage peut être visible alors que le contenu est vide (selon le système de fichiers). Sous Windows, `rename` échoue en `EPERM` ou `EBUSY` quand un antivirus ou un indexeur tient le fichier, et l’erreur remonte directement, sans nouvelle tentative.

**Preuves dans le code.**

- `src/core/project/store.ts:10-22` : `writeFile`, puis `copyFile` vers `.bak`, puis `rename`, sans `fsync` ni nouvelle tentative.

**Problème ou opportunité.** C’est un risque de projet vide après une coupure de courant pendant l’enregistrement, et d’échecs d’enregistrement intermittents sous Windows.

**Résultat attendu.** Le temporaire est écrit, synchronisé (`filehandle.sync()`) puis renommé. Le renommage est repris jusqu’à 5 fois (50 ms, 100 ms…) sur `EPERM`, `EBUSY` et `EACCES`.

**Travaux à effectuer.**

1. Utiliser `fs.open`, `write`, `sync` et `close` pour le temporaire.
2. Ajouter une boucle de reprise bornée autour de `rename`.

**Critères d’acceptation.**

- [ ] Un `rename` simulé qui échoue deux fois en `EPERM` réussit à la troisième tentative.
- [ ] La durée d’enregistrement d’un projet de 5 Mo reste sous 200 ms sur SSD.

**Tests requis.**

- Unitaire avec un module `fs` simulé.

**Dépendances.** [LUMA-018](#luma-018)

**Effort estimé.** S

**Impact attendu.** moyen

**Risques et précautions.** `fsync` ralentit les écritures fréquentes : l’appliquer aux projets et aux paramètres, pas au cache IA.

#### LUMA-045

- **ID** : LUMA-045
- **Titre** : Récupérer partiellement un fichier de paramètres invalide au lieu de tout réinitialiser
- **Catégorie** : Paramètres / compatibilité
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : fiabilité
- **Phase** : 2

**Constat technique.** Au démarrage, si `settingsSchema.safeParse` échoue sur une seule valeur (par exemple un champ écrit par une version plus récente, ou une valeur hors bornes), tous les paramètres repassent aux valeurs par défaut : sorties, contrôles, raccourcis, jeton. Une copie `.invalid` est faite, mais rien ne propose de restaurer ce qui était valide. Le schéma a une `version: 1` sans mécanisme de migration.

**Preuves dans le code.**

- `src/core/app/AppService.ts:169-178` : en cas d’échec de validation, valeurs par défaut et copie `.invalid`.
- `src/core/settings/settings.ts:47` : `version: z.literal(1)`.

**Problème ou opportunité.** Revenir d’une version bêta à une version stable, ou faire une modification manuelle maladroite, efface toute la configuration matérielle d’un utilisateur.

**Résultat attendu.** La validation se fait section par section : les sections valides sont conservées, seules les sections invalides prennent leurs valeurs par défaut, et un avertissement liste les sections réinitialisées. Une table de migrations de paramètres existe, sur le modèle de `MIGRATIONS` des projets.

**Travaux à effectuer.**

1. Valider chaque clé de premier niveau séparément avec `settingsSchema.shape`.
2. Ajouter `SETTINGS_MIGRATIONS` et le numéro de version.
3. Signaler dans les alertes les sections réinitialisées.

**Critères d’acceptation.**

- [ ] Un `settings.json` avec un `engine.rateHz` hors bornes conserve les `outputs`.
- [ ] Un fichier v1 est lu par la version v2.

**Tests requis.**

- Unitaires sur l’initialisation avec des fichiers préparés.

**Dépendances.** Indépendant.

**Effort estimé.** S

**Impact attendu.** moyen

**Risques et précautions.** Les références croisées entre sections sont aujourd’hui inexistantes : à vérifier si le schéma évolue.

#### LUMA-046

- **ID** : LUMA-046
- **Titre** : Renforcer la porte de release : tests de performance, E2E, signature de code et vérification de l’installeur
- **Catégorie** : Livraison
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : sécurité
- **Phase** : 2

**Constat technique.** `scripts/release.mjs` exécute `typecheck`, `lint`, `test` et `package`, mais ni `test:perf`, ni `test:e2e`, ni `test:coverage`. La signature de code est facultative : sans `CSC_LINK`, l’installeur est produit non signé, et rien ne bloque une release publique non signée. Le canal de mise à jour automatique télécharge et installe ce binaire.

**Preuves dans le code.**

- `scripts/release.mjs:31-34` : `typecheck`, `lint`, `npm test` et `package` seulement.
- `electron-builder.yml:20` : signature conditionnée à `CSC_LINK` et `CSC_KEY_PASSWORD`.
- `src/main/updates.ts` : mise à jour automatique depuis les releases GitHub.

**Problème ou opportunité.** Une release peut partir avec une régression E2E connue, ou non signée. SmartScreen avertit alors l’utilisateur, et les mises à jour automatiques distribuent un binaire non authentifié.

**Résultat attendu.** La release échoue si `test:e2e`, `test:coverage` ou la signature manquent pour une version stable. Une pré-release non signée reste possible avec un indicateur explicite `--allow-unsigned`.

**Travaux à effectuer.**

1. Ajouter ces étapes à `release.mjs`.
2. Vérifier la signature de l’`.exe` produit (`signtool verify` ou API Electron Builder).
3. Exécuter les mêmes étapes en CI sur les tags.

**Critères d’acceptation.**

- [ ] `npm run release -- --dry-run` sans `CSC_LINK` échoue pour une version stable.

**Tests requis.**

- Exécution à blanc du script dans les deux configurations.

**Dépendances.** [LUMA-008](#luma-008), [LUMA-007](#luma-007)

**Effort estimé.** S

**Impact attendu.** moyen

**Risques et précautions.** Le certificat de signature a un coût : prévoir son obtention.

#### LUMA-052

- **ID** : LUMA-052
- **Titre** : Tester de bout en bout la chaîne timecode (MTC et LTC dans le rendu vers la poursuite de timeline) et la perte de signal
- **Catégorie** : Tests / timecode
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : IMPLÉMENTÉ, VALIDATION INSUFFISANTE
- **Priorité** : P2
- **Type** : tests
- **Phase** : 2

**Constat technique.** Le cœur est testé en unitaire : `timeline.timecode` donne `chasing`, avec une tolérance de 80 ms. Les décodeurs MTC et LTC du rendu, l’envoi limité à 10 Hz, la pause après 500 ms de perte de signal (`monitor.ts`) et la résistance à un timecode qui recule ne sont pas testés dans la chaîne complète.

**Preuves dans le code.**

- `tests/unit/control.test.ts:87-94` : poursuite du timecode côté service.
- `src/renderer/control.ts:88-94` : limitation à 10 Hz et envoi.
- `src/core/app/monitor.ts:12-15` : pause après 500 ms sans timecode.

**Problème ou opportunité.** La synchronisation sur un timecode externe sert aux concerts et au théâtre. Une régression dans la chaîne du rendu ne serait détectée qu’en situation réelle.

**Résultat attendu.** Un test d’intégration injecte un flux LTC synthétique (encodeur `encodeLtc` disponible dans `src/core/control/timecode.ts`) et vérifie la poursuite, la reprise après une coupure et la pause.

**Travaux à effectuer.**

1. Test unitaire du chemin `LtcDecoder` → `timecode()` → commande, avec un `window.luma` simulé.
2. Test du service : arrêt du flux puis pause après 500 ms (minuteurs simulés).

**Critères d’acceptation.**

- [ ] Le flux LTC à 25 fps est poursuivi avec moins de 2 images d’écart.
- [ ] Une coupure de 600 ms met la timeline en pause.

**Tests requis.**

- Intégration (livrable).

**Dépendances.** [LUMA-021](#luma-021)

**Effort estimé.** S

**Impact attendu.** moyen

**Risques et précautions.** Aucun.

#### LUMA-040

- **ID** : LUMA-040
- **Titre** : Relancer une fois le modèle avec les erreurs de validation quand sa réponse ne respecte pas le schéma
- **Catégorie** : IA / qualité des réponses
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : ABSENT
- **Priorité** : P3
- **Type** : amélioration
- **Phase** : 2

**Constat technique.** Quand la réponse JSON du modèle ne respecte pas `llmPlanSchema`, `proposeWithOpenRouter` lève immédiatement une erreur. Le handler bascule alors sur le mode local, si le repli est activé. Il n’y a aucune tentative de correction, alors que l’erreur Zod précise le champ fautif.

**Preuves dans le code.**

- `src/core/ai/providers/openrouter.ts:289-294` : `throw new OpenRouterError("Réponse IA non conforme au schéma…")`.
- `src/core/app/handlers/ai.ts:89-96` : repli local.

**Problème ou opportunité.** Avec les modèles qui ne prennent pas en charge les sorties structurées (`structuredOutputs` faux), une petite erreur de format fait perdre toute la réponse.

**Résultat attendu.** Sur une non-conformité de schéma, une seule relance est envoyée avec le message d’erreur et la réponse précédente. Si elle échoue aussi, le comportement actuel s’applique. Le coût supplémentaire est signalé dans les `notices`.

**Travaux à effectuer.**

1. Ajouter un paramètre `repair` à `completeJson` qui ajoute un message « corrige selon ces erreurs ».
2. Le limiter à une tentative, et l’activer par un réglage IA.

**Critères d’acceptation.**

- [ ] Un modèle simulé qui répond d’abord avec un champ manquant, puis correctement, produit une proposition OpenRouter (et non locale).

**Tests requis.**

- Unitaires avec un `fetchImpl` simulé à deux réponses.

**Dépendances.** [LUMA-039](#luma-039)

**Effort estimé.** S

**Impact attendu.** faible

**Risques et précautions.** Le double coût doit être visible pour l’utilisateur (LUMA-058).

#### LUMA-044

- **ID** : LUMA-044
- **Titre** : Transformer les lectures hors bornes du lecteur ZIP en erreurs `ZipError` explicites
- **Catégorie** : Import GDTF / MVR
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : correction de bug
- **Phase** : 2

**Constat technique.** `readZip` vérifie la signature des entrées centrales mais lit `b.readUInt32LE(e.offset)` et les longueurs locales sans contrôler que `offset + 30` reste dans le tampon. Un fichier GDTF tronqué lève une `RangeError` Node, qui sera journalisée comme erreur interne et non comme un message utilisateur.

**Preuves dans le code.**

- `src/core/util/zip.ts:45-46` : lecture de l’en-tête local sans contrôle des bornes.
- `src/core/fixtures/gdtf.ts:169` : `readZip(file)` sur le fichier importé.

**Problème ou opportunité.** Un fichier d’import corrompu (téléchargement interrompu) produit un message technique peu compréhensible.

**Résultat attendu.** Toute lecture hors bornes produit une `ZipError` « archive tronquée », et l’import affiche une erreur claire.

**Travaux à effectuer.**

1. Ajouter des contrôles `offset + n <= b.length` avant chaque lecture dans `readZip` et `read()`.

**Critères d’acceptation.**

- [ ] Un GDTF tronqué à 50 % produit une `ZipError`.

**Tests requis.**

- Unitaire dans `tests/unit/gdtf.test.ts` avec un tampon tronqué.

**Dépendances.** Indépendant.

**Effort estimé.** XS

**Impact attendu.** faible

**Risques et précautions.** Aucun.

#### LUMA-047

- **ID** : LUMA-047
- **Titre** : Retirer du diagnostic exporté les chemins personnels et les noms d’utilisateur
- **Catégorie** : Confidentialité / support
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : sécurité
- **Phase** : 2

**Constat technique.** Le diagnostic masque les clés sensibles (jeton, secret, mot de passe, clé API) et les jetons dans les URL. Il inclut en revanche l’objet `settings` complet, dont `general.recentProjects` (chemins absolus du type `C:\Users\<nom>\…`), ainsi que les 2 000 dernières lignes de journal, qui peuvent contenir des noms de fichiers.

**Preuves dans le code.**

- `src/core/log/diagnostic.ts:24-38` : expression `SECRET_KEY` et `redactSecrets`.
- `src/core/app/handlers/system.ts:81-89` : `settings: app.settings` et `logs: …tail(2000)`.

**Problème ou opportunité.** Le fichier de diagnostic, destiné à être envoyé à l’équipe (retour bêta), divulgue le nom du compte Windows et l’arborescence personnelle.

**Résultat attendu.** Les chemins absolus sont réduits à leur nom de fichier, et le dossier utilisateur est remplacé par `~`. Une case « inclure les noms de fichiers » est décochée par défaut.

**Travaux à effectuer.**

1. Ajouter à `redactSecrets` une normalisation des chemins (`os.homedir()` remplacé par `~`).
2. Ajouter une option dans `feedback.export`.

**Critères d’acceptation.**

- [ ] Aucune occurrence de `os.homedir()` dans un diagnostic généré.

**Tests requis.**

- Unitaire dans `tests/unit/diagnostic.test.ts`.

**Dépendances.** Indépendant.

**Effort estimé.** XS

**Impact attendu.** faible

**Risques et précautions.** Garder suffisamment d’information pour le support (extension et nom de fichier).

#### LUMA-048

- **ID** : LUMA-048
- **Titre** : Historiser les métriques du moteur et des sorties pour diagnostiquer un incident après coup
- **Catégorie** : Observabilité
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : amélioration
- **Phase** : 2

**Constat technique.** `Engine.metrics()` donne des valeurs instantanées : la moyenne glissante du tick, un `maxTick` remis à zéro chaque seconde et des dépassements cumulés. Les statistiques de sortie sont cumulatives. Rien n’est conservé dans le temps : après un incident pendant un show (saccade à 21 h 14), impossible de savoir ce qui s’est passé.

**Preuves dans le code.**

- `src/core/engine/Engine.ts:425-444` : `recordTick`, avec `m.maxTick = ms` à chaque fenêtre (ligne 442).
- `src/core/engine/Engine.ts:502-515` : `metrics()` instantané.
- `src/core/app/hardware.ts` : rapport ponctuel de session.

**Problème ou opportunité.** Les incidents temps réel ne sont pas diagnosticables a posteriori, alors que le journal et le diagnostic existent déjà.

**Résultat attendu.** Une série temporelle compacte (une ligne toutes les 10 s : Hz mesurés, p95 du tick, dépassements, fps et erreurs par sortie) est conservée sur 24 h dans un tampon circulaire, incluse dans le diagnostic et affichée sous forme de graphique dans la console de diagnostic.

**Travaux à effectuer.**

1. Ajouter un échantillonneur dans `AppService` (minuteur de 10 s).
2. Ajouter un fichier `metrics.jsonl` avec rotation, à la manière de `FileLogSink`.
3. Ajouter un graphique simple dans `DiagnosticsDrawer`.

**Critères d’acceptation.**

- [ ] Un pic de 50 ms injecté apparaît dans la série de la fenêtre correspondante.

**Tests requis.**

- Unitaire de l’échantillonneur avec des minuteurs simulés.

**Dépendances.** [LUMA-005](#luma-005)

**Effort estimé.** M

**Impact attendu.** moyen

**Risques et précautions.** Volume disque : au plus 9 000 lignes par jour, négligeable.

#### LUMA-049

- **ID** : LUMA-049
- **Titre** : Mesurer et journaliser les commandes IPC lentes
- **Catégorie** : Observabilité
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : ABSENT
- **Priorité** : P3
- **Type** : amélioration
- **Phase** : 2

**Constat technique.** Le gestionnaire `luma:cmd` journalise les erreurs internes, mais ne mesure pas la durée des commandes. Les commandes potentiellement lourdes (`project.open` avec validation complète, `music.addTrack` avec une analyse volumineuse, `music.storeAudio` jusqu’à 500 Mo, `fixture.add` en série) bloquent le thread du moteur sans trace.

**Preuves dans le code.**

- `src/main/index.ts:237-248` : pas de mesure de temps.
- `src/shared/commands.ts:184` : `music.storeAudio` jusqu’à 500 Mo dans un seul message IPC.

**Problème ou opportunité.** La cause des saccades du moteur liées aux commandes n’est pas identifiable.

**Résultat attendu.** Toute commande de plus de 50 ms est journalisée en `debug` (type et durée), et toute commande de plus de 250 ms en `warn`. Un compteur par type figure dans le diagnostic.

**Travaux à effectuer.**

1. Envelopper `service.execute` avec `performance.now()` dans le gestionnaire IPC (ou dans `AppService.handle`, pour couvrir aussi l’OSC et la télécommande).

**Critères d’acceptation.**

- [ ] Une commande simulée de 300 ms produit un avertissement contenant son type.

**Tests requis.**

- Unitaire sur `AppService.handle`.

**Dépendances.** Indépendant.

**Effort estimé.** XS

**Impact attendu.** faible

**Risques et précautions.** Exclure `audio.features` (haute fréquence) du journal `debug`.

#### LUMA-050

- **ID** : LUMA-050
- **Titre** : Ne plus effacer silencieusement les autres secrets quand `secrets.json` est illisible
- **Catégorie** : Secrets
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : fiabilité
- **Phase** : 2

**Constat technique.** Quand `secrets.json` est corrompu, `read()` renvoie `{}` sans le signaler. Le `set()` suivant réécrit alors un fichier qui ne contient que le nouveau secret : les autres sont perdus sans trace. Aujourd’hui, un seul secret existe (la clé OpenRouter), mais le magasin est générique.

**Preuves dans le code.**

- `src/main/secrets.ts:12-18` : `try { JSON.parse(…) } catch { return {}; }`.
- `src/main/secrets.ts:29-37` : `set` réécrit l’objet entier.

**Problème ou opportunité.** C’est une perte silencieuse de secrets, sans diagnostic.

**Résultat attendu.** Un fichier illisible est renommé en `secrets.json.corrupt`, un avertissement est journalisé et l’interface indique que la clé doit être ressaisie.

**Travaux à effectuer.**

1. Distinguer `ENOENT` (normal) d’une erreur de parsing dans `read()`.
2. Journaliser via le `Logger` injecté.

**Critères d’acceptation.**

- [ ] Un fichier corrompu donne un avertissement unique et le fichier `.corrupt` est conservé.

**Tests requis.**

- Unitaire avec un `safeStorage` simulé (voir LUMA-032).

**Dépendances.** [LUMA-032](#luma-032)

**Effort estimé.** XS

**Impact attendu.** faible

**Risques et précautions.** Aucun.

#### LUMA-051

- **ID** : LUMA-051
- **Titre** : Borner la mémoire des limiteurs de la télécommande par adresse IP
- **Catégorie** : Télécommande
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : sécurité
- **Phase** : 2

**Constat technique.** `RemoteLimiter` garde une entrée par adresse IP dans `failures` et dans `buckets`. Les entrées de `buckets` ne sont jamais supprimées, et celles de `failures` ne le sont qu’au prochain passage de la même IP. Sur un réseau où des clients changent d’adresse, ou face à des requêtes usurpées depuis de nombreuses adresses, les maps croissent sans limite pendant toute la durée de vie du serveur.

**Preuves dans le code.**

- `src/core/control/remote.ts:48-83` : deux `Map` sans purge périodique.

**Problème ou opportunité.** La croissance mémoire est lente mais non bornée sur une application qui reste ouverte des jours en exploitation.

**Résultat attendu.** Les entrées inactives depuis plus de 5 minutes sont purgées, et le nombre d’entrées est plafonné (par exemple 4 096, avec éviction des plus anciennes).

**Travaux à effectuer.**

1. Ajouter une purge dans `takeCommand` et `fail` (ou sur le minuteur SSE existant de 200 ms).

**Critères d’acceptation.**

- [ ] 100 000 adresses distinctes laissent au plus 4 096 entrées.

**Tests requis.**

- Unitaire `RemoteLimiter` avec horloge injectée (déjà paramétrable).

**Dépendances.** Indépendant.

**Effort estimé.** XS

**Impact attendu.** faible

**Risques et précautions.** Aucun.

#### LUMA-084

- **ID** : LUMA-084
- **Titre** : Retirer de la CSP de production l’autorisation de connexion WebSocket vers localhost
- **Catégorie** : Sécurité du rendu
- **Nature** : B — Fiabilisation de l’existant
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : sécurité
- **Phase** : 2

**Constat technique.** La Content-Security-Policy du rendu, stricte par ailleurs (`script-src "self"`, `object-src "none"`, `form-action "none"`), autorise `connect-src "self" ws://localhost:*` dans tous les builds. Ce droit ne sert qu’au rechargement à chaud de Vite en développement.

**Preuves dans le code.**

- `src/renderer/index.html:5` : `connect-src "self" ws://localhost:*`.
- `electron.vite.config.ts` : aucune substitution de CSP par mode de build.

**Problème ou opportunité.** En production, un script injecté (via une dépendance compromise du rendu) pourrait communiquer avec un service local (par exemple un serveur de développement ou un outil d’administration) via WebSocket. C’est une surface inutile.

**Résultat attendu.** La CSP de production ne contient plus `ws://localhost:*`, et la CSP de développement le conserve (transformation `transformIndexHtml` selon le mode).

**Travaux à effectuer.**

1. Ajouter un petit plugin Vite dans `electron.vite.config.ts` qui retire la directive en `build`.
2. Ajouter un test E2E qui lit la CSP effective de la build.

**Critères d’acceptation.**

- [ ] `out/renderer/index.html` ne contient pas `ws://localhost`.

**Tests requis.**

- Vérification statique dans la CI après `npm run build`.

**Dépendances.** [LUMA-008](#luma-008)

**Effort estimé.** XS

**Impact attendu.** faible

**Risques et précautions.** Ne pas casser le rechargement à chaud en développement.

### Fiches de la phase 3 — Améliorations fonctionnelles à fort impact

#### LUMA-053

- **ID** : LUMA-053
- **Titre** : Étendre l’annulation et le rétablissement à toutes les éditions du projet
- **Catégorie** : Édition / historique
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P1
- **Type** : fonctionnalité
- **Phase** : 3

**Constat technique.** L’historique d’annulation ne couvre que l’implantation de scène : positions, accroches, structures et réglages du visualiseur, jusqu’à 100 étapes. Les suppressions de scènes, de listes de cues, d’effets, de groupes, de projecteurs du patch, les éditions de cues et les créations par l’IA ne sont pas annulables. Seule la musique propose un « plan précédent » (`music.restorePrevious`).

**Preuves dans le code.**

- `src/core/app/shared.ts:7-10` : `SCENE_FIELDS` et `SCENE_HISTORY_MAX = 100`.
- `src/core/app/AppService.ts:299-310` : `sceneMutate` est la seule mutation historisée.
- `src/shared/commands.ts:81-83` : `scene.undo` et `scene.redo` sont limités à l’implantation (commentaire).
- `src/core/app/handlers/programming.ts:100-107` et `:132-138` : suppressions de scène et de liste de cues définitives.

**Problème ou opportunité.** Une suppression accidentelle (liste de cues complète, groupe utilisé par vingt effets) n’est réversible que par un rechargement de fichier, avec perte du reste du travail. C’est le manque d’ergonomie le plus coûteux pour un logiciel d’édition.

**Résultat attendu.** Ctrl+Z et Ctrl+Shift+Z annulent et rétablissent toute mutation du projet (par étapes nommées : « Supprimer la liste X »). L’historique de scène actuel devient un cas particulier de l’historique global. Les opérations en direct (GO, programmeur) en restent exclues.

**Travaux à effectuer.**

1. Introduire dans `AppService.mutate` un historique d’instantanés compressés (ou de patchs inverses calculés par diff JSON), avec un libellé passé par chaque handler.
2. Fusionner `sceneUndo` et `sceneRedo` dans cet historique et migrer `scene.undo` et `scene.redo` vers `project.undo` et `project.redo` (alias conservés pendant une version).
3. Afficher le libellé de l’étape dans un toast et dans le menu.
4. Exclure les mutations techniques (`recentPrompts`, voir LUMA-028).

**Critères d’acceptation.**

- [ ] Chaque commande de mutation du projet est annulable et rétablissable, avec un résultat identique en comparaison profonde.
- [ ] Mémoire de l’historique au plus 50 Mo pour un projet de 1 000 projecteurs (mesurée).
- [ ] L’E2E existant « annuler / rétablir » des structures passe toujours.

**Tests requis.**

- Test de propriété : séquence aléatoire de mutations, annulation complète, puis égalité avec l’état initial.
- E2E : suppression d’une liste de cues, puis Ctrl+Z.

**Dépendances.** [LUMA-031](#luma-031), [LUMA-073](#luma-073)

**Effort estimé.** L

**Impact attendu.** élevé — sécurité éditoriale

**Risques et précautions.** Le coût mémoire des instantanés complets (analyses musicales volumineuses) : préférer des patchs ou exclure `music.tracks[].analysis`, qui est immuable.

#### LUMA-054

- **ID** : LUMA-054
- **Titre** : Internationaliser les messages du cœur et les dialogues du processus principal
- **Catégorie** : Internationalisation
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : amélioration
- **Phase** : 3

**Constat technique.** L’interface propose le français et l’anglais (catalogues `fr` et `en` complets et identiques en clés : 458 et 287 clés vérifiées lors de l’audit). En revanche, tous les messages produits par le cœur sont rédigés en dur en français : erreurs `UserError`, journal, notices IA, alertes, rapport matériel. Il en va de même pour les dialogues natifs du processus principal et pour le titre des toasts d’erreur.

**Preuves dans le code.**

- `src/core/settings/settings.ts:65` : `language: z.enum(["fr", "en"])`.
- `src/core/app/handlers/fixtures.ts:24` : exemple de `UserError` en français.
- `src/main/index.ts:65-96` et `:150-157` : titres et boutons des dialogues en français.
- `src/renderer/api.ts:8` : `title: "Action impossible"`.
- Comparaison des catalogues lors de l’audit : aucune clé présente dans une seule langue.

**Problème ou opportunité.** Un utilisateur qui a choisi l’anglais reçoit toutes les erreurs, alertes et explications de l’IA en français, c’est-à-dire précisément les messages les plus importants.

**Résultat attendu.** Les messages du cœur sont émis sous forme de clés avec paramètres (`{ key, vars }`) et traduits dans le rendu. Les dialogues natifs utilisent la langue des paramètres.

**Travaux à effectuer.**

1. Définir un type `Message = { key: MessageKey; vars?: … }` partagé, et un catalogue `src/shared/i18n/`.
2. Faire porter une clé optionnelle à `UserError` et faire traduire par le rendu (`api.ts`), avec repli sur le texte.
3. Migrer progressivement par handler, avec un cliquet analogue à `check-i18n.mjs` pour `src/core/app/handlers`.
4. Passer la langue au processus principal pour les dialogues.

**Critères d’acceptation.**

- [ ] En anglais, les erreurs des 20 commandes les plus utilisées (statistiques d’usage) s’affichent en anglais.
- [ ] Le cliquet empêche l’ajout de nouveaux messages en dur dans les handlers.

**Tests requis.**

- Unitaires de traduction, et vérification de la parité des catalogues étendue à `src/shared/i18n`.

**Dépendances.** Indépendant.

**Effort estimé.** L

**Impact attendu.** moyen — utilisabilité internationale

**Risques et précautions.** Les messages journalisés doivent rester lisibles dans les diagnostics : journaliser la clé et le texte français.

#### LUMA-055

- **ID** : LUMA-055
- **Titre** : Résorber les 782 textes d’interface écrits en dur dans le rendu
- **Catégorie** : Internationalisation
- **Nature** : D — Évolution structurelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : dette technique
- **Phase** : 3

**Constat technique.** Le script `check-i18n.mjs` (cliquet) compte 782 textes en dur dans `src/renderer` lors de l’audit. Les fichiers les plus chargés sont `Output.tsx` (111), `visualizer/sceneCards.tsx` (93), `Fixtures.tsx` (82), `Effects.tsx` (65), `Audio.tsx` (63) et `Onboarding.tsx` (60). Ces textes restent en français quand l’interface est en anglais.

**Preuves dans le code.**

- Exécution de `node scripts/check-i18n.mjs` : « Textes en dur : 782 ».
- `scripts/i18n-baseline.json` : répartition par fichier.
- `src/renderer/store.ts:11-26` : libellés de pages en anglais en dur (`PAGES`).

**Problème ou opportunité.** L’interface anglaise est mélangée, et la page la plus critique en exploitation (DMX Output) est la moins traduite.

**Résultat attendu.** Le compteur passe sous 100 en trois étapes (Output, Fixtures, Audio en priorité), et la référence est mise à jour à chaque étape (`--update`).

**Travaux à effectuer.**

1. Extraire les textes fichier par fichier vers `fr.screens.ts` et `en.screens.ts`.
2. Traduire les libellés de `PAGES` par `nav.*`, déjà en partie utilisé dans la barre latérale.

**Critères d’acceptation.**

- [ ] `check-i18n` au plus 100.
- [ ] Parité des clés FR et EN maintenue.

**Tests requis.**

- Le cliquet existant, et un test de parité des catalogues à ajouter en unitaire.

**Dépendances.** Indépendant.

**Effort estimé.** L

**Impact attendu.** moyen

**Risques et précautions.** Une erreur d’extraction peut casser des `data-testid` ou des sélecteurs E2E basés sur le texte : relancer l’E2E.

#### LUMA-056

- **ID** : LUMA-056
- **Titre** : Mesurer et améliorer la compréhension des requêtes en anglais par l’interpréteur local
- **Catégorie** : IA locale
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : IMPLÉMENTÉ, VALIDATION INSUFFISANTE
- **Priorité** : P2
- **Type** : amélioration
- **Phase** : 3

**Constat technique.** L’interpréteur local contient quelques formes anglaises (par exemple `blue` et `red` dans la table des couleurs), mais le banc d’évaluation ne comprend que 8 requêtes de forme anglaise sur 175, d’après un repérage par mots-clés lors de l’audit. La qualité en anglais n’est donc pas mesurée, alors que l’interface est proposée en anglais et que le mode local est le mode par défaut (`provider: "local"`).

**Preuves dans le code.**

- `src/core/ai/local/interpreter.ts:41-42` : formes anglaises dans la table des couleurs.
- `tests/eval/cases.json` : 8 cas de forme anglaise environ (repérage par mots-clés).
- `src/core/settings/settings.ts:84` : fournisseur `local` par défaut.

**Problème ou opportunité.** Un utilisateur anglophone sans clé OpenRouter obtient un taux de reconnaissance inconnu, probablement bien inférieur aux 0,99 mesurés en français.

**Résultat attendu.** Le banc compte au moins 60 cas anglais (dont des cas adverses) avec un seuil propre, et l’interpréteur couvre les verbes, cibles, effets et nombres anglais courants.

**Travaux à effectuer.**

1. Ajouter les cas au banc avec une catégorie de langue.
2. Étendre les tables de formes de l’interpréteur (verbes « set, make, turn, dim », types « pars, movers, wash »).
3. Établir la référence mesurée, puis le cliquet.

**Critères d’acceptation.**

- [ ] Reconnaissance anglaise d’au moins 0,95 et zéro violation de sécurité.

**Tests requis.**

- Banc d’évaluation.

**Dépendances.** Indépendant.

**Effort estimé.** M

**Impact attendu.** moyen

**Risques et précautions.** Ne pas dégrader le français : les deux scores sont bloquants.

#### LUMA-057

- **ID** : LUMA-057
- **Titre** : Découvrir automatiquement les nœuds Art-Net du réseau (ArtPoll et ArtPollReply)
- **Catégorie** : Protocoles réseau
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : ABSENT
- **Priorité** : P2
- **Type** : fonctionnalité
- **Phase** : 3

**Constat technique.** La sortie Art-Net ne fait qu’émettre des paquets ArtDmx vers une adresse IPv4 saisie à la main. Aucune requête ArtPoll n’est émise et aucun ArtPollReply n’est interprété : l’utilisateur doit connaître l’adresse IP et les univers de chaque nœud. Le RDM sur Art-Net est déjà implémenté.

**Preuves dans le code.**

- `src/core/protocols/artnet.ts:11-27` : seul `buildArtDmx` (OpCode 0x5000) est produit.
- `src/core/protocols/config.ts:25` : `host: ipv4` obligatoire.
- Recherche de `ArtPoll` ou `0x2000` dans `src/core/protocols` : aucune occurrence.

**Problème ou opportunité.** La configuration réseau est la première source d’échec sur site. Une découverte automatique réduit les erreurs de saisie et le temps d’installation.

**Résultat attendu.** Un bouton « Rechercher des nœuds » de la page DMX Output liste en moins de 3 s les nœuds qui répondent (nom, IP, ports et univers), et permet de créer une sortie préremplie.

**Travaux à effectuer.**

1. Implémenter `buildArtPoll` et `parseArtPollReply` dans `artnet.ts`.
2. Ajouter la commande `output.discoverArtNet` (diffusion sur les interfaces de `localIpv4Addresses`).
3. Ajouter l’interface de liste et la création de sortie.

**Critères d’acceptation.**

- [ ] Avec un nœud simulé qui répond sur un port local, la commande renvoie son nom et ses univers.
- [ ] Aucune émission réseau sans action de l’utilisateur.

**Tests requis.**

- Unitaires de construction et de parsing (trames de référence).
- Intégration avec un nœud simulé, comme dans `tests/unit/rdm.test.ts`.

**Dépendances.** Indépendant.

**Effort estimé.** M

**Impact attendu.** moyen — installation plus rapide et plus sûre

**Risques et précautions.** La diffusion ArtPoll sur un réseau partagé est acceptable (lecture seule), mais elle doit rester déclenchée manuellement.

#### LUMA-058

- **ID** : LUMA-058
- **Titre** : Suivre la consommation de jetons et le coût des appels OpenRouter
- **Catégorie** : IA / coûts
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : ABSENT
- **Priorité** : P2
- **Type** : fonctionnalité
- **Phase** : 3

**Constat technique.** `completeJson` n’extrait de la réponse que `model` et `choices`. Le champ `usage` renvoyé par l’API (jetons d’entrée et de sortie, coût) est ignoré. Les statistiques d’usage locales ne comptent que des types de commandes et des erreurs. L’utilisateur n’a aucune visibilité sur la dépense, alors que des requêtes peuvent atteindre `max_tokens: 8000` avec un raisonnement réglable.

**Preuves dans le code.**

- `src/core/ai/providers/openrouter.ts:271-273` : schéma de réponse sans `usage`.
- `src/core/ai/providers/openrouter.ts:253` : `max_tokens: 8000`.
- `src/core/telemetry/usage.ts:53-60` : `command()` et `error()` seulement.

**Problème ou opportunité.** Le coût de la génération de shows et des propositions n’est pas maîtrisable, et l’erreur « crédits insuffisants » (402) arrive sans préavis.

**Résultat attendu.** Chaque appel enregistre ses jetons et son coût (quand OpenRouter les fournit). La page IA affiche le cumul du jour et du mois, et un plafond mensuel facultatif bloque les appels avec un message clair.

**Travaux à effectuer.**

1. Étendre le schéma de réponse à `usage` et le remonter dans `ProviderResult`.
2. Ajouter un compteur persistant `ai-usage.json` (local, hors télémétrie optionnelle).
3. Ajouter le réglage `ai.monthlyBudget` et une vérification avant l’appel.

**Critères d’acceptation.**

- [ ] Après un appel simulé renvoyant `usage`, le cumul est incrémenté.
- [ ] Un budget atteint empêche l’appel suivant avec une `UserError` explicite.

**Tests requis.**

- Unitaires avec un `fetchImpl` simulé.

**Dépendances.** Indépendant.

**Effort estimé.** S

**Impact attendu.** moyen

**Risques et précautions.** Ne rien envoyer à l’extérieur : le compteur reste local.

#### LUMA-059

- **ID** : LUMA-059
- **Titre** : Donner à l’IA distante le contexte des derniers échanges pour les demandes de raffinement
- **Catégorie** : IA / mémoire conversationnelle
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : fonctionnalité
- **Phase** : 3

**Constat technique.** Chaque `ai.propose` envoie un seul message utilisateur (le prompt) avec la description du kit et l’état en direct (`liveState` : couleurs, intensités et effets IA en cours). Les prompts récents sont mémorisés dans le projet (`recentPrompts`), mais ils ne sont pas transmis au modèle, pas plus que la compréhension et les actions de la proposition précédente. Une demande comme « non, plutôt l’inverse » ou « garde ça mais plus lent sur les lyres seulement » repose donc uniquement sur l’état observé.

**Preuves dans le code.**

- `src/core/app/handlers/ai.ts:86` : `proposeWithOpenRouter(prompt, describeRig(…, liveState(…)), …)`.
- `src/core/app/handlers/ai.ts:103` : `recentPrompts` stockés, non utilisés pour l’appel.
- `src/core/ai/providers/openrouter.ts:289-293` : un seul message utilisateur.

**Problème ou opportunité.** Les itérations naturelles avec un directeur lumière (affiner une idée) sont mal comprises, ce qui oblige à reformuler entièrement chaque demande.

**Résultat attendu.** Une option « Continuer la conversation » envoie les 3 derniers échanges (prompt, compréhension et résumé des actions appliquées ou refusées) en messages précédents, dans un budget de jetons borné. Une action « Nouvelle conversation » réinitialise ce contexte.

**Travaux à effectuer.**

1. Conserver dans `AppService` un fil de conversation borné (en mémoire, réinitialisé au changement de projet).
2. Passer `messages[]` à `completeJson`.
3. Ajouter le contrôle d’interface dans l’IA Director.

**Critères d’acceptation.**

- [ ] La requête envoyée contient au plus N échanges précédents, et le prompt système reste inchangé.
- [ ] Le changement de projet vide le fil.

**Tests requis.**

- Unitaires sur la construction des messages, avec `fetchImpl` simulé qui inspecte le corps.
- Cas ajoutés au banc rejoué (LUMA-041).

**Dépendances.** [LUMA-041](#luma-041)

**Effort estimé.** M

**Impact attendu.** moyen — qualité perçue de l’IA

**Risques et précautions.** Le coût en jetons augmente : à afficher via LUMA-058. Le contexte ne doit jamais contourner la validation stricte des actions.

#### LUMA-060

- **ID** : LUMA-060
- **Titre** : Exporter et importer un projet « paquet » qui embarque les fichiers audio des morceaux
- **Catégorie** : Musique / portabilité
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : fonctionnalité
- **Phase** : 3

**Constat technique.** L’audio des morceaux est stocké par machine (`<userData>/music/<sha256>`) et non dans le fichier de projet, volontairement d’après le commentaire. Un projet copié sur l’ordinateur de régie perd donc la lecture synchronisée : `play()` lève « Fichier audio non chargé : réimportez-le ». Un écrivain ZIP existe déjà (`writeZip`), utilisé pour l’export MVR.

**Preuves dans le code.**

- `src/core/app/handlers/music.ts:27` : « The audio itself is kept per machine ».
- `src/renderer/musicPlayer.ts:83` : erreur de réimport.
- `src/core/util/zip.ts:56` : `writeZip`.
- `src/core/app/handlers/project.ts:111-117` : exemple d’export ZIP (MVR).

**Problème ou opportunité.** Le flux habituel (préparation sur portable, show sur la machine de régie) oblige à réimporter chaque morceau à la main.

**Résultat attendu.** « Exporter le paquet » produit un `.luma.zip` contenant le projet, les fichiers audio référencés et les profils. « Ouvrir » accepte ce paquet, restaure l’audio dans le magasin local (avec vérification SHA-256) puis ouvre le projet.

**Travaux à effectuer.**

1. Ajouter les commandes `project.exportPackage` et `project.openPackage`.
2. Vérifier l’empreinte de chaque fichier audio à l’import.
3. Gérer les paquets volumineux en flux (fichiers jusqu’à 500 Mo) plutôt qu’en mémoire.

**Critères d’acceptation.**

- [ ] Exporter, puis importer dans un profil `LUMA_USER_DATA` vierge : la lecture du morceau fonctionne.
- [ ] Un fichier audio altéré dans le paquet est refusé.

**Tests requis.**

- Intégration sur deux dossiers de données temporaires.

**Dépendances.** Indépendant.

**Effort estimé.** M

**Impact attendu.** moyen

**Risques et précautions.** Le ZIP sans ZIP64 est limité à 4 Go : le signaler, ou l’étendre.

#### LUMA-061

- **ID** : LUMA-061
- **Titre** : Restreindre l’OSC réseau à une liste d’adresses autorisées
- **Catégorie** : Contrôle externe / OSC
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : ABSENT
- **Priorité** : P2
- **Type** : sécurité
- **Phase** : 3

**Constat technique.** En mode `0.0.0.0`, le serveur OSC accepte les commandes de n’importe quelle machine du réseau, sans authentification : GO, BACK, blackout, grand master, relâche, arrêt des émissions. Le journal le signale à l’activation. La télécommande HTTP, elle, exige un jeton.

**Preuves dans le code.**

- `src/core/settings/settings.ts:105-111` : `bind: "127.0.0.1" | "0.0.0.0"`, sans autre contrôle.
- `src/core/app/control.ts:21` : message « réseau local, sans authentification ».
- `src/core/app/control.ts:65-89` : table des adresses OSC.

**Problème ou opportunité.** Sur un réseau de salle partagé (Wi-Fi technique ou public mal segmenté), n’importe qui peut déclencher un blackout ou des GO.

**Résultat attendu.** Le réglage `osc.allow` (liste d’adresses IPv4 ou de plages CIDR) filtre les paquets à la réception. Il est vide par défaut en mode réseau, et l’interface exige au moins une adresse avant d’activer `0.0.0.0`.

**Travaux à effectuer.**

1. Ajouter `allow: string[]` au schéma, avec validation CIDR.
2. Filtrer dans `OscServer` à la réception, en comptant les paquets refusés.
3. Ajouter l’interface dans les Paramètres.

**Critères d’acceptation.**

- [ ] Un paquet venant d’une adresse non autorisée est ignoré et compté.
- [ ] L’activation de `0.0.0.0` sans liste est refusée avec un message.

**Tests requis.**

- Unitaires du filtre CIDR et du serveur sur un port local.

**Dépendances.** [LUMA-042](#luma-042) — Débloque : [LUMA-063](#luma-063).

**Effort estimé.** S

**Impact attendu.** moyen

**Risques et précautions.** Les adresses IP s’usurpent sur UDP : c’est une mitigation, pas une authentification. Le documenter dans l’interface.

#### LUMA-073

- **ID** : LUMA-073
- **Titre** : Réduire le coût de chaque mutation (clonage et revalidation complète du projet)
- **Catégorie** : Architecture des données
- **Nature** : D — Évolution structurelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : performance
- **Phase** : 3

**Constat technique.** `mutate` clone tout le projet (`structuredClone`), applique la modification, réintègre les profils utilisés, revalide tout le document avec Zod (schémas avec plafonds jusqu’à 40 000 éléments), puis reconstruit entièrement `ProjectIndex`, profils résolus compris. Le coût est proportionnel à la taille du projet, et pas à celle de la modification.

**Preuves dans le code.**

- `src/core/app/AppService.ts:262-270` : `structuredClone`, `embedUsedProfiles`, `projectSchema.safeParse`, puis `setProject`.
- `src/core/app/AppService.ts:272-290` : `new ProjectIndex(p, this.userProfiles)` à chaque mutation.
- `src/core/engine/resolve.ts:8-27` : résolution de tous les projecteurs.

**Problème ou opportunité.** C’est une latence d’édition croissante avec la taille du show, et une cause de gigue du moteur (LUMA-071).

**Résultat attendu.** Les mutations ne valident que les sections touchées (schémas de sous-sections) et n’excluent du clonage que les données immuables. `music.tracks[].analysis` est partagé et non cloné, et l’index est reconstruit de façon incrémentale quand seul le patch change. Gain mesuré d’au moins 5 fois sur un projet de référence de 1 000 projecteurs et 3 morceaux.

**Travaux à effectuer.**

1. Créer un banc de mesure de `mutate` (projet généré).
2. Valider par section (`projectSchema.shape.<section>`), avec une validation complète à l’enregistrement.
3. Partager les analyses musicales gelées (`Object.freeze`) sans les cloner.

**Critères d’acceptation.**

- [ ] Le banc montre un gain d’au moins 5 fois sur `fixture.update`.
- [ ] Aucun projet invalide ne peut être enregistré (validation complète conservée à `saveProjectFile`).

**Tests requis.**

- Banc de performance, et tests existants d’intégrité du projet.

**Dépendances.** Indépendant. — Débloque : [LUMA-053](#luma-053), [LUMA-072](#luma-072).

**Effort estimé.** M

**Impact attendu.** moyen

**Risques et précautions.** Les invariants inter-sections (références) ne sont pas portés par Zod aujourd’hui : la validation par section ne fait rien perdre, mais il faut le vérifier avec LUMA-015.

#### LUMA-062

- **ID** : LUMA-062
- **Titre** : Étendre le MIDI : faders vers niveaux de playback et d’effets, et retour d’état vers les contrôleurs
- **Catégorie** : Contrôle externe / MIDI
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : fonctionnalité
- **Phase** : 3

**Constat technique.** Les mappages MIDI associent une note ou un CC soit à une action de raccourci, soit au grand master. Aucun mappage ne pilote une valeur continue autre que le master (vitesse d’effet, BPM, fader de liste), et aucun message MIDI n’est renvoyé : LED de GO, motorisation, état du blackout.

**Preuves dans le code.**

- `src/renderer/control.ts:81-85` : `master`, sinon `runShortcut`.
- `src/core/settings/settings.ts:98-103` : mappage clé vers action ou `master`.
- Recherche de `send(` sur des sorties MIDI dans `src/renderer` : aucune.

**Problème ou opportunité.** Les surfaces de contrôle courantes (APC, X-Touch) ne servent qu’à une fraction de leurs capacités, et l’opérateur n’a pas de retour visuel sur le contrôleur.

**Résultat attendu.** Les mappages acceptent des cibles continues (`bpm`, `effect:<id>:speed`) et un retour d’état configurable (note ou CC envoyés sur changement de l’état runtime : blackout, liste en lecture).

**Travaux à effectuer.**

1. Étendre le schéma des mappages avec `target` et `feedback`.
2. Ouvrir les sorties MIDI et émettre sur changement de `runtime` (débit limité).
3. Mettre à jour l’interface d’apprentissage.

**Critères d’acceptation.**

- [ ] Un CC mappé sur `bpm` change le BPM du moteur.
- [ ] Un blackout allume la LED configurée.

**Tests requis.**

- Unitaires de `parseMidi` et du routeur de mappages avec des messages simulés.

**Dépendances.** [LUMA-001](#luma-001)

**Effort estimé.** M

**Impact attendu.** faible

**Risques et précautions.** Éviter les boucles de retour (un écho du contrôleur pris pour une entrée).

#### LUMA-063

- **ID** : LUMA-063
- **Titre** : Publier l’état du show en OSC (retour d’état pour TouchOSC, QLab et autres)
- **Catégorie** : Contrôle externe / OSC
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : fonctionnalité
- **Phase** : 3

**Constat technique.** Le serveur OSC renvoie seulement `/luma/ack <adresse> <ok>` à l’émetteur de chaque message. Aucun état n’est publié (cue en cours, master, blackout, BPM) : une surface OSC ne peut pas afficher l’état réel, contrairement à la télécommande HTTP, qui reçoit `RemoteState` par SSE.

**Preuves dans le code.**

- `src/core/control/osc.ts:76` : `ack` seul.
- `src/core/app/control.ts:46-59` : `remoteState` existe déjà et peut servir de source.

**Problème ou opportunité.** L’intégration avec les régies son et vidéo reste unidirectionnelle.

**Résultat attendu.** Une liste d’abonnés (IP et port, configurés) reçoit `/luma/state/*` sur changement (au plus 10 Hz) : master, blackout, BPM, nom du cue par liste.

**Travaux à effectuer.**

1. Ajouter une configuration des destinations.
2. Calculer les différences de `remoteState` et les encoder (`encodeOsc` existe).

**Critères d’acceptation.**

- [ ] Un changement de master est reçu par un récepteur UDP de test en moins de 150 ms.

**Tests requis.**

- Intégration sur un port local.

**Dépendances.** [LUMA-061](#luma-061)

**Effort estimé.** S

**Impact attendu.** faible

**Risques et précautions.** Débit à limiter.

#### LUMA-064

- **ID** : LUMA-064
- **Titre** : Implémenter la découverte d’univers sACN (E1.31 §8) et la synchronisation optionnelle
- **Catégorie** : Protocoles réseau
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : amélioration
- **Phase** : 3

**Constat technique.** L’émetteur sACN produit des paquets de données conformes (CID stable, priorité, terminaison de flux en 3 paquets), mais pas de paquets de découverte d’univers, et l’adresse de synchronisation vaut toujours 0. Les récepteurs et les outils de diagnostic sACN ne voient donc pas la liste des univers émis, et les grandes installations ne peuvent pas verrouiller plusieurs univers sur la même trame.

**Preuves dans le code.**

- `src/core/protocols/sacn.ts:40` : `buf.writeUInt16BE(0, 109); // sync address`.
- Recherche d’un paquet de découverte (vecteur 0x00000008) : aucune occurrence.

**Problème ou opportunité.** C’est un écart de conformité visible dans les outils (sACNView) et une limite pour les installations multi-univers à LED.

**Résultat attendu.** Un paquet de découverte est émis toutes les 10 s par l’émetteur actif. Une option « synchronisation » émet des paquets de synchronisation sur un univers dédié après chaque trame.

**Travaux à effectuer.**

1. Ajouter `buildSacnDiscovery` et `buildSacnSync`.
2. Ajouter un minuteur dans `SacnOutput` et l’option dans le schéma.

**Critères d’acceptation.**

- [ ] Les paquets produits sont conformes aux tailles et vecteurs de la norme, vérifiés par un parseur de test.

**Tests requis.**

- Unitaires de construction de paquets.

**Dépendances.** Indépendant. — Débloque : [LUMA-081](#luma-081).

**Effort estimé.** S

**Impact attendu.** faible

**Risques et précautions.** La synchronisation activée sans récepteur compatible peut figer certains récepteurs : la laisser désactivée par défaut.

#### LUMA-065

- **ID** : LUMA-065
- **Titre** : Importer une implantation MVR (patch et positions) depuis Capture, Vectorworks ou grandMA3
- **Catégorie** : Interopérabilité
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : ABSENT
- **Priorité** : P3
- **Type** : fonctionnalité
- **Phase** : 3

**Constat technique.** L’export MVR est implémenté (scène et matrices, profils référencés par nom) et testé. Aucun import MVR n’existe, alors que le lecteur ZIP et l’import GDTF sont disponibles, et que `fast-xml-parser` est déjà une dépendance (utilisée pour grandMA2).

**Preuves dans le code.**

- `src/core/project/mvr.ts:7-9` : export seulement.
- Recherche de `importMvr` ou `parseMvr` : aucune occurrence.
- `src/core/util/zip.ts:18` (`readZip`) ; `src/core/fixtures/ma2.ts:1` (`fast-xml-parser`).

**Problème ou opportunité.** Les implantations conçues dans un logiciel de CAO doivent être ressaisies à la main.

**Résultat attendu.** « Importer MVR » crée les projecteurs (nom, adresse, univers, position et hauteur), associe les GDTF embarqués quand ils sont présents, et liste les types non résolus pour une association manuelle.

**Travaux à effectuer.**

1. Parser `GeneralSceneDescription.xml` (inverse de `mvrScene`).
2. Importer les GDTF embarqués via `convertGdtf`.
3. Ajouter un écran d’association des types inconnus.

**Critères d’acceptation.**

- [ ] Un aller-retour export puis import sur un projet de démonstration redonne le même patch et les mêmes positions (à 1 mm près).

**Tests requis.**

- Unitaire d’aller-retour sur `buildDemo`.

**Dépendances.** Indépendant.

**Effort estimé.** L

**Impact attendu.** moyen

**Risques et précautions.** Les variantes de MVR selon les éditeurs : prévoir des fichiers d’exemple réels dans `tests/fixtures`.

#### LUMA-066

- **ID** : LUMA-066
- **Titre** : Appairer la télécommande par QR code
- **Catégorie** : Télécommande / UX
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : amélioration
- **Phase** : 3

**Constat technique.** Les Paramètres affichent l’URL de la télécommande sous forme de texte (`http://<ip>:<port>/?t=<jeton>`) pour chaque interface, avec un bouton de régénération du jeton. Il faut recopier à la main sur le téléphone une URL qui contient un UUID.

**Preuves dans le code.**

- `src/renderer/features/Settings.tsx:237` : URL affichée en texte.
- `src/renderer/features/Settings.tsx:240` : régénération du jeton.

**Problème ou opportunité.** La saisie est fastidieuse et source d’erreurs sur site, ce qui pousse à choisir des réglages moins sûrs.

**Résultat attendu.** Un QR code est affiché pour chaque URL (génération locale, sans service externe), et la régénération du jeton le met à jour.

**Travaux à effectuer.**

1. Ajouter un encodeur QR minimal local (ou une dépendance légère vérifiée), avec un rendu SVG compatible avec la CSP stricte.

**Critères d’acceptation.**

- [ ] Le QR décodé par un lecteur de référence donne l’URL exacte.

**Tests requis.**

- Unitaire : décodage du QR produit avec une bibliothèque de test.

**Dépendances.** Indépendant.

**Effort estimé.** S

**Impact attendu.** faible

**Risques et précautions.** Le QR contient le jeton : ne l’afficher qu’à la demande (bouton « Afficher »).

#### LUMA-067

- **ID** : LUMA-067
- **Titre** : Afficher l’état des sorties et les alertes critiques sur la télécommande
- **Catégorie** : Télécommande
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : amélioration
- **Phase** : 3

**Constat technique.** `RemoteState` contient le master, le blackout, l’indicateur d’émission, le BPM, les listes et la localisation, mais pas l’état des sorties (erreur, reconnexion), ni le garde-fou photosensible, ni les alertes. Un opérateur en salle avec la tablette ne voit pas qu’une sortie est tombée.

**Preuves dans le code.**

- `src/core/control/remote.ts:12-20` : interface `RemoteState`.
- `src/core/app/control.ts:46-59` : `remoteState()`.

**Problème ou opportunité.** La télécommande sert justement quand l’opérateur est loin de la régie, et c’est là qu’il a le plus besoin des alertes.

**Résultat attendu.** La page de télécommande affiche un bandeau « Sortie X en erreur » et « Garde-fou photosensible actif », sans exposer de détails sensibles (adresses IP).

**Travaux à effectuer.**

1. Étendre `RemoteState` avec `outputs: {name, state}[]` et `safety`.
2. Mettre à jour la page `PAGE`.

**Critères d’acceptation.**

- [ ] Une sortie virtuelle déconnectée par injection apparaît en erreur sur la page SSE en moins d’une seconde.

**Tests requis.**

- Unitaires `remoteState`, et E2E du flux SSE (déjà présent pour l’état de base).

**Dépendances.** Indépendant.

**Effort estimé.** XS

**Impact attendu.** faible

**Risques et précautions.** Aucun.

#### LUMA-068

- **ID** : LUMA-068
- **Titre** : Proposer un mode « tracking » optionnel pour les listes de cues
- **Catégorie** : Playback
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : ABSENT
- **Priorité** : P3
- **Type** : fonctionnalité
- **Phase** : 3

**Constat technique.** Le playback est volontairement « non-tracking » : les intensités absentes du cue suivant descendent à 0, les autres attributs gardent leur valeur. C’est documenté dans le code. Le mode tracking (seules les valeurs modifiées sont enregistrées, les autres persistent d’un cue à l’autre), standard sur les consoles théâtre, n’existe pas.

**Preuves dans le code.**

- `src/core/engine/playback.ts:34` : « Non-tracking crossfade ».
- `src/core/model/schemas.ts` : `cueListSchema` sans option de mode.

**Problème ou opportunité.** Les éclairagistes de théâtre attendent le tracking pour éditer un cue sans propager les changements à la main.

**Résultat attendu.** Une option par liste `mode: "cue-only" | "tracking"` (par défaut `cue-only`, l’actuel). En tracking, l’état cible d’un cue est la composition des scènes des cues précédents.

**Travaux à effectuer.**

1. Ajouter le champ au schéma (migration additive avec valeur par défaut).
2. Calculer l’état « tracké » dans `CueListPlayback.goto`.
3. Ajouter l’indicateur dans l’interface Cues.

**Critères d’acceptation.**

- [ ] En tracking, une intensité posée au cue 1 et absente des cues 2 et 3 reste à sa valeur au cue 3.

**Tests requis.**

- Unitaires dans `tests/unit/engine.test.ts`.

**Dépendances.** [LUMA-031](#luma-031)

**Effort estimé.** M

**Impact attendu.** faible

**Risques et précautions.** Un GOTO vers un cue lointain doit recalculer l’état « tracké » complet.

#### LUMA-069

- **ID** : LUMA-069
- **Titre** : Rendre le plan de scène 2D utilisable au clavier et par les lecteurs d’écran
- **Catégorie** : Accessibilité
- **Nature** : C — Amélioration fonctionnelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : amélioration
- **Phase** : 3

**Constat technique.** Le rendu contient environ 108 attributs `aria-*` ou `role`, et les dialogues et toasts ont des rôles. En revanche, le canevas 2D de scène (`StageCanvas`), qui sert à sélectionner et déplacer les projecteurs, n’a aucun gestionnaire clavier ni `tabIndex` : sélection et placement sont réservés à la souris.

**Preuves dans le code.**

- Recherche de `onKeyDown` et `tabIndex` dans `src/renderer/features/visualizer/StageCanvas.tsx` : aucune occurrence.
- Comptage des attributs `aria-*` et `role` dans `src/renderer` : 108.

**Problème ou opportunité.** C’est une barrière pour les utilisateurs au clavier, et une lenteur pour les opérateurs experts.

**Résultat attendu.** Le canevas est focalisable. Les flèches déplacent la sélection d’un pas (Maj pour un pas fin), Tab parcourt les projecteurs, et une liste alternative accessible donne les positions.

**Travaux à effectuer.**

1. Ajouter `tabIndex` et `onKeyDown` dans `StageCanvas` et réutiliser `fixture.place` (une étape d’historique).
2. Ajouter une région `aria-live` qui annonce la sélection.

**Critères d’acceptation.**

- [ ] Déplacer un projecteur de 1 m au clavier crée une seule étape d’annulation.

**Tests requis.**

- Test de composant clavier.

**Dépendances.** Indépendant.

**Effort estimé.** M

**Impact attendu.** faible

**Risques et précautions.** Conflits avec les raccourcis globaux (`useShortcuts`) : n’intercepter les flèches qu’avec le focus sur le canevas.

#### LUMA-070

- **ID** : LUMA-070
- **Titre** : Faire évoluer le contrat d’actions IA en v2 pour exposer les effets récents (fan, suiveurs de bandes)
- **Catégorie** : IA / contrat
- **Nature** : E — Capacité future
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : fonctionnalité
- **Phase** : 3

**Constat technique.** Le moteur connaît des types d’effets plus récents que ceux du contrat IA v1, comme le précise `AI_EFFECT_TYPES`. Le mécanisme de versionnage et de migration du contrat est en place (`AI_ACTIONS_VERSION`, `AI_ACTION_MIGRATIONS`, échantillons figés et test de contrat), mais aucune v2 n’existe encore.

**Preuves dans le code.**

- `src/core/ai/actions.ts:4-5` : « newer engine types (fan, band followers) need a contract bump ».
- `src/core/ai/actions.ts:105-116` : versionnage et migrations.
- `tests/unit/ai-contract.test.ts` et `tests/fixtures/ai-contract/v1.*`.

**Problème ou opportunité.** L’IA ne peut pas proposer les effets les plus expressifs du moteur.

**Résultat attendu.** Contrat v2 additif (nouveaux `effectType`), avec une migration identité de v1 vers v2, des échantillons v2 figés et un schéma JSON envoyé au modèle mis à jour.

**Travaux à effectuer.**

1. Étendre `AI_EFFECT_TYPES`, le schéma permissif du fournisseur et le prompt système.
2. Ajouter `AI_ACTION_MIGRATIONS[1]` (identité) et les fixtures v2.
3. Étendre l’interpréteur local (mots-clés).

**Critères d’acceptation.**

- [ ] Le test de contrat valide les échantillons v1 migrés et v2.
- [ ] Le banc d’évaluation reste au-dessus de sa référence.

**Tests requis.**

- Test de contrat existant, plus de nouveaux cas d’évaluation.

**Dépendances.** [LUMA-041](#luma-041)

**Effort estimé.** S

**Impact attendu.** faible

**Risques et précautions.** Vérifier le garde-fou photosensible sur les nouveaux types (simulation de `effectFlashViolation`).

### Fiches de la phase 4 — Évolutions structurelles

#### LUMA-071

- **ID** : LUMA-071
- **Titre** : Isoler le moteur temps réel et les sorties DMX hors de la boucle d’événements du processus principal
- **Catégorie** : Architecture temps réel
- **Nature** : D — Évolution structurelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : performance
- **Phase** : 4

**Constat technique.** Le moteur (ordonnanceur `setTimeout` + `setImmediate`), les sorties UDP et série, le traitement de toutes les commandes IPC (validation Zod, `structuredClone` et revalidation complète du projet à chaque mutation), les écritures synchrones du journal, les serveurs OSC et HTTP et la diffusion des événements vers les fenêtres partagent tous le même thread du processus principal. Toute commande lourde retarde donc les ticks DMX.

**Preuves dans le code.**

- `src/core/engine/Engine.ts:452-488` : ordonnanceur dans le thread courant.
- `src/main/index.ts:47-102` : `AppService` créé dans le processus principal.
- `src/core/app/AppService.ts:262-270` : `structuredClone` et `projectSchema.safeParse` complets à chaque mutation.
- `src/core/log/fileSink.ts:43` : `appendFileSync`.
- Mesure : gigue p95 de 4 ms au test de performance (LUMA-007).

**Problème ou opportunité.** Charger un gros projet, ajouter un morceau analysé (jusqu’à 40 000 temps) ou exporter un PDF peut provoquer une saccade visible sur le kit, même avec l’ordonnanceur à échéances.

**Résultat attendu.** Le moteur, le `OutputManager` et le calcul des trames tournent dans un `utilityProcess` (ou un `worker_thread`) dédié, qui reçoit l’index du projet et les commandes temps réel par messages. La gigue du tick ne dépend plus de la charge des commandes : p95 inférieur à 2 ms sous une charge IPC synthétique.

**Travaux à effectuer.**

1. Définir le protocole de messages entre le service et le moteur : index sérialisé, commandes de playback et de programmeur, retour des valeurs et des métriques.
2. Extraire `Engine`, `OutputManager` et `AudioReactive` derrière une interface asynchrone.
3. Garder un mode « même thread » pour les tests (`autoStart: false`).
4. Mesurer avant et après avec le test de performance et un test de charge IPC.

**Critères d’acceptation.**

- [ ] Avec 50 commandes `fixture.update` par seconde sur un projet de 1 000 projecteurs, le p95 de la gigue reste sous 2 ms.
- [ ] Tous les tests existants passent en mode « même thread ».

**Tests requis.**

- Test de performance sous charge ajouté à `tests/perf`.
- Tests d’intégration du protocole de messages.

**Dépendances.** [LUMA-004](#luma-004), [LUMA-005](#luma-005), [LUMA-007](#luma-007), [LUMA-036](#luma-036) — Débloque : [LUMA-079](#luma-079).

**Effort estimé.** XL

**Impact attendu.** élevé — robustesse temps réel structurelle

**Risques et précautions.** C’est la refonte la plus lourde de la roadmap. Ne l’engager que si LUMA-007 montre que les causes locales ne suffisent pas. Les ports série (natifs) doivent rester ouverts dans le même processus que les sorties.

#### LUMA-072

- **ID** : LUMA-072
- **Titre** : Diffuser des changements incrémentaux du projet au lieu de l’état complet à chaque mutation
- **Catégorie** : Architecture IPC
- **Nature** : D — Évolution structurelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P2
- **Type** : performance
- **Phase** : 4

**Constat technique.** Chaque mutation émet l’événement `project` avec le `ProjectState` complet : projet entier, y compris les analyses musicales (temps, temps forts, événements), bibliothèque de profils, et problèmes de patch recalculés par `validatePatch`. Il est sérialisé vers toutes les fenêtres (principale et détachée). Le rendu remplace alors tout `project` dans le store.

**Preuves dans le code.**

- `src/core/app/AppService.ts:230-236` (`projectState`) et `:253-255` (`emitProject`).
- `src/main/index.ts:250-253` : `forward("project")` vers toutes les fenêtres.
- `src/renderer/store.ts:186-196` : remplacement complet.
- `src/core/model/schemas.ts:403-404` : `beats` jusqu’à 40 000 et `downbeats` jusqu’à 10 000 par morceau.

**Problème ou opportunité.** Déplacer un projecteur au gizmo 3D (une mutation par mouvement) sérialise plusieurs Mo par événement avec quelques morceaux importés : le thread principal et les fenêtres s’en trouvent ralentis.

**Résultat attendu.** Les mutations émettent un patch (chemins modifiés, ou sections de premier niveau modifiées) avec un numéro de révision. Le rendu applique ce patch, et un état complet n’est envoyé qu’à l’ouverture, au rechargement ou en cas de trou de révision.

**Travaux à effectuer.**

1. Calculer les sections de premier niveau modifiées dans `mutate` (comparaison par référence après `structuredClone` ciblé).
2. Ajouter l’événement `projectPatch` et sa gestion dans `connectEvents`.
3. Mettre en cache `validatePatch` par révision du patch.

**Critères d’acceptation.**

- [ ] Pour `fixture.update` d’une position sur un projet avec 3 morceaux, la taille de l’événement est inférieure à 10 % de l’état complet.
- [ ] Aucune désynchronisation après 10 000 mutations aléatoires (comparaison avec `project.get`).

**Tests requis.**

- Test de propriété de synchronisation, et mesure de taille.

**Dépendances.** [LUMA-073](#luma-073)

**Effort estimé.** L

**Impact attendu.** moyen

**Risques et précautions.** C’est une source classique de désynchronisation : prévoir la resynchronisation complète sur trou de révision.

#### LUMA-074

- **ID** : LUMA-074
- **Titre** : Déporter l’analyse musicale dans un Web Worker
- **Catégorie** : Musique / rendu
- **Nature** : D — Évolution structurelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : performance
- **Phase** : 4

**Constat technique.** L’analyse d’un morceau importé (tempo, temps, sections, tonalité, voix) s’exécute dans le thread du rendu par tranches coopératives (`yieldFn` avec `setTimeout(0)`). Un commentaire `shortcut:` indique que le Worker sous `file://` avec la CSP stricte n’a pas été testé.

**Preuves dans le code.**

- `src/renderer/musicPlayer.ts:57-62` : `analyzeAudio(..., { yieldFn })` dans le thread de l’interface.

**Problème ou opportunité.** L’interface (visualiseur 3D, console) reste moins fluide pendant les dizaines de secondes d’analyse d’un long morceau.

**Résultat attendu.** L’analyse tourne dans un module Worker empaqueté par Vite (`new Worker(new URL(…), { type: "module" })`), compatible avec la CSP `script-src "self"`. La progression est remontée par messages.

**Travaux à effectuer.**

1. Créer `src/renderer/workers/analyze.worker.ts`.
2. Vérifier le chargement en `file://` dans une build empaquetée.
3. Transférer le `Float32Array` (transferable).

**Critères d’acceptation.**

- [ ] Pendant une analyse de 5 minutes de musique, le FPS du visualiseur reste au moins à 90 % de sa valeur au repos.

**Tests requis.**

- E2E existant « intelligence musicale » (import et analyse) sur la build empaquetée.

**Dépendances.** Indépendant.

**Effort estimé.** M

**Impact attendu.** faible

**Risques et précautions.** La CSP ou le protocole `file://` peuvent bloquer le Worker : prévoir un repli sur l’implémentation actuelle.

#### LUMA-075

- **ID** : LUMA-075
- **Titre** : Migrer le décodage LTC et l’analyse audio en direct vers un AudioWorklet
- **Catégorie** : Audio / dette technique
- **Nature** : D — Évolution structurelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : dette technique
- **Phase** : 4

**Constat technique.** Le décodage LTC utilise `ScriptProcessorNode`, déprécié par la plateforme (commentaire `shortcut:`). L’analyse en direct lit un `AnalyserNode` à chaque `requestAnimationFrame`. Les deux traitements sont cadencés par le thread de l’interface.

**Preuves dans le code.**

- `src/renderer/control.ts:109-111` : `createScriptProcessor(2048, 1, 1)`.
- `src/renderer/audioEngine.ts:124-136` : lecture de l’`AnalyserNode` par trame d’affichage.

**Problème ou opportunité.** C’est un risque de suppression future par Chromium, et une latence et une gigue de détection liées au rendu (LUMA-006).

**Résultat attendu.** Un `AudioWorkletProcessor` décode le LTC et calcule les caractéristiques par bloc audio, indépendamment de l’affichage. Le thread principal ne reçoit plus que les résultats.

**Travaux à effectuer.**

1. Écrire un worklet empaqueté (vérifier la CSP).
2. Porter `LtcDecoder` (pur, déjà testé) et l’extraction des niveaux et bandes.

**Critères d’acceptation.**

- [ ] Le décodage LTC fonctionne avec la fenêtre réduite.
- [ ] Aucun usage de `createScriptProcessor` ne subsiste.

**Tests requis.**

- Tests unitaires existants de `LtcDecoder`, et E2E avec une entrée simulée.

**Dépendances.** [LUMA-006](#luma-006)

**Effort estimé.** M

**Impact attendu.** faible

**Risques et précautions.** Chargement des modules de worklet sous `file://` à valider.

#### LUMA-076

- **ID** : LUMA-076
- **Titre** : Réduire le coût par tick de la surveillance photosensible
- **Catégorie** : Sécurité photosensible / performance
- **Nature** : D — Évolution structurelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : performance
- **Phase** : 4

**Constat technique.** À chaque tick moteur (40 Hz), `watchFlashes` reconstruit le modèle visuel complet de tout le kit (`buildVisualModel`), puis calcule la luminance de scène, dès que le garde-fou n’est pas sur `off`. Il est sur `warn` par défaut. En mode `limit`, `limitFlashes` parcourt aussi tous les projecteurs.

**Preuves dans le code.**

- `src/core/app/monitor.ts:32-40` : `stageLight(buildVisualModel([...app.index.fixtures.values()], app.engine.values))` à chaque trame.
- `src/core/settings/settings.ts:73` : `flashGuard` vaut `warn` par défaut.
- `src/core/engine/Engine.ts:405` : `limitFlashes`.

**Problème ou opportunité.** Le coût est linéaire en nombre de projecteurs, à chaque tick, alors que la détection (fenêtre de 1 s, seuil de 3 flashs) tolérerait un échantillonnage à 20 Hz ou un calcul incrémental de la seule luminance.

**Résultat attendu.** La luminance de scène est calculée directement à partir des valeurs normalisées, sans construire le modèle visuel complet, avec un coût mesuré divisé par au moins 3. La fiabilité de détection est inchangée sur les tests existants (`tests/unit/safety.test.ts`).

**Travaux à effectuer.**

1. Écrire une fonction `stageLuminance(index, values)` spécialisée.
2. La valider contre l’implémentation actuelle sur des trames aléatoires (écart inférieur à 1 %).

**Critères d’acceptation.**

- [ ] Tests de sécurité existants verts.
- [ ] Gain mesuré au banc.

**Tests requis.**

- Test d’équivalence et banc.

**Dépendances.** Indépendant.

**Effort estimé.** S

**Impact attendu.** faible

**Risques et précautions.** C’est une fonction de sécurité : aucune réduction de sensibilité n’est acceptable.

#### LUMA-077

- **ID** : LUMA-077
- **Titre** : Centraliser les modifications de `app.settings` dans une seule fonction transactionnelle
- **Catégorie** : Architecture / paramètres
- **Nature** : D — Évolution structurelle
- **Statut actuel** : PARTIELLEMENT IMPLÉMENTÉ
- **Priorité** : P3
- **Type** : dette technique
- **Phase** : 4

**Constat technique.** `app.settings` est un champ public muté directement à cinq endroits : `settings.update`, `output.configure`, `onboarding.update`, `addRecent` et `init`. Chacun gère ou oublie à sa façon la persistance et la réapplication (moteur, sorties, contrôles, mises à jour). Le commentaire d’`AppService` reconnaît que ces champs sont un état partagé par les handlers.

**Preuves dans le code.**

- `src/core/app/handlers/system.ts:26` ; `src/core/app/handlers/output.ts:32` ; `src/core/app/handlers/project.ts:106` ; `src/core/app/files.ts:10`.
- `src/core/app/AppService.ts:76-81` : commentaire sur l’état partagé.

**Problème ou opportunité.** C’est la cause racine de LUMA-017 et LUMA-018 : chaque nouveau chemin de modification risque d’oublier la persistance, la réapplication ou la gestion de la concurrence.

**Résultat attendu.** Une méthode `updateSettings(patch, { reason })` applique une fusion, valide, persiste (en file), réapplique ce qui a changé et journalise. Les handlers n’écrivent plus `app.settings` directement, ce qui est vérifié par une règle ESLint `no-restricted-syntax` sur l’affectation.

**Travaux à effectuer.**

1. Introduire la méthode et migrer les cinq points d’écriture.
2. Ajouter la règle ESLint.

**Critères d’acceptation.**

- [ ] Aucune affectation directe à `app.settings` hors de `AppService`.
- [ ] Les tests de LUMA-017 et LUMA-018 passent.

**Tests requis.**

- Tests existants et nouveaux tests de LUMA-017.

**Dépendances.** [LUMA-017](#luma-017), [LUMA-018](#luma-018)

**Effort estimé.** S

**Impact attendu.** moyen — prévient une classe de bugs

**Risques et précautions.** Aucun.

#### LUMA-078

- **ID** : LUMA-078
- **Titre** : Prendre en charge le RDM via l’interface Enttec DMX USB Pro
- **Catégorie** : Protocoles / RDM
- **Nature** : E — Capacité future
- **Statut actuel** : ABSENT
- **Priorité** : P3
- **Type** : fonctionnalité
- **Phase** : 4

**Constat technique.** Le RDM (découverte, identification, changement d’adresse) n’est disponible que via des nœuds Art-Net. Le handler et l’interface indiquent explicitement que le RDM Enttec n’est pas implémenté.

**Preuves dans le code.**

- `src/core/app/handlers/output.ts:109` : « RDM Enttec non implémenté ».
- `src/renderer/features/Output.tsx:180` : message équivalent dans l’interface.

**Problème ou opportunité.** Les petites installations, avec une seule interface USB et sans nœud Art-Net, n’ont pas accès à l’adressage à distance.

**Résultat attendu.** Les fonctions RDM existantes (`discover`, `readDevice`, `identify`, `setStartAddress`) sont disponibles sur une sortie Enttec Pro, via les labels RDM de l’API Enttec.

**Travaux à effectuer.**

1. Abstraire `ArtNetRdm` derrière une interface `RdmTransport`.
2. Implémenter le transport Enttec (requêtes et réponses série), testé sur un port simulé.
3. Valider sur du matériel (LUMA-038).

**Critères d’acceptation.**

- [ ] La découverte RDM fonctionne sur une sortie Enttec simulée.
- [ ] Un rapport matériel est disponible.

**Tests requis.**

- Unitaires avec un port série simulé, puis validation matérielle.

**Dépendances.** [LUMA-037](#luma-037), [LUMA-038](#luma-038)

**Effort estimé.** L

**Impact attendu.** faible

**Risques et précautions.** Toutes les révisions d’Enttec Pro ne gèrent pas le RDM : détecter la version du firmware.

### Fiches de la phase 5 — Capacités futures

#### LUMA-079

- **ID** : LUMA-079
- **Titre** : Lire plusieurs timelines simultanément (couches indépendantes)
- **Catégorie** : Timeline
- **Nature** : E — Capacité future
- **Statut actuel** : ABSENT
- **Priorité** : P3
- **Type** : fonctionnalité
- **Phase** : 5

**Constat technique.** Le moteur ne possède qu’un seul `TimelineTransport` : lancer une timeline remplace la précédente. Le Song-to-Show génère une timeline par morceau, et les timelines manuelles partagent le même transport.

**Preuves dans le code.**

- `src/core/engine/Engine.ts:130` : `private readonly timeline = new TimelineTransport()`.
- `src/core/engine/Engine.ts:312-319` : `timelinePlay`, `timelinePause`, `timelineStop` et `timelineSeek` sans identifiant de transport.

**Problème ou opportunité.** Impossible de superposer une timeline d’ambiance (fond de scène) et la timeline synchronisée du morceau.

**Résultat attendu.** Plusieurs transports nommés, avec une priorité par timeline. Le timecode pilote une timeline désignée, et le snapshot liste les transports actifs.

**Travaux à effectuer.**

1. Remplacer le champ unique par une map de transports.
2. Étendre les commandes `timeline.*` avec l’identifiant de timeline.
3. Adapter l’interface Timeline et la télécommande.

**Critères d’acceptation.**

- [ ] Deux timelines en lecture contribuent selon leurs priorités, et l’arrêt de l’une n’affecte pas l’autre.

**Tests requis.**

- Unitaires dans `tests/unit/engine.test.ts`.

**Dépendances.** [LUMA-021](#luma-021), [LUMA-071](#luma-071)

**Effort estimé.** L

**Impact attendu.** faible

**Risques et précautions.** Compatibilité des commandes existantes : l’absence d’identifiant cible la timeline « principale ».

#### LUMA-080

- **ID** : LUMA-080
- **Titre** : Ajouter un mode « show verrouillé » qui interdit les éditions pendant l’exploitation
- **Catégorie** : Exploitation / sûreté opérateur
- **Nature** : E — Capacité future
- **Statut actuel** : ABSENT
- **Priorité** : P3
- **Type** : fonctionnalité
- **Phase** : 5

**Constat technique.** Le réglage `confirmDangerous` demande une confirmation pour les fonctions spéciales, et l’armement des sorties exige `confirmed: true`. En revanche, aucun mode n’empêche les modifications accidentelles du projet en cours de représentation : suppression d’une liste, déplacement d’un projecteur, édition d’une scène. Proposition nouvelle.

**Preuves dans le code.**

- `src/core/settings/settings.ts:52` : `confirmDangerous`.
- `src/shared/commands.ts:209` : `output.arm` avec `confirmed: z.literal(true)`.
- Aucun champ de verrouillage dans `settingsSchema` ni dans `RuntimeState`.

**Problème ou opportunité.** Un clic ou un raccourci malheureux pendant un show modifie le contenu en direct, sans annulation possible aujourd’hui (LUMA-053).

**Résultat attendu.** Un verrou (raccourci et indicateur dans la barre supérieure) fait refuser par le processus principal toutes les commandes de mutation du projet. Il laisse passer les commandes de jeu : GO, BACK, master, blackout, STOP, programmeur. Son déverrouillage demande une confirmation.

**Travaux à effectuer.**

1. Classer les commandes en « édition » et « jeu » (table exhaustive vérifiée à la compilation, comme `ROUTES`).
2. Ajouter la garde dans `AppService.handle`.
3. Ajouter l’indicateur et la commande `app.lock`.

**Critères d’acceptation.**

- [ ] Verrouillé, `scene.remove` est refusée avec un message explicite, tandis que `cue.go` fonctionne.
- [ ] Chaque nouveau type de commande doit être classé, sinon la compilation échoue.

**Tests requis.**

- Unitaire exhaustif de la classification.

**Dépendances.** Indépendant.

**Effort estimé.** S

**Impact attendu.** moyen

**Risques et précautions.** Ne jamais bloquer STOP, blackout ou la relâche.

#### LUMA-081

- **ID** : LUMA-081
- **Titre** : Proposer une redondance de sortie par machine de secours sACN
- **Catégorie** : Exploitation / résilience
- **Nature** : E — Capacité future
- **Statut actuel** : ABSENT
- **Priorité** : P3
- **Type** : fonctionnalité
- **Phase** : 5

**Constat technique.** La sortie sACN expose une priorité configurable (0 à 200) et un CID stable par installation : c’est la base du basculement normalisé entre deux sources. Aucune fonction n’aide à configurer une machine de secours, ni ne surveille la présence de l’autre source. Proposition nouvelle.

**Preuves dans le code.**

- `src/core/protocols/config.ts:37` : `priority` de 0 à 200.
- `src/core/app/AppService.ts:179` : CID sACN persistant.
- `src/core/protocols/sacn.ts:108-120` : terminaison propre du flux.

**Problème ou opportunité.** Une panne de l’ordinateur de régie en plein show plonge la scène dans le noir. Les consoles professionnelles proposent un « backup » suivi.

**Résultat attendu.** Un mode « secours » écoute le sACN de la machine principale (même univers, priorité supérieure) et n’émet qu’à priorité inférieure, avec un indicateur de présence de la principale et une alerte en cas de perte.

**Travaux à effectuer.**

1. Ajouter un récepteur sACN (le parseur `parseSacnPacket` existe déjà).
2. Ajouter l’indicateur et l’alerte de présence de la source principale.
3. Documenter la procédure (synchronisation des projets : hors périmètre initial).

**Critères d’acceptation.**

- [ ] Avec deux instances simulées, la perte de la principale est détectée en moins de 2,5 s (délai normalisé), et la secours devient la source prise en compte par un récepteur de test.

**Tests requis.**

- Intégration de deux `SacnOutput` et d’un récepteur sur une boucle locale.

**Dépendances.** [LUMA-064](#luma-064)

**Effort estimé.** L

**Impact attendu.** moyen

**Risques et précautions.** La synchronisation du contenu entre les machines n’est pas couverte : à indiquer clairement.

#### LUMA-082

- **ID** : LUMA-082
- **Titre** : Construire et valider les versions macOS et Linux
- **Catégorie** : Distribution
- **Nature** : E — Capacité future
- **Statut actuel** : ABSENT
- **Priorité** : P3
- **Type** : fonctionnalité
- **Phase** : 5

**Constat technique.** Seule la cible Windows NSIS x64 est configurée. Un commentaire de configuration précise que macOS et Linux ne sont pas construits tant que Windows n’est pas stable. Le code contient quelques éléments déjà multiplateformes : `safeStorage` (Keychain, libsecret), chemins via `path`, `serialport` natif.

**Preuves dans le code.**

- `electron-builder.yml:21-32` : cible `win` seule, et commentaire lignes 31-32.
- `src/main/secrets.ts:6-9` : commentaire multiplateforme.

**Problème ou opportunité.** Une partie des régisseurs travaille sous macOS.

**Résultat attendu.** Des builds `dmg` (arm64 et x64, signés et notarisés) et `AppImage` sont produites en CI. Les tests unitaires et E2E passent sur chaque plateforme, et les particularités (permissions micro et MIDI, ports série `/dev/tty.*`) sont gérées.

**Travaux à effectuer.**

1. Ajouter les cibles à `electron-builder.yml`.
2. Ajouter une matrice de CI.
3. Vérifier `serialport` (`asarUnpack`) et les permissions macOS (`NSMicrophoneUsageDescription`).

**Critères d’acceptation.**

- [ ] Les E2E passent sur macOS et Linux en CI.

**Tests requis.**

- CI multiplateforme.

**Dépendances.** [LUMA-008](#luma-008), [LUMA-038](#luma-038)

**Effort estimé.** L

**Impact attendu.** moyen

**Risques et précautions.** Le coût de la signature Apple, et la précision des minuteurs propre à chaque système (LUMA-007).

#### LUMA-083

- **ID** : LUMA-083
- **Titre** : Importer les profils QLC+ (`.qxf`)
- **Catégorie** : Profils de projecteurs / interopérabilité
- **Nature** : E — Capacité future
- **Statut actuel** : ABSENT
- **Priorité** : P3
- **Type** : fonctionnalité
- **Phase** : 5

**Constat technique.** L’import de profils gère les profils Luma (JSON), GDTF, grandMA2 (XML) et Open Fixture Library (en ligne ou fichier). QLC+ est explicitement refusé. Le parseur XML (`fast-xml-parser`) et le mécanisme de fusion de modes (`mergeProfileModes`) sont déjà présents.

**Preuves dans le code.**

- `src/core/app/handlers/fixtures.ts:24` : refus de `.qxf`.
- `src/core/fixtures/ma2.ts:1` : `fast-xml-parser`.
- `src/core/app/handlers/fixtures.ts:5` : `mergeProfileModes`.

**Problème ou opportunité.** La bibliothèque QLC+ est l’une des plus utilisées par le public amateur et semi-professionnel visé.

**Résultat attendu.** Un fichier `.qxf` est converti en profil Luma (modes, canaux, plages avec types : gobo, couleur, strobe, réglages dangereux). Les avertissements de conversion sont affichés comme pour grandMA2.

**Travaux à effectuer.**

1. Écrire `src/core/fixtures/qlc.ts` (`convertQlcFixture`) sur le modèle de `ma2.ts`.
2. Ajouter des fichiers d’exemple réels dans `tests/fixtures/qlc/`.
3. Rétablir le filtre de dialogue (voir LUMA-029).

**Critères d’acceptation.**

- [ ] Trois profils QLC+ réels (PAR, lyre, barre LED) sont convertis sans erreur, avec un nombre de canaux exact.

**Tests requis.**

- Unitaires de conversion, sur le modèle de `tests/unit/ma2.test.ts`.

**Dépendances.** [LUMA-029](#luma-029)

**Effort estimé.** M

**Impact attendu.** moyen

**Risques et précautions.** Une mauvaise classification des plages « dangereuses » (lampe éteinte, reset) contournerait la protection de rendu : à tester explicitement.

## 11. Dépendances entre éléments

Une flèche `A → B` signifie que B ne doit pas être livré avant A. Les éléments absents de cette liste sont indépendants.

```text
LUMA-004, LUMA-005 → LUMA-007
LUMA-009 → LUMA-008
LUMA-012 → LUMA-013
LUMA-009 → LUMA-031
LUMA-002, LUMA-037 → LUMA-038
LUMA-018 → LUMA-033
LUMA-008 → LUMA-035
LUMA-018 → LUMA-043
LUMA-008, LUMA-007 → LUMA-046
LUMA-021 → LUMA-052
LUMA-039 → LUMA-040
LUMA-005 → LUMA-048
LUMA-032 → LUMA-050
LUMA-008 → LUMA-084
LUMA-031, LUMA-073 → LUMA-053
LUMA-041 → LUMA-059
LUMA-042 → LUMA-061
LUMA-001 → LUMA-062
LUMA-061 → LUMA-063
LUMA-031 → LUMA-068
LUMA-041 → LUMA-070
LUMA-004, LUMA-005, LUMA-007, LUMA-036 → LUMA-071
LUMA-073 → LUMA-072
LUMA-006 → LUMA-075
LUMA-017, LUMA-018 → LUMA-077
LUMA-037, LUMA-038 → LUMA-078
LUMA-021, LUMA-071 → LUMA-079
LUMA-064 → LUMA-081
LUMA-008, LUMA-038 → LUMA-082
LUMA-029 → LUMA-083
```

**Chaînes critiques**

- Temps réel : LUMA-004 + LUMA-005 → LUMA-007 → LUMA-046 et, si nécessaire, LUMA-071 → LUMA-079.
- Qualité : LUMA-009 → LUMA-008 → LUMA-035, LUMA-046, LUMA-082, LUMA-084.
- Édition sûre : LUMA-009 → LUMA-031 → LUMA-053 (avec LUMA-073) ; LUMA-073 → LUMA-072.
- Matériel : LUMA-002 + LUMA-037 → LUMA-038 → LUMA-078, LUMA-082.
- IA : LUMA-012 → LUMA-013 ; LUMA-039 → LUMA-040 ; LUMA-041 → LUMA-059, LUMA-070.
- Paramètres : LUMA-017 + LUMA-018 → LUMA-077 ; LUMA-018 → LUMA-033, LUMA-043.

## 12. Stratégie globale de tests et de validation

### Niveaux de tests

- Unitaires (Vitest, environnement Node) pour toute logique du cœur : chaque handler, chaque branche d’erreur, avec `AppService` sans démarrage automatique (`autoStart: false`, `logDir: false`).
- Tests de propriété pour les invariants : intégrité référentielle après suppressions, sûreté de l’armement des sorties, aller-retour annulation et rétablissement, synchronisation des événements incrémentaux.
- Intégration (`tests/integration`) pour les parcours multi-domaines sans Electron.
- Composants (Testing Library + jsdom) pour le rendu, avec `window.luma` simulé ; le rendu 3D (Three.js) est exclu.
- E2E (Playwright + Electron) pour les parcours utilisateurs réels, y compris plusieurs fenêtres, fenêtre réduite et redémarrage avec un profil `LUMA_USER_DATA` préparé.
- Performance (`tests/perf`, exécution sans parallélisme) : gigue, coût d’un tick, coût d’une mutation, avec des seuils documentés par plateforme.
- Évaluation IA (`tests/eval`) : mode local et réponses OpenRouter rejouées hors ligne ; toute violation de sécurité est bloquante, et les scores suivent un cliquet.
- Validation matérielle instrumentée (`hardware.report`), archivée par interface.

### Exigences transverses

- Chaque correction de bug est livrée avec un test qui échoue sans la correction.
- Toute nouvelle commande IPC a un test de schéma (entrées invalides refusées avec un message structuré), un test de handler et un consommateur réel.
- Toute fonction de sécurité (garde-fou photosensible, valeurs dangereuses, armement, STOP, localisation) a un test explicite de non-régression, et aucune réduction de sensibilité n’est acceptée sans décision documentée.
- Les seuils de couverture fonctionnent comme un cliquet : ils peuvent monter, jamais descendre sans justification écrite dans la pull request.
- Les tests ne dépendent ni du réseau, ni d’une clé API, ni du matériel ; les horloges sont injectées ou simulées.

### Exécution

- CI sur chaque push et chaque pull request : typecheck, lint (taille et i18n), tests, couverture et conventions de commit.
- E2E et performance quotidiens, ou à la demande, sur un runner Windows dédié ; obligatoires avant une release (LUMA-046).
- Rapports (couverture, `ai-eval.json`, captures E2E, profils de performance) publiés en artefacts.

## 13. Critères de sortie par phase

### Phase 0 — Sûreté du show et porte qualité

- LUMA-001, LUMA-002, LUMA-003 et LUMA-006 livrés, chacun avec son test de non-régression.
- `npm run test:coverage` vert, avec les seuils appliqués (LUMA-009), et exécuté en CI (LUMA-008).
- `npm run test:perf` vert dix fois de suite sur la machine de référence, ou seuil par plateforme justifié par une mesure (LUMA-007).
- Aucune lecture disque de `secrets.json` pendant le fonctionnement nominal (LUMA-004).

### Phase 1 — Fermeture des parcours incomplets

- Toutes les commandes du schéma `commandSchema` ont un consommateur (interface, OSC, télécommande ou test), ce que vérifie un test automatique de couverture des routes.
- Aucune référence orpheline après les suppressions de liste de cues, d’effet, de scène, de groupe et de projecteur (test de propriété).
- Les scénarios de concurrence de LUMA-014, LUMA-017 et LUMA-018 sont couverts par des tests.
- Le dialogue de récupération au démarrage est vérifié en E2E (LUMA-011).

### Phase 2 — Fiabilisation et couverture de tests

- Couverture de `src/core/app/handlers/**` d’au moins 85 % des lignes et 75 % des branches.
- `src/main/**` et `src/renderer/**` inclus dans la couverture, avec des seuils mesurés.
- Chaque type de sortie réelle dispose d’un rapport de session matérielle archivé, ou est marqué « expérimental » dans l’interface.
- La release refuse une version stable non signée ou avec des E2E en échec (LUMA-046).

### Phase 3 — Améliorations fonctionnelles à fort impact

- Toute commande de mutation du projet est annulable (test de propriété de LUMA-053).
- `check-i18n` au plus 100 textes en dur, et les messages du cœur sont traduits pour les 20 commandes les plus utilisées.
- Les bancs d’évaluation FR et EN sont verts, chacun au-dessus de sa référence mesurée.

### Phase 4 — Évolutions structurelles

- P95 de la gigue sous 2 ms avec 50 mutations par seconde sur un projet de 1 000 projecteurs (si LUMA-071 est engagé).
- Taille moyenne d’un événement de projet après une mutation simple inférieure à 10 % de l’état complet.
- Plus aucun commentaire `shortcut:` ouvert dans `src/renderer` relatif aux workers et worklets.

### Phase 5 — Capacités futures

- Chaque capacité livrée dispose de tests unitaires, d’un scénario E2E et d’un réglage désactivable.
- Les builds de chaque plateforme passent les E2E en CI (LUMA-082).

## 14. Conditions générales pour déclarer un élément terminé

- Tous les critères d’acceptation de la fiche sont cochés et vérifiés par un test ou une procédure reproductible.
- Le parcours est raccordé de bout en bout : déclencheur dans l’interface, l’OSC ou la télécommande, validation, traitement, persistance éventuelle, retour visible pour l’utilisateur. Un code qui compile ou une interface affichée ne suffit pas.
- Les entrées invalides et les erreurs sont gérées : `UserError` explicite pour l’utilisateur, journalisation pour les erreurs internes, aucune promesse rejetée non gérée.
- Les règles de sûreté sont respectées : rien ne s’arme seul, STOP et blackout restent prioritaires, les valeurs dangereuses restent filtrées, et le garde-fou n’est pas affaibli.
- Les messages d’interface passent par les catalogues i18n FR et EN (le cliquet `check-i18n` ne monte pas).
- Typecheck, lint, tests et couverture sont verts en CI ; les E2E concernés sont verts.
- Le comportement est observable : un journal à un niveau adapté, et une métrique ou un diagnostic si l’élément touche au temps réel ou au matériel.
- Les formats persistés modifiés ont une migration et un test de compatibilité ascendante.
- Le statut de l’élément est mis à jour dans cette feuille de route (fiche et index).

## 15. Index des éléments

| ID | Titre | Priorité | Statut | Phase | Effort |
|---|---|---|---|---|---|
| [LUMA-001](#luma-001) | Empêcher la double exécution des commandes MIDI quand la fenêtre 3D détachée est ouverte | P0 | PARTIELLEMENT IMPLÉMENTÉ | 0 | S |
| [LUMA-002](#luma-002) | Corriger le limiteur de cadence par sortie, qui divise par deux la fréquence DMX effective | P1 | PARTIELLEMENT IMPLÉMENTÉ | 0 | S |
| [LUMA-003](#luma-003) | Libérer la séquence de localisation caméra et la mire de test quand le rendu disparaît | P1 | ABSENT | 0 | S |
| [LUMA-004](#luma-004) | Supprimer la lecture et le déchiffrement synchrones de la clé API dix fois par seconde | P1 | PARTIELLEMENT IMPLÉMENTÉ | 0 | XS |
| [LUMA-005](#luma-005) | Limiter le flot d’erreurs répétées du moteur dans le journal et les alertes | P1 | PARTIELLEMENT IMPLÉMENTÉ | 0 | S |
| [LUMA-006](#luma-006) | Garantir que l’analyse audio réactive continue quand la fenêtre principale est masquée ou réduite | P1 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | 0 | S |
| [LUMA-007](#luma-007) | Ramener la gigue de l’ordonnanceur sous le seuil du test de performance (p95 < 2 ms) | P1 | PARTIELLEMENT IMPLÉMENTÉ | 0 | M |
| [LUMA-008](#luma-008) | Mettre en place une intégration continue Windows (typecheck, lint, tests, conventions de commit) | P1 | ABSENT | 0 | S |
| [LUMA-009](#luma-009) | Rendre `npm run test:coverage` fiable (délai des hooks sous instrumentation) | P1 | PARTIELLEMENT IMPLÉMENTÉ | 0 | XS |
| [LUMA-010](#luma-010) | Raccorder la commande « Tout relâcher » (`engine.releaseAll`) à l’interface, à l’OSC et à la télécommande | P1 | PRÉSENT MAIS NON RACCORDÉ | 1 | S |
| [LUMA-011](#luma-011) | Proposer la récupération du travail au démarrage après une fermeture anormale | P1 | PARTIELLEMENT IMPLÉMENTÉ | 1 | M |
| [LUMA-012](#luma-012) | Permettre l’annulation d’une requête IA ou d’une génération de show en cours | P2 | ABSENT | 1 | M |
| [LUMA-013](#luma-013) | Remplacer la barre de progression simulée de la génération de show par une progression réelle | P2 | PARTIELLEMENT IMPLÉMENTÉ | 1 | S |
| [LUMA-014](#luma-014) | Protéger la génération de show contre les modifications concurrentes du projet pendant l’appel IA | P2 | PARTIELLEMENT IMPLÉMENTÉ | 1 | S |
| [LUMA-015](#luma-015) | Nettoyer les réactions audio qui pointent vers une liste de cues supprimée | P2 | PARTIELLEMENT IMPLÉMENTÉ | 1 | XS |
| [LUMA-016](#luma-016) | Rendre annulable l’application des positions issues de la localisation caméra | P2 | PARTIELLEMENT IMPLÉMENTÉ | 1 | XS |
| [LUMA-017](#luma-017) | Éviter l’écrasement de paramètres modifiés ailleurs lors de `settings.update` | P2 | PARTIELLEMENT IMPLÉMENTÉ | 1 | S |
| [LUMA-018](#luma-018) | Sérialiser les écritures atomiques concurrentes sur un même fichier | P2 | PARTIELLEMENT IMPLÉMENTÉ | 1 | S |
| [LUMA-019](#luma-019) | Signaler un échec d’enregistrement déclenché par la fermeture de la fenêtre | P2 | PARTIELLEMENT IMPLÉMENTÉ | 1 | S |
| [LUMA-020](#luma-020) | Permettre de supprimer un profil de la bibliothèque utilisateur depuis l’interface | P2 | PRÉSENT MAIS NON RACCORDÉ | 1 | S |
| [LUMA-021](#luma-021) | Reconstituer l’état des listes de cues après un saut de timeline (seek ou poursuite de timecode) | P2 | PARTIELLEMENT IMPLÉMENTÉ | 1 | M |
| [LUMA-022](#luma-022) | Ne plus accumuler dans le projet les définitions d’effets créées par chaque proposition IA | P2 | PARTIELLEMENT IMPLÉMENTÉ | 1 | S |
| [LUMA-023](#luma-023) | Rendre l’application d’une proposition IA atomique et annulable en une étape | P2 | PARTIELLEMENT IMPLÉMENTÉ | 1 | M |
| [LUMA-024](#luma-024) | Vérifier et corriger le plein écran F11 de la fenêtre 3D détachée face au filtre de permissions | P2 | À INVESTIGUER | 1 | XS |
| [LUMA-025](#luma-025) | Supprimer une timeline n’arrête que la lecture de cette timeline | P3 | PARTIELLEMENT IMPLÉMENTÉ | 1 | XS |
| [LUMA-026](#luma-026) | Retirer du moteur les playbacks de listes de cues supprimées | P3 | PARTIELLEMENT IMPLÉMENTÉ | 1 | XS |
| [LUMA-027](#luma-027) | Revalider une proposition IA contre l’état courant du projet au moment de l’appliquer | P3 | PARTIELLEMENT IMPLÉMENTÉ | 1 | S |
| [LUMA-028](#luma-028) | Ne pas marquer le projet comme modifié pour une simple requête IA non appliquée | P3 | PARTIELLEMENT IMPLÉMENTÉ | 1 | XS |
| [LUMA-029](#luma-029) | Retirer de la boîte d’import le filtre QLC+ annoncé mais refusé | P3 | ABSENT | 1 | XS |
| [LUMA-030](#luma-030) | Nettoyer les fichiers audio, le cache IA et les copies de récupération orphelins | P3 | ABSENT | 1 | M |
| [LUMA-031](#luma-031) | Couvrir par des tests le handler de programmation (groupes, palettes, scènes, cues, effets, timelines) | P1 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | 2 | M |
| [LUMA-032](#luma-032) | Tester le processus principal : garde IPC, magasin de secrets et flux de fermeture | P1 | ABSENT | 2 | M |
| [LUMA-033](#luma-033) | Tester l’autosauvegarde et la liste des projets récents | P2 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | 2 | S |
| [LUMA-034](#luma-034) | Tester les réactions audio (flash sur le temps, couleur selon l’énergie, suiveurs, GO sur drop armé) | P2 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | 2 | S |
| [LUMA-035](#luma-035) | Étendre la couverture et les tests de composants au code de rendu | P2 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | 2 | L |
| [LUMA-036](#luma-036) | Tester la machine d’états des sorties (reconnexion avec backoff, fermeture pendant reconnexion, désarmement) | P2 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | 2 | M |
| [LUMA-037](#luma-037) | Rendre l’adaptateur Enttec Pro injectable et le tester avec un port série simulé | P2 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | 2 | S |
| [LUMA-038](#luma-038) | Mener la campagne de validation matérielle (Enttec Pro, Open DMX, RDM Art-Net, nœuds Art-Net et sACN) | P1 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | 2 | L |
| [LUMA-039](#luma-039) | Ajouter une reprise contrôlée des appels OpenRouter sur 429, 5xx et erreurs réseau transitoires | P2 | ABSENT | 2 | S |
| [LUMA-040](#luma-040) | Relancer une fois le modèle avec les erreurs de validation quand sa réponse ne respecte pas le schéma | P3 | ABSENT | 2 | S |
| [LUMA-041](#luma-041) | Évaluer le chemin OpenRouter avec un banc rejoué hors ligne | P2 | PARTIELLEMENT IMPLÉMENTÉ | 2 | M |
| [LUMA-042](#luma-042) | Limiter le débit des paquets OSC invalides ou inconnus et leur impact sur le journal | P2 | PARTIELLEMENT IMPLÉMENTÉ | 2 | S |
| [LUMA-043](#luma-043) | Rendre les écritures atomiques durables (fsync) et tolérantes aux verrous de fichiers Windows | P2 | PARTIELLEMENT IMPLÉMENTÉ | 2 | S |
| [LUMA-044](#luma-044) | Transformer les lectures hors bornes du lecteur ZIP en erreurs `ZipError` explicites | P3 | PARTIELLEMENT IMPLÉMENTÉ | 2 | XS |
| [LUMA-045](#luma-045) | Récupérer partiellement un fichier de paramètres invalide au lieu de tout réinitialiser | P2 | PARTIELLEMENT IMPLÉMENTÉ | 2 | S |
| [LUMA-046](#luma-046) | Renforcer la porte de release : tests de performance, E2E, signature de code et vérification de l’installeur | P2 | PARTIELLEMENT IMPLÉMENTÉ | 2 | S |
| [LUMA-047](#luma-047) | Retirer du diagnostic exporté les chemins personnels et les noms d’utilisateur | P3 | PARTIELLEMENT IMPLÉMENTÉ | 2 | XS |
| [LUMA-048](#luma-048) | Historiser les métriques du moteur et des sorties pour diagnostiquer un incident après coup | P3 | PARTIELLEMENT IMPLÉMENTÉ | 2 | M |
| [LUMA-049](#luma-049) | Mesurer et journaliser les commandes IPC lentes | P3 | ABSENT | 2 | XS |
| [LUMA-050](#luma-050) | Ne plus effacer silencieusement les autres secrets quand `secrets.json` est illisible | P3 | PARTIELLEMENT IMPLÉMENTÉ | 2 | XS |
| [LUMA-051](#luma-051) | Borner la mémoire des limiteurs de la télécommande par adresse IP | P3 | PARTIELLEMENT IMPLÉMENTÉ | 2 | XS |
| [LUMA-052](#luma-052) | Tester de bout en bout la chaîne timecode (MTC et LTC dans le rendu vers la poursuite de timeline) et la perte de signal | P2 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | 2 | S |
| [LUMA-053](#luma-053) | Étendre l’annulation et le rétablissement à toutes les éditions du projet | P1 | PARTIELLEMENT IMPLÉMENTÉ | 3 | L |
| [LUMA-054](#luma-054) | Internationaliser les messages du cœur et les dialogues du processus principal | P2 | PARTIELLEMENT IMPLÉMENTÉ | 3 | L |
| [LUMA-055](#luma-055) | Résorber les 782 textes d’interface écrits en dur dans le rendu | P2 | PARTIELLEMENT IMPLÉMENTÉ | 3 | L |
| [LUMA-056](#luma-056) | Mesurer et améliorer la compréhension des requêtes en anglais par l’interpréteur local | P2 | IMPLÉMENTÉ, VALIDATION INSUFFISANTE | 3 | M |
| [LUMA-057](#luma-057) | Découvrir automatiquement les nœuds Art-Net du réseau (ArtPoll et ArtPollReply) | P2 | ABSENT | 3 | M |
| [LUMA-058](#luma-058) | Suivre la consommation de jetons et le coût des appels OpenRouter | P2 | ABSENT | 3 | S |
| [LUMA-059](#luma-059) | Donner à l’IA distante le contexte des derniers échanges pour les demandes de raffinement | P2 | PARTIELLEMENT IMPLÉMENTÉ | 3 | M |
| [LUMA-060](#luma-060) | Exporter et importer un projet « paquet » qui embarque les fichiers audio des morceaux | P2 | PARTIELLEMENT IMPLÉMENTÉ | 3 | M |
| [LUMA-061](#luma-061) | Restreindre l’OSC réseau à une liste d’adresses autorisées | P2 | ABSENT | 3 | S |
| [LUMA-062](#luma-062) | Étendre le MIDI : faders vers niveaux de playback et d’effets, et retour d’état vers les contrôleurs | P3 | PARTIELLEMENT IMPLÉMENTÉ | 3 | M |
| [LUMA-063](#luma-063) | Publier l’état du show en OSC (retour d’état pour TouchOSC, QLab et autres) | P3 | PARTIELLEMENT IMPLÉMENTÉ | 3 | S |
| [LUMA-064](#luma-064) | Implémenter la découverte d’univers sACN (E1.31 §8) et la synchronisation optionnelle | P3 | PARTIELLEMENT IMPLÉMENTÉ | 3 | S |
| [LUMA-065](#luma-065) | Importer une implantation MVR (patch et positions) depuis Capture, Vectorworks ou grandMA3 | P3 | ABSENT | 3 | L |
| [LUMA-066](#luma-066) | Appairer la télécommande par QR code | P3 | PARTIELLEMENT IMPLÉMENTÉ | 3 | S |
| [LUMA-067](#luma-067) | Afficher l’état des sorties et les alertes critiques sur la télécommande | P3 | PARTIELLEMENT IMPLÉMENTÉ | 3 | XS |
| [LUMA-068](#luma-068) | Proposer un mode « tracking » optionnel pour les listes de cues | P3 | ABSENT | 3 | M |
| [LUMA-069](#luma-069) | Rendre le plan de scène 2D utilisable au clavier et par les lecteurs d’écran | P3 | PARTIELLEMENT IMPLÉMENTÉ | 3 | M |
| [LUMA-070](#luma-070) | Faire évoluer le contrat d’actions IA en v2 pour exposer les effets récents (fan, suiveurs de bandes) | P3 | PARTIELLEMENT IMPLÉMENTÉ | 3 | S |
| [LUMA-071](#luma-071) | Isoler le moteur temps réel et les sorties DMX hors de la boucle d’événements du processus principal | P2 | PARTIELLEMENT IMPLÉMENTÉ | 4 | XL |
| [LUMA-072](#luma-072) | Diffuser des changements incrémentaux du projet au lieu de l’état complet à chaque mutation | P2 | PARTIELLEMENT IMPLÉMENTÉ | 4 | L |
| [LUMA-073](#luma-073) | Réduire le coût de chaque mutation (clonage et revalidation complète du projet) | P2 | PARTIELLEMENT IMPLÉMENTÉ | 3 | M |
| [LUMA-074](#luma-074) | Déporter l’analyse musicale dans un Web Worker | P3 | PARTIELLEMENT IMPLÉMENTÉ | 4 | M |
| [LUMA-075](#luma-075) | Migrer le décodage LTC et l’analyse audio en direct vers un AudioWorklet | P3 | PARTIELLEMENT IMPLÉMENTÉ | 4 | M |
| [LUMA-076](#luma-076) | Réduire le coût par tick de la surveillance photosensible | P3 | PARTIELLEMENT IMPLÉMENTÉ | 4 | S |
| [LUMA-077](#luma-077) | Centraliser les modifications de `app.settings` dans une seule fonction transactionnelle | P3 | PARTIELLEMENT IMPLÉMENTÉ | 4 | S |
| [LUMA-078](#luma-078) | Prendre en charge le RDM via l’interface Enttec DMX USB Pro | P3 | ABSENT | 4 | L |
| [LUMA-079](#luma-079) | Lire plusieurs timelines simultanément (couches indépendantes) | P3 | ABSENT | 5 | L |
| [LUMA-080](#luma-080) | Ajouter un mode « show verrouillé » qui interdit les éditions pendant l’exploitation | P3 | ABSENT | 5 | S |
| [LUMA-081](#luma-081) | Proposer une redondance de sortie par machine de secours sACN | P3 | ABSENT | 5 | L |
| [LUMA-082](#luma-082) | Construire et valider les versions macOS et Linux | P3 | ABSENT | 5 | L |
| [LUMA-083](#luma-083) | Importer les profils QLC+ (`.qxf`) | P3 | ABSENT | 5 | M |
| [LUMA-084](#luma-084) | Retirer de la CSP de production l’autorisation de connexion WebSocket vers localhost | P3 | PARTIELLEMENT IMPLÉMENTÉ | 2 | XS |

