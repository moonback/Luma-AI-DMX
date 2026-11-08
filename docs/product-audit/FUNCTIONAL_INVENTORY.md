# Inventaire fonctionnel — Luma-AI-DMX 1.9.0

> Audit du 2026-11-08, commit `8467bfc`. La grille de statut (opérationnel / partiel / simulé / déclaratif / inexistant) est définie dans [SONG_TO_SHOW_AUDIT.md §0](SONG_TO_SHOW_AUDIT.md).
> **Méthode.** Pour chaque fonction, le chemin UI → commande (`src/shared/commands.ts`) → handler (`src/core/app/handlers/*`) → moteur (`src/core/engine`) → sortie (`src/core/protocols`) a été suivi. Un statut « opérationnel » signifie que ce chemin est complet dans le code et couvert par des tests. Il ne remplace pas un essai sur du matériel réel, qui n'a pas été fait dans cet audit.

## 1. Vue d'ensemble

| Indicateur | Valeur mesurée |
|---|---|
| Code source (hors tests) | ≈ 40 700 lignes TS/TSX, 232 fichiers |
| Pages de navigation | 15 (4 groupes : Live, Créer, Scène, Configuration) |
| Commandes IPC typées | ≈ 110 (union zod discriminée, validées dans le main) |
| Tests | 58 unitaires, 11 composants, 2 intégration, 4 eval IA, 3 perf, 2 e2e Playwright |
| Langues UI | FR / EN (vérification i18n en lint) |
| Dépendances runtime | 10 (dont `serialport`, `three`, `zod`, `zustand`, `@google/genai`, `fast-xml-parser`) |

**Architecture.** Electron avec un **cœur métier pur** dans `src/core` (sans DOM, testable), un `AppService` qui route les commandes par domaine (`routes.ts`, contrôle exhaustif à la compilation), un moteur DMX cadencé dans le main (10-44 Hz, 40 Hz par défaut) et un renderer React + zustand. Limite de taille : 600 lignes par fichier, 400 dans `core/app` (`scripts/check-file-size.mjs`). Cette base est saine et permet des évolutions ciblées **sans réécriture**.

## 2. Pages et écrans

| Page (id) | Libellé FR | Rôle | Statut | Remarques vérifiées |
|---|---|---|---|---|
| `dashboard` | Tableau de bord | KPI (machines, univers, sortie, protocoles, cue active, BPM, charge moteur, IA), actions rapides, alertes, scène depuis un texte | Opérationnel | Les KPI affichent leur **source** (persisté / mesuré / estimé / config) : excellente pratique d'honnêteté. |
| `console` | « Console Live » (espace final dans la clé i18n) | Programmer complet : attributs, couleur, palettes, groupes, enregistrement de scène | Opérationnel | 491 lignes. |
| `pantilt` | Console Simplifiée | Tuiles de machines, sélection multiple, modal par famille, groupes | Opérationnel | L'id `pantilt` ne correspond plus au rôle. Mode verrouillé au démarrage (`simpleConsoleOnStart`). |
| `programmer` | Programmer (non traduit) | Scènes, palettes, groupes (CRUD, aperçu, chargement) | Opérationnel | Recoupe en partie `console`. |
| `cues` | Cues | Cue lists, GO / BACK / GOTO / pause, déclencheurs manuel / follow | Opérationnel | |
| `quick` | Actions rapides | Boutons configurables (cue, scène, effet, palette, couleur) | Opérationnel | |
| `effects` | Effets | 13 types d'effets, démarrer / pause / arrêt / tout arrêter | Partiel | Formes `pingpong` / `zigzag` du schéma non rendues (`computeEffect`). |
| `timeline` | Timeline | Éditeur 6 pistes, glisser / redimensionner, annuler / rétablir local, lecture / seek | Opérationnel | Libellés `KIND_LABELS` codés en dur en français. Les retouches sur une timeline générée sont effacées à la régénération. |
| `ai` | Directeur IA | Conversation → proposition validée → aperçu → application → annulation | Opérationnel | Voir [AI_FEATURE_AUDIT.md](AI_FEATURE_AUDIT.md). |
| `music` | Show Musique | Song to Show | Partiel | Voir [SONG_TO_SHOW_AUDIT.md](SONG_TO_SHOW_AUDIT.md). |
| `visualizer` | Visualiseur (2D / 3D) | Plan de scène 2D, scène 3D Three.js, décor, public, structures, repères, vues | Opérationnel | Le plus gros sous-système UI (stage3d ≈ 3 000 lignes). Peut se détacher dans une fenêtre. |
| `fixtures` | Machines | Patch, ajout en série, bibliothèque, import OFL / GDTF / MA2, export de profil, feuille de patch, export MVR | Opérationnel | |
| `audio` | Audio | Entrée audio live, BPM, réactions (flash sur temps, GO sur montée, GO sur drop prédit, suivi BPM) | Opérationnel | |
| `output` | Sorties | Configuration Art-Net / sACN / ENTTEC Pro / Open DMX / virtuelle, armement, injection, historique virtuel, RDM | Opérationnel | |
| `settings` | Paramètres | 11 onglets en 4 groupes, profils d'espace de travail, stockage, licence, bêta | Opérationnel | 813 lignes : fichier le plus long du renderer. |

Écrans hors navigation : écran de démarrage (`StartScreen`), onboarding (projets de démo), « Quoi de neuf », localisation par caméra (`CameraLocate`), profil depuis une photo (`ProfileFromPhoto`), mini-lecteur, sélecteur de commandes, barre d'état.

## 3. Moteur DMX et programmation

| Fonction | Statut | Fonctionnement réel | Limites |
|---|---|---|---|
| Boucle moteur | Opérationnel | `Engine.tick` cadencé avec mesure de gigue, dépassements et Hz mesurés. Resynchronisation sans rafale après un blocage. | Tourne dans le main process d'Electron, qui partage ses ressources avec l'IPC et l'IA. |
| Fusion des sources | Opérationnel | `mergeSources` : bandes de priorité, HTP pour l'intensité et LTP pour le reste dans une bande, effets `override` / `scale` par-dessus, programmer toujours prioritaire. | Pas de mode **relatif / additif** pour les positions (cf. mouvements Song to Show). |
| Priorités configurables | Opérationnel | `settings.engine.priorities` (IA 60, timeline 40, audio…). | Réglage global, pas par cue list. |
| Programmer | Opérationnel | `programmer.set / setColor / release`. | |
| Groupes, palettes | Opérationnel | CRUD, enregistrement depuis le programmer, application. | |
| Scènes | Opérationnel | Enregistrement, aperçu, chargement, duplication. | |
| Cue lists | Opérationnel | Fade, délai, courbes (linear, easeIn, easeOut, easeInOut, snap), déclencheurs manuel / follow, effets liés. | Pas de **tracking** de cues au sens console pro (chaque cue est une scène complète). |
| Effets | Partiel | 13 types, synchro BPM, `barSync` sur les temps forts audio, déterministes (graine). | `pingpong` / `zigzag` déclaratifs. Pas d'éditeur de forme (courbe libre, keyframes). |
| Timeline | Opérationnel | Événements scène / effet / cue / repère, poursuite de timecode (MTC, LTC, OSC, lecteur interne). | Le BPM des effets est celui du moteur, pas celui de la timeline. |
| Blackout et master | Opérationnel | 3 politiques de blackout (intensity, intensity-shutter, all-zero). | |
| Motif de test | Opérationnel | `output.testPattern` (`engine/testPattern.ts`). | |
| Garde-fou photosensible | Opérationnel | Modèle Harding / ITU-R BT.1702 approché (au plus 3 flashes/s), modes off / warn / limit. Limitation du slew en mode `limit`. | Le code le dit lui-même : « estimate … not a certification ». Mode `warn` par défaut. |

## 4. Machines et patch

| Fonction | Statut | Remarques |
|---|---|---|
| Profils intégrés | Opérationnel | `builtinProfiles.ts` (244 lignes). |
| Import OFL (Open Fixture Library) | Opérationnel | En ligne (`ofl.fixtures`, `ofl.manufacturers`) et fichier. |
| Import GDTF | Opérationnel | `gdtf.ts` (283 lignes) via `fast-xml-parser`. |
| Bibliothèque MA2 | Opérationnel | `ma2.ts`, `ma2Library.ts`. |
| Profil depuis photo (IA vision) | Partiel | Nécessite OpenRouter. Le profil est réparé (`repairMode`) puis présenté pour validation : il n'est pas appliqué directement. |
| Patch automatique et contrôle des conflits | Opérationnel | `patch.ts`, le KPI « issues » du Dashboard. |
| Modules multi-têtes et pixels | Opérationnel | `modules.ts`, `colorCells` (barres LED, anneaux). |
| Feuille de patch / plan d'installation | Opérationnel | `patch.exportSheet`, `patch.exportPlan` (bouton optionnel dans la TopBar). |
| Export MVR | Opérationnel | `project/mvr.ts`. **Import MVR inexistant** (aucun `parseMvr`). |
| Localisation des machines par caméra | Partiel | `locate.begin / frame / apply` : chaque machine est allumée tour à tour, détectée sur une photo (smartphone via la télécommande), puis sa position est calculée (`vision/locate.ts`, `geometry.ts`). C'est ingénieux, mais la précision dépend de l'éclairage ambiant et de la calibration. Non mesuré. |
| RDM | Partiel | Découverte, identification et adressage via **Art-Net RDM** (`ArtNetRdm`, `rdm.ts`, 280 lignes ; `handlers/output.ts` `withRdm`). Pas de lecture de capteurs ni des paramètres étendus. Pas de RDM via les interfaces USB. |

## 5. Sorties et intégrations

| Intégration | Statut | Remarques |
|---|---|---|
| Sortie virtuelle | Opérationnel | Historique consultable (`output.virtualHistory`). |
| Art-Net | Opérationnel | `artnet.ts`. **Pas d'ArtPoll** (aucune occurrence dans `core/protocols`) : pas de découverte des nœuds. Le choix de l'interface réseau existe (`output.interfaces`). |
| sACN (E1.31) | Opérationnel | CID persistant, priorité de paquet bornée 0-200 (`buildSacnPacket`). |
| ENTTEC DMX USB Pro | Opérationnel | `serialport`. |
| Open DMX (FTDI) | Opérationnel | Le timing logiciel est réputé fragile sous Windows (connaissance générale, non mesurée ici). Mieux vaut le présenter comme « dépannage ». |
| Armement / désarmement / transmission | Opérationnel | `output.arm / disarm / transmit`, option `autoArmOnStart` (désactivée par défaut, c'est le bon choix). |
| MIDI (notes / CC → actions, apprentissage) | Opérationnel | Web MIDI dans le renderer, front montant seulement. |
| MIDI Time Code | Opérationnel | `MtcDecoder`. |
| LTC (entrée audio) | Opérationnel | `LtcDecoder` via `ScriptProcessorNode`, une API **dépréciée** : à migrer vers `AudioWorklet`. |
| OSC (UDP) | Opérationnel | Serveur, liste d'IP autorisées, retour vers des hôtes, accusés de réception. |
| Télécommande web (tablette) | Opérationnel | HTTP + SSE, jeton échangé contre un cookie HttpOnly, limitation de débit, sous-ensemble de commandes sans armement de sortie. Bonne conception sécurité. |
| Mise à jour automatique | Opérationnel | `electron-updater`, canaux stable / bêta. |
| Licence (Ed25519) | Opérationnel | `assertAllowed` sur chaque commande. Paliers Starter / Standard / Pro. |
| Télémétrie d'usage | Opérationnel | Locale, désactivée par défaut. |

## 6. Audio

| Fonction | Statut | Remarques |
|---|---|---|
| Entrée audio live | Opérationnel | Choix du périphérique, sensibilité, lissage. |
| BPM live | Opérationnel | `TempoTracker` : autocorrélation, filtre de Kalman, correction par tap. |
| Réactions audio | Opérationnel | Flash sur temps, GO sur montée d'énergie, suivi BPM (désactivé par défaut), GO sur drop prédit (armement explicite, un seul tir). |
| Prédiction de drop live | Partiel | Logistique pondérée à la main, sans modèle entraîné : le code le documente honnêtement. |
| Effets suiveurs de bandes | Opérationnel | `bassFollow`, `brightnessColor`. Aucune sortie sans audio frais. |

## 7. Projet, données, fiabilité

| Fonction | Statut | Remarques |
|---|---|---|
| Format de projet versionné + zod | Opérationnel | `PROJECT_FORMAT_VERSION`, erreurs typées (`ProjectLoadError`). |
| Sauvegarde auto et récupération | Opérationnel | `autosaveMinutes`, `project.listRecovery / openRecovery`. |
| Projets de démo | Opérationnel | ≈ 2 000 lignes de catalogue (`core/demo`). |
| Annulation globale | Partiel | `history.ts` (`HISTORY_MAX`) au niveau du projet, plus des piles locales (timeline, visualiseur) qui gardent leur propre Ctrl+Z. Deux modèles coexistent. |
| Export de projet | Partiel | JSON seul : **l'audio des morceaux n'est pas inclus**. |
| Diagnostic exportable | Opérationnel | `diagnostic.export`, `feedback.export` (chemins personnels masqués par `maskHome`). |
| Rapport de stockage et purge | Opérationnel | Musique (avec fichiers orphelins), cache IA, sauvegardes automatiques. |

## 7 bis. Fiche synthétique par fonctionnalité : dépendances, ergonomie, potentiel

Cette fiche complète les tableaux ci-dessus avec les trois attributs restants de la Phase 1. Les renvois C-, F-, IA- et UX- pointent vers [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md), [FEATURE_IDEAS.md](FEATURE_IDEAS.md), [AI_FEATURE_AUDIT.md](AI_FEATURE_AUDIT.md) et [UX_UI_IMPROVEMENTS.md](UX_UI_IMPROVEMENTS.md).

| Fonctionnalité | Objectif | Dépendances principales | Ergonomie (constat) | Potentiel |
|---|---|---|---|---|
| Moteur et fusion | Calculer l'état DMX à chaque tick | `Engine.ts`, `merge.ts`, `attributes.ts`, `resolve.ts` | Invisible, sources affichées par attribut | Positions relatives (F-03), BPM par timeline (F-02) |
| Programmer et consoles | Contrôle manuel | `programmer.*`, `LiveConsole`, `PanTiltConsole`, `Programmer` | 3 surfaces sans frontière claire (UX T1) | Unification des groupes, état « mixte » (UX-CS) |
| Cues | Restitution séquentielle | `playback.ts`, `cueList.*` | Classique, pas de tracking | Feuille de conduite (F-24) |
| Effets | Mouvements et dynamiques | `effects.ts`, `effectParamsSchema` | Paramètres numériques bruts | Formes manquantes (C-02), relatifs (F-03) |
| Timeline | Restitution temporelle, timecode | `timeline.ts`, `Timeline.tsx`, MTC/LTC/OSC | Éditeur correct, libellés FR codés en dur | Protection des retouches (F-09), marqueurs (F-17) |
| Song to Show | Show automatique depuis un morceau | `music/*`, `handlers/music.ts`, `musicPlayer.ts`, OpenRouter (optionnel) | Page dense, intention FR seulement (UX S1-S9) | Voir SONG_TO_SHOW_AUDIT §6 |
| Directeur IA | Lumière en langage naturel | `ai/*`, OpenRouter (optionnel), règles locales | Bon flux proposition → aperçu → application | Rôles (F-04), intention structurée (IA-06) |
| Voix | Contrôle mains libres | Gemini Live (`@google/genai`), clé dédiée | Journalisation verbeuse (C-09) | Copilote live (F-18) |
| Machines et patch | Décrire le kit | `fixtures/*`, OFL en ligne, GDTF/MA2 | Dialogue d'ajout sans aperçu d'univers | Rig Doctor (F-12), import MVR (F-14), rôles (F-04) |
| Visualiseur | Préparer et prévisualiser | `three`, `visualizer/*`, `stage3d/*` | Riche ; Ctrl+Z local | Prévisualisation par section (F-10) |
| Sorties | Émettre le DMX | `protocols/*`, `serialport`, réseau | Armement explicite, bon | ArtPoll (F-20), latence (F-23) |
| Audio live | Réagir à la musique | WebAudio, `TempoTracker`, `DropPredictor` | Réglages techniques, libellés FR codés en dur | Song to Show Live (F-06) |
| Contrôle externe | MIDI, OSC, télécommande | Web MIDI, UDP, HTTP/SSE | Apprentissage MIDI, bon | Surfaces de contrôle préconfigurées |
| Projet | Persister et transporter | `project/*`, `util/zip.ts` | Sauvegarde auto et récupération | Show portable avec audio (F-08) |

## 7 ter. Paramètres de l'application (`core/settings/settings.ts`)

| Groupe | Réglages | Défauts importants pour la sécurité ou l'usage |
|---|---|---|
| `general` | sauvegarde auto, projets récents, confirmations, canal et mises à jour auto, détacher 3D / console au démarrage, armement auto, bouton plan d'installation, console simplifiée au démarrage | `confirmDangerous: true`, `autoArmOnStart: false`, `autosaveMinutes: 2` |
| `onboarding` | terminé, checklist masquée | — |
| `appearance` | mouvement réduit, échelle UI (0,8-1,4), langue FR/EN, visibilité des composants, profils d'espace de travail | `language: 'fr'` |
| `engine` | cadence (10-44 Hz), politique de blackout, strobe max (1-25 Hz), garde-fou flashes, priorités IA / timeline / audio | `rateHz: 40`, `maxStrobeHz: 10`, `flashGuard: 'warn'`, `blackoutPolicy: 'intensity-shutter'` |
| `outputs` | jusqu'à 16 sorties (type, univers, fps) | une sortie virtuelle par défaut |
| `sacn` | CID | généré |
| `ai` | fournisseur, modèle, effort, délai, strobe autorisé, suggestions auto, repli local, budget mensuel | `provider: 'local'`, `allowStrobe: false`, `fallbackToLocal: true` |
| `assistant` | nom, voix, auto-application | `autoApply: false` |
| `audio` | périphérique d'entrée | — |
| `control` | MIDI (mappings), OSC (port, bind, IP autorisées, retours), timecode (off / MTC / LTC), télécommande (port, bind, jeton) | OSC lié à `127.0.0.1` par défaut, télécommande désactivée |
| `logs` | niveau | `info` |
| `telemetry` | usage local | `usage: false` |
| `shortcuts` | raccourcis personnalisés | — |

Les défauts de sécurité sont bien choisis. Ils sont toutefois dispersés entre `engine` et `ai` (voir UX T8, C-13).

## 7 quater. Workflows utilisateur vérifiés

1. **Premier lancement.** Écran de démarrage, onboarding, projet de démo (`project.openDemo`) ou projet vide, checklist « premiers pas » sur le Dashboard.
2. **Préparer un kit.** Machines (ajout ou import OFL / GDTF / MA2 / photo), placement dans le visualiseur (ou localisation par caméra), groupes, sortie configurée puis armée.
3. **Programmer un show classique.** Console Live ou Simplifiée, enregistrement de scènes et palettes (Programmer), cue lists (Cues), Actions rapides, lecture.
4. **Song to Show.** Import du morceau (analyse dans un Worker), intention et curseurs, génération (locale ou LLM), retouche ou verrouillage par section, lecture synchronisée, timeline et cue list disponibles.
5. **Directeur IA.** Demande en texte ou à la voix, proposition validée, aperçu, application, annulation.
6. **Exploitation live.** Audio live (BPM, réactions, armement du drop), cues et actions rapides, mode console simplifiée verrouillé.
7. **Synchro externe.** Timecode MTC / LTC / OSC qui pilote la timeline, MIDI pour les actions, télécommande tablette (jeton).
8. **Maintenance.** Diagnostic exportable, rapport de stockage et purge, journal, mises à jour (stable / bêta).

## 7 quinquies. Fonctionnalités expérimentales ou en bêta

- **Canal de mise à jour bêta** (`updateChannel: 'beta'`) et **panneau Bêta** (`features/settings/BetaPanel.tsx`) avec export de retours (`feedback.export`).
- **Prédiction de drop** live : non entraînée, exécutée seulement sur armement explicite.
- **Profil et décor depuis une photo** : dépendent de la qualité du modèle de vision choisi sur OpenRouter.
- **Localisation par caméra** : précision non mesurée.

## 8. Fonctionnalités dupliquées ou concurrentes

1. **Trois surfaces pour piloter le programmer.** `console` (Console Live), `pantilt` (Console Simplifiée) et `programmer` (scènes, palettes, groupes). Les groupes se créent à trois endroits (`LiveConsole`, `GroupsPanel`, `Programmer`). C'est voulu (débutant / expert), mais la frontière n'est pas expliquée dans l'UI.
2. **Deux scènes générées par texte.** `sceneFromText` (visualiseur et Dashboard, décor de scène) et Directeur IA (lumière). Les noms prêtent à confusion : « scène » désigne à la fois un décor 3D et un état lumineux.
3. **Deux modèles d'annulation** (projet et locaux), cf. §7.
4. **`RigInfo` déclarée deux fois** (`songToShow.ts`, `showPlanner.ts`).
5. **Deux mécanismes d'intention.** Les préréglages de style Song to Show (texte) et les stratégies artistiques (variantes) ne sont pas reliés.

## 9. Code inutilisé ou non consommé (vérifié par grep)

| Élément | Fichier | Constat |
|---|---|---|
| `tempoChanges` | `music/analyze.ts` | Calculé et stocké, jamais lu. |
| `explicitProps` | `music/showPlanner.ts` | Calculé puis `void`. |
| `_hasVocals`, `_confidence` | `music/showPlanner.ts` (`sectionPlan`) | Paramètres ignorés. |
| `vectors` | `music/analyze.ts` (`label`) | `void vectors`. |
| `warnings` | `music/showIntegrity.ts` | Jamais rempli. |
| `encodeLtc` | `control/timecode.ts` | Non utilisé dans `src` (seulement dans `tests/unit/control.test.ts`, `coverage-phase2.test.ts`) : le générateur LTC n'est pas exposé. |
| Formes `pingpong`, `zigzag` | `model/schemas.ts` | Acceptées, non rendues. |
| `phraseBars` | `music/songToShow.ts` | Option du compilateur jamais réglée. |
| `console.log` de debug | `renderer/voice/tools.ts` (11), `voice/session.ts` (17) | Journalisation du texte des demandes en production. |

## 10. Problèmes d'architecture qui freinent les évolutions

1. **Pas de positions relatives dans la fusion.** Impossible de faire « bouger autour d'une visée » sans recoder chaque effet : cela bloque Song to Show, les effets manuels et l'IA.
2. **Le BPM est un état global du moteur.** Une timeline, une cue list ou un effet ne peuvent pas porter leur propre tempo. Cela bloque la synchro multi-morceaux et la setlist.
3. **Le show généré est une copie, pas une vue.** `ShowPlan` et les objets compilés divergent dès la première retouche. Il faut un modèle « généré + surcharges ».
4. **L'audio est hors du projet.** Il manque un conteneur (zip, `core/util/zip.ts` existe déjà) pour un show portable.
5. **Les règles locales d'intention sont écrites en regex françaises.** Une deuxième langue doublerait le code. Une intention structurée (enum) éviterait le problème.
6. **Moteur dans le main process.** C'est acceptable à 40 Hz, mais un utility process (ou Worker) dédié isolerait la sortie DMX des pics IPC et IA. Ce n'est pas urgent : les métriques de gigue existent déjà pour le décider sur des mesures.
