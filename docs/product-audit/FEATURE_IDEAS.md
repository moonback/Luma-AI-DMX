# Catalogue des nouvelles fonctionnalités — Luma-AI-DMX

> Audit du 2026-11-08, commit `8467bfc`. Chaque idée a été confrontée à l'existant (code) et à [`ROADMAP.md`](../../ROADMAP.md) (LUMA-101…150). La colonne **Lien** indique soit `nouveau`, soit l'identifiant LUMA que l'idée précise ou rend concret. Les correctifs de défauts (BPM, mouvements…) ne figurent pas ici : ce sont des corrections, pas des fonctionnalités. Ils sont classés dans [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md).

Complexité : **F** faible (moins d'une semaine), **M** moyenne (1 à 4 semaines), **É** élevée (plus d'un mois).

## Récapitulatif

| ID | Fonctionnalité | Catégorie | Complexité | Lien |
|---|---|---|---|---|
| F-01 | Éditeur de structure musicale (frontières, grille de beats) | Song to Show / Audio | M | nouveau |
| F-02 | BPM et grille par timeline (tempo variable) | Song to Show / DMX | M | nouveau |
| F-03 | Effets de position relatifs (blend « offset ») | Contrôle DMX | M | nouveau |
| F-04 | Rôles de machines déduits | IA / Équipements | M | nouveau |
| F-05 | Profils de style structurés | Song to Show / Création | M | nouveau |
| F-06 | Song to Show Live (DJ, groupe) | Song to Show / Temps réel / Automatisation | É | nouveau |
| F-07 | Setlist enchaînée | Création / Événements / Automatisation | M | nouveau |
| F-08 | Show portable (projet + audio) | Export / Partage | F | précise LUMA-146 |
| F-09 | Retouches protégées (généré + surcharges) | Song to Show | M | nouveau |
| F-10 | Variantes multiples avec audition | Song to Show | M | précise LUMA-118 |
| F-11 | Palettes par harmonie et couleurs de marque | Création / IA | F | nouveau |
| F-12 | Rig Doctor (diagnostic de patch et de profils) | Équipements / Fiabilité | F | nouveau |
| F-13 | Vérification avant spectacle | Préparation / Fiabilité | F | précise LUMA-108 |
| F-14 | Import MVR | Équipements / Pro | M | précise LUMA-146 |
| F-15 | Retargeting de show vers un autre kit | Pro / IA | É | nouveau |
| F-16 | Qualité artistique mesurée sur le rendu | Song to Show / IA | M | nouveau |
| F-17 | Marqueurs de synchro manuels (« hits ») | Song to Show / Automatisation | F | nouveau |
| F-18 | Copilote d'exploitation (bandeau live) | Monitoring / IA | M | nouveau |
| F-19 | Budget de sécurité par lieu | Fiabilité / Pro | F | nouveau |
| F-20 | Découverte Art-Net (ArtPoll) et santé des nœuds | Fiabilité / DMX | M | précise LUMA-107 |
| F-21 | Préférences opérateur apprises localement | IA | M | précise LUMA-115 |
| F-22 | Fournisseur LLM local (compatible OpenAI) | IA | F | précise LUMA-120 |
| F-23 | Compensation de latence audio / DMX | Audio / Temps réel | F | nouveau |
| F-24 | Rapport de show imprimable (feuille de conduite) | Export / Préparation | F | précise LUMA-147 |
| F-25 | Courbe d'énergie éditable | Song to Show | M | nouveau |

---

## F-01 · Éditeur de structure musicale
- **Description.** Poignées de frontière sur `SongStudioTimeline` (glisser, scinder, fusionner), aimantées sur les downbeats, plus une correction de la grille par tap sur le premier temps et le choix 3/4 ou 4/4.
- **Problème.** L'analyse est heuristique (`label()`, `boundaries()`). Quand elle se trompe, l'utilisateur ne peut corriger que le libellé.
- **Exemple.** L'intro détectée mange les 8 premières mesures du couplet : l'opérateur tire la frontière sur la mesure 9 et régénère.
- **Valeur.** Rend Song to Show fiable sur **tous** les morceaux, sans modèle supplémentaire.
- **Faisabilité.** Élevée. `SongAnalysis` est déjà sérialisé dans le projet, et le compilateur ne dépend que de `sections` et `downbeats`.
- **Dépendances.** Nouvelle commande `music.editStructure`. Recalcul des grappes et de l'énergie par section (code de `analyzeAudio` à extraire).
- **Fichiers.** `core/music/analyze.ts`, `handlers/music.ts`, `shared/commands.ts`, `features/music/SongStudioTimeline.tsx`.
- **Risques.** Invalider les plans existants : il faut réindexer les sections verrouillées par plage temporelle.

## F-02 · BPM et grille par timeline
- **Description.** Une timeline porte son `bpm` (et à terme une **carte de tempo**, alimentée par `tempoChanges`). Les effets synchronisés d'une timeline utilisent ce tempo, pas `engine.bpm`.
- **Problème.** Aujourd'hui, les effets de Song to Show tournent au BPM global du moteur (120 par défaut).
- **Exemple.** Un morceau à 128 BPM joué dans un projet à 120 : chases et pulsations restent sur les temps.
- **Valeur.** C'est le socle de toute synchro crédible, et le prérequis de F-07 (setlist).
- **Faisabilité.** Élevée pour un BPM fixe (champ facultatif dans le schéma, une ligne dans `TimelineTransport.evaluate`). Moyenne pour la carte de tempo (la phase devient l'intégrale du tempo).
- **Fichiers.** `model/schemas.ts`, `engine/timeline.ts`, `engine/Engine.ts`, `music/songToShow.ts`.
- **Risques.** Migration du format de projet (le champ facultatif l'évite).

## F-03 · Effets de position relatifs
- **Description.** Un mode de fusion `offset` : l'effet ajoute un écart signé autour de la valeur sous-jacente (scène, cue, programmer) au lieu de la remplacer.
- **Problème.** Tous les mouvements (Song to Show, IA, effets manuels) oscillent autour du centre DMX et écrasent la visée.
- **Exemple.** Les lyres pointent le chanteur, et un cercle de faible amplitude « respire » autour de lui.
- **Valeur.** C'est la qualité de mouvement attendue d'une console pro (les phasers relatifs existent partout).
- **Faisabilité.** Élevée. `mergeSources` a déjà les deux branches `override` et `scale`. Il faut ajouter une troisième et centrer les sorties d'effet sur 0.
- **Fichiers.** `engine/merge.ts`, `engine/effects.ts`, `model/schemas.ts`, `music/songToShow.ts` (`moveFor`).
- **Risques.** Le bornage en butée (pan à 0 ou 1) écrête le mouvement. Les tests existants des effets `panTilt` sont à adapter.

## F-04 · Rôles de machines déduits
- **Description.** Classement automatique, à valider par l'opérateur : face, contre, latéral, sol, aérien, blinder, effet, poursuite. Le classement se fait à partir de la position, de l'orientation, du type et des capacités, et crée des groupes nommés.
- **Problème.** Song to Show ne connaît que 3 couches. Le Directeur IA cible par type ou par nom.
- **Exemple.** « Contres bleus sur les couplets, faces chaudes sur les refrains » marche sans créer de groupe.
- **Valeur.** C'est le plus gros levier qualité de la génération.
- **Faisabilité.** Moyenne. Les positions du visualiseur, `isBlinder`, `isFollowSpot` et `fixtureLayer` existent.
- **Fichiers.** `music/showRig.ts`, `music/songToShow.ts`, `ai/target.ts`, `features/Fixtures.tsx`.
- **Risques.** Les positions non renseignées dans le visualiseur produisent de mauvais rôles. Il faut un repli sur le type et une confirmation de l'opérateur.

## F-05 · Profils de style structurés
- **Description.** Concert, festival, club, mariage, corporate, théâtre, chacun avec des bornes d'énergie, des palettes, une densité d'effets, une politique strobe, fumée et mouvement, un arc narratif et un plafond d'intensité.
- **Problème.** Les « styles » actuels sont des phrases (`INTENT_PRESETS`) non reliées aux 5 stratégies artistiques.
- **Exemple.** Un mariage, c'est : jamais de strobe, fumée légère, poursuite des mariés, intensité plafonnée à 80 % pour la vidéo.
- **Valeur.** Rend la génération adaptée au contexte réel de l'utilisateur. C'est un argument commercial direct.
- **Faisabilité.** Élevée. C'est un objet de configuration lu par `planLocally` et passé dans le prompt LLM.
- **Fichiers.** `music/showPlanner.ts`, `music/intent.ts`, `features/Music.tsx`.
- **Risques.** Une multiplication de profils médiocres. Il vaut mieux 6 profils bien réglés et éditables.

## F-06 · Song to Show Live
- **Description.** Pour un DJ ou un groupe sans fichier : l'analyse live (`TempoTracker`, `DropPredictor`) estime la section courante (énergie, cassure de basses, montée), et un **planificateur réactif** choisit parmi des looks pré-compilés par profil de style (F-05), à la phrase.
- **Problème.** Le pré-calcul suppose le fichier audio. Le marché DJ et club (concurrent direct : SoundSwitch) travaille en live.
- **Exemple.** En DJ set, une cassure de basses de 8 temps arme le look « drop », qui part sur le retour des basses.
- **Valeur.** Très élevée et différenciante. Cela réutilise 80 % du code existant.
- **Faisabilité.** Moyenne à élevée : le pipeline live existe, il manque l'état « section estimée » et l'arbitrage des looks.
- **Fichiers.** `audio/reactive.ts`, `audio/analyzer.ts`, `music/dropPredictor.ts`, `music/songToShow.ts` (extraction des looks).
- **Risques.** Faux positifs du prédicteur. Mitigation : changement de look seulement à la phrase, confiance minimale, mode « suggestion » sans exécution.

## F-07 · Setlist enchaînée
- **Description.** Liste ordonnée de morceaux, transitions configurables (noir, fondu, enchaînement au BPM), une timeline maître, une GO-list globale.
- **Problème.** Chaque morceau est isolé. Un concert, c'est 15 à 25 titres.
- **Exemple.** Un groupe joue sa setlist au clic (ou au timecode) et le show suit.
- **Valeur.** Élevée pour les groupes, les mariages et les événements.
- **Faisabilité.** Moyenne. Elle dépend de F-02 (BPM par timeline).
- **Fichiers.** `model/schemas.ts` (`music.setlists`), `handlers/music.ts`, `musicPlayer.ts`.
- **Risques.** Gestion des pré-chargements audio (mémoire).

## F-08 · Show portable (projet + audio)
- **Description.** Un export `.lumashow` (zip : projet, audio des morceaux, profils personnalisés), avec l'import correspondant.
- **Problème.** L'audio vit hors du projet (`<dataDir>/music/<hash>`). Un projet copié sur une autre machine ne joue plus ses morceaux.
- **Exemple.** On prépare au bureau, on joue sur le PC de régie.
- **Valeur.** Élevée. C'est une attente de base.
- **Faisabilité.** Élevée : `core/util/zip.ts` existe déjà, et la vérification d'empreinte de `music.storeAudio` aussi.
- **Fichiers.** `handlers/project.ts`, `core/util/zip.ts`, `main/index.ts` (dialogues).
- **Risques.** Taille des fichiers et droits d'auteur des morceaux partagés : à mentionner dans l'UI.

## F-09 · Retouches protégées
- **Description.** Les événements, scènes et effets générés et modifiés à la main reçoivent une marque `userEdited`. La recompilation les conserve (fusion) au lieu de les supprimer, et signale les conflits.
- **Problème.** `removeGenerated` efface toutes les retouches à chaque régénération (SONG_TO_SHOW_AUDIT §3.5).
- **Valeur.** Très élevée : c'est la condition pour qu'un pro adopte la génération.
- **Faisabilité.** Moyenne. Un quick win de confirmation est possible avant.
- **Fichiers.** `handlers/music.ts` (`applyShow`, `removeGenerated`), `features/Timeline.tsx`, schéma `timelineEventSchema`.
- **Risques.** Des références orphelines quand une section est restructurée. Il faut un rapport clair.

## F-10 · Variantes multiples avec audition
- **Description.** Jusqu'à N variantes nommées par morceau, comparées section par section, avec une écoute A/B au même timecode et le choix de la variante **par section**.
- **Problème.** Seuls `plan` et `previousPlan` existent, et la comparaison est textuelle.
- **Valeur.** Élevée : c'est le cœur du travail de direction artistique.
- **Faisabilité.** Moyenne.
- **Fichiers.** `model/schemas.ts` (`music.tracks[].variants`), `features/music/VariantCompareModal.tsx`, `handlers/music.ts`.
- **Risques.** Taille du projet : stocker les plans (légers), pas les objets compilés.

## F-11 · Palettes par harmonie et couleurs de marque
- **Description.** Génération déterministe de palettes (analogue, complémentaire, triade, monochrome) à partir d'une couleur de base, de l'énergie et de la brillance. Mode « couleurs de marque » (corporate) qui impose 1 à 3 couleurs.
- **Problème.** 8 couleurs fixes (`WARM`, `COLD`) pour tous les morceaux.
- **Valeur.** Moyenne à élevée. Elle répond directement aux événements d'entreprise.
- **Faisabilité.** Élevée. `util/math.ts` a déjà `hsvToRgb`.
- **Fichiers.** `music/showPlanner.ts`, `util/math.ts`.
- **Risques.** Le rendu réel dépend du mélange RGB(W/A/UV) des machines (`colorToAttributes`) : il faut tester sur des profils variés.

## F-12 · Rig Doctor
- **Description.** Un diagnostic déterministe du patch et des profils : mode sans canal fin, absence de dimmer ou de shutter, plages non typées, adresses qui chevauchent un univers, machines hors scène, profils dupliqués. Chaque problème vient avec une correction proposée.
- **Valeur.** Très élevée pour la fiabilité.
- **Faisabilité.** Élevée.
- **Fichiers.** `core/fixtures/*`, `features/Fixtures.tsx`, `features/Dashboard.tsx`.
- **Risques.** Faux positifs sur les profils exotiques : prévoir un « ignorer ».

## F-13 · Vérification avant spectacle
- **Description.** Une liste de contrôle avant d'armer : sorties, audio disponible, intégrité des timelines et cues, politique strobe cohérente avec le contenu, garde-fou actif, sauvegarde récente.
- **Valeur.** Élevée.
- **Faisabilité.** Élevée : on agrège des contrôles existants.
- **Fichiers.** `music/showIntegrity.ts` (à généraliser), `handlers/output.ts`, `features/Dashboard.tsx`.
- **Lien.** Rend concret LUMA-108 (test de sortie guidé) et LUMA-110 (mode exploitation).

## F-14 · Import MVR
- **Description.** Import du patch, des positions et des structures depuis un fichier MVR (GDTF embarqué).
- **Problème.** L'export existe (`project/mvr.ts`), pas l'import. La préparation dans Vectorworks, Capture ou grandMA3 est la norme pro.
- **Valeur.** Élevée pour les utilisateurs professionnels.
- **Faisabilité.** Moyenne. Le parseur GDTF et le zip existent.
- **Fichiers.** `project/mvr.ts`, `fixtures/gdtf.ts`, `handlers/project.ts`.
- **Risques.** Variantes de MVR selon les éditeurs : prévoir des fichiers de test réels.

## F-15 · Retargeting de show
- **Description.** Adapter un show (Song to Show en priorité, puis cues) à un autre patch, via les rôles (F-04), avec un rapport des pertes.
- **Valeur.** Très élevée pour les tournées et les prestataires.
- **Faisabilité.** Moyenne pour Song to Show (le plan est indépendant du rig : il suffit de recompiler), élevée pour les cues manuelles.
- **Fichiers.** Nouveau `core/project/retarget.ts`, `music/songToShow.ts`.
- **Risques.** L'utilisateur peut croire que la conversion est parfaite : le rapport doit être explicite.

## F-16 · Qualité artistique mesurée sur le rendu
- **Description.** Simuler la timeline compilée (frames du moteur pur) et mesurer la couverture, la variété réelle, le temps immobile, les flashes et la symétrie.
- **Problème.** `evaluateArtisticQuality` note le plan et ignore les défauts de rendu.
- **Valeur.** Moyenne à élevée : le score devient crédible et sert de critère pour choisir une variante.
- **Faisabilité.** Moyenne. `flashGuard` simule déjà des frames.
- **Fichiers.** `music/artisticQuality.ts`, `engine/timeline.ts`.

## F-17 · Marqueurs de synchro manuels
- **Description.** Poser des « hits » (accent, blackout, cue, changement de couleur) sur des beats précis, que la compilation respecte.
- **Problème.** Les impacts détectés sont automatiques et les seuils fixes : les coups de batterie voulus par le groupe peuvent manquer.
- **Valeur.** Moyenne à élevée.
- **Faisabilité.** Élevée. Le type d'événement `marker` existe dans la timeline.
- **Fichiers.** `music/songToShow.ts`, `features/music/SongStudioTimeline.tsx`.

## F-18 · Copilote d'exploitation
- **Description.** Un bandeau live : section suivante, drop prédit (confiance, armement), santé des sorties, garde-fou déclenché, prochaine cue.
- **Valeur.** Élevée en live.
- **Faisabilité.** Élevée : les signaux existent déjà.
- **Fichiers.** `components/TopBar.tsx`, `audio/reactive.ts`, `engine/Engine.ts` (métriques).

## F-19 · Budget de sécurité par lieu
- **Description.** Un profil de lieu : plafond d'intensité, strobe interdit ou autorisé, fumée interdite (détecteurs incendie), mouvements limités (zone public). Il est appliqué par le moteur, la génération et l'IA.
- **Problème.** Les règles de sécurité sont dispersées (`ai.allowStrobe`, `engine.maxStrobeHz`, `flashGuard`) et ne couvrent ni la fumée ni l'intensité.
- **Valeur.** Élevée (responsabilité de l'exploitant).
- **Faisabilité.** Élevée : une couche de bornage dans le moteur (comme `limitFlashes`) et des contraintes dans le planificateur.
- **Fichiers.** `settings/settings.ts`, `engine/Engine.ts`, `safety/*`, `music/showPlanner.ts`.

## F-20 · Découverte Art-Net et santé des nœuds
- **Description.** ArtPoll / ArtPollReply : liste des nœuds, univers, firmware, état. Alerte si un nœud disparaît.
- **Problème.** Aucune découverte (pas d'ArtPoll dans `core/protocols`).
- **Valeur.** Élevée en installation.
- **Faisabilité.** Moyenne.
- **Fichiers.** `protocols/artnet.ts`, `features/Output.tsx`.
- **Lien.** Précise LUMA-107 et LUMA-103.

## F-21 · Préférences opérateur apprises localement
Voir AI_FEATURE_AUDIT IA-05. Complexité M. Risque : enfermer l'opérateur dans ses habitudes, d'où un mode « surprends-moi ».

## F-22 · Fournisseur LLM local
Voir AI_FEATURE_AUDIT IA-10. Une URL de base configurable dans `openrouter.ts` et la même chaîne de validation. Complexité F.

## F-23 · Compensation de latence audio / DMX
- **Description.** Un décalage réglable (ms) entre la position audio et le timecode envoyé, initialisé par `AudioContext.outputLatency`. Un retard par sortie DMX (nœuds Art-Net lents).
- **Problème.** Selon la carte son et le nœud, la lumière peut arriver avant ou après le son, de quelques dizaines de millisecondes.
- **Valeur.** Moyenne, mais très perçue par les pros.
- **Faisabilité.** Élevée.
- **Fichiers.** `renderer/musicPlayer.ts`, `protocols/OutputManager.ts`.

## F-24 · Feuille de conduite imprimable
- **Description.** Export PDF ou HTML : liste des cues avec le temps, la section, le look (couleurs), les effets, les notes et l'explication Song to Show.
- **Valeur.** Moyenne. C'est pratique pour la régie et la transmission.
- **Faisabilité.** Élevée. `patch.exportSheet` donne un modèle à suivre.
- **Lien.** Précise LUMA-147.

## F-25 · Courbe d'énergie éditable
- **Description.** La courbe d'énergie mesurée est affichée sous la forme d'onde. L'opérateur la redessine (lissage, accentuation d'un pic), et le planificateur s'en sert à la place de la mesure brute.
- **Problème.** La normalisation est relative au morceau. L'arc narratif voulu par l'artiste peut différer du signal.
- **Valeur.** Moyenne à élevée : c'est un contrôle artistique intuitif, sans vocabulaire technique.
- **Faisabilité.** Moyenne.
- **Fichiers.** `music/showPlanner.ts`, `features/music/SongStudioTimeline.tsx`.

---

## Idées examinées et écartées

| Idée | Raison |
|---|---|
| Séparation de sources (stems) intégrée | Modèle lourd, temps d'import, valeur lumière marginale par rapport aux bandes déjà mesurées. À reconsidérer seulement si F-06 montre un besoin. |
| Reconnaissance d'instruments | Même raison. |
| Marketplace de shows | Prématuré : aucune base d'utilisateurs ni de format de show portable (F-08 d'abord). |
| Collaboration temps réel multi-opérateurs | Déjà dans LUMA-133. Le coût d'architecture est élevé et le besoin des utilisateurs cibles (solo, petits prestataires) faible. |
| Pixel mapping vidéo | Le besoin est réel, mais c'est un produit à part. Pas de lien avec le cœur différenciant (IA + musique). |
