# Audit des fonctionnalités IA — Luma-AI-DMX 1.9.0

> Audit du 2026-11-08, commit `8467bfc`. Grille de statut : voir [SONG_TO_SHOW_AUDIT.md §0](SONG_TO_SHOW_AUDIT.md).

## 1. Constat d'ensemble

Luma-AI-DMX a une **architecture IA saine et défendable**, ce qui est rare dans cette catégorie de produit.

- **L'IA propose, le code valide, l'humain applique.** Toute sortie de modèle passe par un schéma zod (`aiActionSchema`, `showSectionPlanSchema`, `llmPlanSchema`), puis par une validation contre le rig réel (`validateActions` : machines capables, strobe autorisé, garde-fou de flashes), puis par un aperçu (`previewValues`), et seulement ensuite par l'application (`ai.apply`). L'opération est annulable (`ai.undoApply`).
- **Toujours un mode local.** Un interpréteur de règles (`ai/local/interpreter.ts`, 568 lignes), un planificateur Song to Show local et des suggestions d'intention locales. Le produit fonctionne hors ligne et sans clé.
- **Un seul fournisseur LLM (OpenRouter)**, avec choix du modèle, effort, délai, budget mensuel (`guardBudget`, `monthlyBudget`), journal d'usage, 3 tentatives (`MAX_ATTEMPTS`), annulation (`ai.cancel`) et cache de réponses sur disque.
- **La voix passe par Gemini Live** (`@google/genai`, jeton éphémère obtenu dans le main). Elle utilise les **mêmes** outils propose → apply. L'auto-application (`assistant.autoApply`, désactivée par défaut) applique une proposition **déjà validée**.

La critique principale ne porte donc pas sur la sécurité. Elle porte sur **la valeur opérationnelle**. L'IA sait « faire un look » ou « générer un show depuis un morceau », mais elle ne sait rien faire de ce qui coûte le plus de temps à un pupitreur : patch, focus, préparation, vérification, adaptation d'un show à un autre kit.

## 2. Inventaire des capacités IA existantes

| Capacité | Statut | Moteur | Ce qui est réellement fait | Limites vérifiées |
|---|---|---|---|---|
| Directeur IA conversationnel | Opérationnel | Local (règles FR) ou OpenRouter | Prompt → `understanding` + actions typées (`setIntensity`, `setColor`, `setPosition`, `setBeam`, `start/stop/adjustEffect`, `createScene`, `applyScene`, `createCue`, `createSequence`, `setBpm`, `releaseAi`, etc.), avec au plus 50 actions par proposition. Fil de discussion, révision manuelle (`ai.revise`), annulation. | Les règles locales ne lisent que le français. La couche IA a une priorité globale (60 par défaut, réglable dans `engine.priorities`), identique pour toutes les propositions. |
| Contraintes de prompt | Opérationnel | Local | `promptConstraints` / `enforceConstraints` : « sauf les lyres », « sans strobe », « pas de rouge » sont imposés **après** le LLM. | Excellent garde-fou contre les hallucinations. Il dépend lui aussi de regex françaises (`EXCLUDE_RE`). |
| Intensité relative | Opérationnel | Local | `expandRelativeIntensity` : « plus fort », « -20 % » par rapport à l'état réel. | |
| Garde-fou de flashes sur les propositions | Opérationnel | Local | `guardProposalFlashes` simule l'effet sur l'état courant. | |
| Song to Show, plan | Opérationnel | Local ou OpenRouter | Plan par section, réparé et validé, sections verrouillées conservées. | Voir [SONG_TO_SHOW_AUDIT.md](SONG_TO_SHOW_AUDIT.md). |
| Song to Show, retouche d'une section | Opérationnel | Local (`adjustSection`) ou OpenRouter | Instruction courte → nouvelle section. | Le vocabulaire local est limité aux mots prévus par les regex. |
| Suggestions d'intention | Opérationnel | Local (`suggestIntents`) ou OpenRouter | Phrases que `parseIntent` comprend : une suggestion acceptée agit exactement comme du texte tapé. | Avec OpenRouter actif mais indisponible, aucune suggestion n'est affichée (pas de repli local, choix explicite du code). |
| Qualité artistique | Partiel | Local, déterministe | Score sur 100 (contraste, variété, narration, voix). | Il note le plan et non le rendu. Les pondérations ne sont pas calibrées. Ce n'est pas de l'IA, mais c'est présenté comme une évaluation. |
| Scène 3D depuis une photo | Partiel | OpenRouter vision | Photo → décor (structures, accessoires, machines), réparé (`parsePhotoScene`). | Pas de score de confiance par objet. Le résultat doit être retouché. |
| Profil de machine depuis une photo | Partiel | OpenRouter vision | Photos du manuel ou de l'étiquette → modes et canaux, réparés (`repairMode`, compteur `dropped`), puis enregistrés seulement par l'utilisateur. | C'est exactement le bon usage du LLM, mais sans vérification croisée avec OFL / GDTF. |
| Scène de décor depuis un texte | Opérationnel | **Local déterministe** (pas de LLM) | « une grille de 10 m … 5 ignite300 » → décor complet. | Le nom laisse croire à de l'IA : c'est un analyseur. C'est une force (hors ligne, fiable). |
| Localisation par caméra | Partiel | Vision classique (sans LLM) | Allume chaque machine, détecte la tache sur la photo, triangule. | Précision non mesurée. Pas d'indicateur de qualité par machine. |
| Assistant vocal | Opérationnel | Gemini Live | 14 outils : `propose_lighting`, `apply_proposal`, `undo_last`, `cue_go/back/pause/resume`, `blackout_on/off`, `set_bpm`, `release_ai/all`, `get_status`, `control_engine`. | `blackout_off` et `set_bpm` s'exécutent directement, sans proposition (acceptable, mais à signaler). **28 `console.log`** dans `renderer/voice/*` journalisent le texte des demandes. |
| Prédiction de drop | Partiel | Logistique pondérée à la main | Live et piste connue. | Pas de modèle entraîné. Le code le dit. |
| Évaluation continue | Opérationnel | Tests | `tests/eval` : 187 cas (`cases.json`), rejeu OpenRouter. | Couvre le Directeur IA, pas Song to Show (aucun corpus musical annoté). |

## 3. Ce qui manque vraiment, problème par problème

Les pistes sont classées par **valeur opérationnelle**, pas par effet démo. Pour chacune : problème, scénario, fonctionnement, données, composants, difficulté et valeur. « Local » signifie sans API payante.

### IA-01 · Assistant de patch et de capacités (« Rig Doctor »)
- **Problème.** Un mauvais mode DMX, une adresse en conflit, un profil incomplet (pas de canal shutter, roue de couleurs non décrite) : c'est 80 % des pannes en installation, et rien ne les détecte au-delà du conflit d'adresse.
- **Scénario.** À l'ouverture d'un projet ou avant de jouer : « 3 lyres ont un mode 16 bits sans canal fin déclaré », « la Rush MH 7 n'a pas de canal dimmer : Song to Show ne pourra pas l'éteindre ».
- **Fonctionnement.** Des règles déterministes sur `ResolvedFixture` (attributs, plages, modules), avec une explication et une correction proposée. Le LLM n'est utile qu'en option, pour reformuler.
- **Données.** Patch, profils, `attributeClass`, `colorCapability`.
- **Composants.** `core/fixtures/*`, le KPI « issues » du Dashboard, la page Machines.
- **Difficulté.** Faible. **Valeur.** Très élevée, pour la fiabilité.

### IA-02 · Rôles de machines déduits (wash de face, contres, latéraux, aériens, blinders, effets)
- **Problème.** Song to Show et le Directeur IA raisonnent en 3 couches (wash, moving, bars) ou en types. Un concepteur raisonne en **rôles et positions**.
- **Scénario.** Le système propose « 4 PAR en face, 2 barres LED au sol en contre, 4 lyres sur la poutre arrière ». L'opérateur valide d'un clic. Ensuite, « contres bleus sur les couplets » marche sans créer de groupe.
- **Fonctionnement.** Une classification déterministe à partir de `fixture.position`, de l'orientation, du type et des capacités, puis la création de groupes nommés. Le LLM peut être consulté sur les cas ambigus.
- **Données.** Positions du visualiseur (déjà riches), profils.
- **Composants.** `music/showRig.ts`, `ai/target.ts`, groupes du projet.
- **Difficulté.** Moyenne. **Valeur.** Très élevée : c'est la clé de la qualité de Song to Show.

### IA-03 · Adaptation automatique d'un show à un autre kit (« retargeting »)
- **Problème.** Un show programmé pour 8 lyres et 12 PAR doit tourner dans une salle qui a 4 lyres, 6 PAR et 2 barres.
- **Scénario.** On ouvre un projet, on importe un nouveau patch, et l'outil remappe scènes et effets par rôle, avec un rapport des pertes (« le prisme du refrain n'existe plus »).
- **Fonctionnement.** Rôles (IA-02), puis correspondance des attributs, puis recompilation. Les shows Song to Show sont déjà **recompilables** depuis leur plan : c'est un avantage structurel unique.
- **Composants.** `compileShow` (déjà indépendant du rig), un nouveau `core/project/retarget.ts`.
- **Difficulté.** Moyenne (Song to Show) à élevée (cues manuelles). **Valeur.** Très élevée pour les prestataires et les tournées.

### IA-04 · Vérification avant spectacle (« pre-show check »)
- **Problème.** Rien ne valide l'état d'un projet avant d'armer la sortie : cues orphelines, timeline qui référence une scène supprimée, audio manquant sur la machine, sortie désarmée, strobe interdit alors que le show en contient.
- **Fonctionnement.** Une agrégation de contrôles existants (`validateShowIntegrity`, rapport de stockage, état des sorties) et de nouveaux, dans une liste à cocher. C'est déterministe.
- **Composants.** Dashboard (panneau d'alertes), `handlers/output.ts`, `music/showIntegrity.ts`.
- **Difficulté.** Faible. **Valeur.** Élevée. Voir aussi LUMA-108 dans `ROADMAP.md`.

### IA-05 · Apprentissage local des préférences
- **Problème.** L'opérateur corrige toujours les mêmes choses (« jamais de rainbow », « refrains en ambre »).
- **Fonctionnement.** Statistiques locales sur les sections verrouillées, retouchées ou rejetées, et sur les propositions révisées (`ai.revise`). Elles deviennent des biais du planificateur local (poids des effets et palettes) et du contexte LLM (« préférences de l'opérateur : … »). **Pas d'entraînement de modèle.**
- **Données.** `plan.sections[].locked`, `note`, historique des révisions. Tout reste sur la machine.
- **Composants.** `music/showPlanner.ts`, `ai/providers/openrouter.ts` (prompt), un nouveau fichier de préférences dans `dataDir`.
- **Difficulté.** Moyenne. **Valeur.** Élevée (fidélisation). Risque : enfermer l'opérateur dans ses habitudes. Il faut un bouton « surprends-moi » qui ignore les biais.

### IA-06 · Intention structurée multilingue
- **Problème.** `parseIntent` et l'interpréteur local sont des regex françaises. Une UI en anglais sans LLM perd l'essentiel de Song to Show et du Directeur IA.
- **Fonctionnement.** L'intention devient un objet typé (`Intent`, qui existe déjà en interne) éditable par des chips et des curseurs. Le texte libre est converti en `Intent` par les règles FR, par le LLM ou par une table de synonymes par langue.
- **Composants.** `music/intent.ts`, `Music.tsx`, `ai/local/*`.
- **Difficulté.** Moyenne. **Valeur.** Élevée (ouverture à l'international et découvrabilité des options).

### IA-07 · Copilote d'exploitation pendant le show
- **Problème.** En live, l'opérateur n'a pas le temps de taper un prompt.
- **Scénario.** Un bandeau discret indique « Drop prévu dans 8 temps (confiance 0,72) · GO armé sur la liste "Drops" », « Section suivante : refrain 2 (plus fort que le 1) » et « Sortie sACN : 3 paquets perdus/s ».
- **Fonctionnement.** Il assemble des signaux existants (`DropPredictor`, `predictFromTrack`, métriques du moteur, état des sorties). Pas de LLM.
- **Composants.** TopBar / barre d'état, `audio/reactive.ts`.
- **Difficulté.** Faible à moyenne. **Valeur.** Élevée en live.

### IA-08 · Détection des incohérences artistiques après compilation
- **Problème.** `evaluateArtisticQuality` juge le plan. Or les défauts viennent du rendu : couleurs écrasées par un effet `override`, mouvement qui annule la visée, effet de couleur sur des machines sans couleur.
- **Fonctionnement.** Simuler N frames de la timeline compilée (le moteur est pur et testable) et mesurer la couverture réelle, la variété, les flashes, le temps sans mouvement et les « trous noirs ».
- **Composants.** `music/artisticQuality.ts`, `engine/timeline.ts`, `safety/flashGuard.ts` (qui simule déjà des frames).
- **Difficulté.** Moyenne. **Valeur.** Élevée : la note devient mesurable et crédible.

### IA-09 · Génération de séquences depuis une description (« chase en 4 temps des contres vers la face »)
- **État.** Partiel : `createSequence` existe dans les actions IA.
- **À ajouter.** La compréhension spatiale (rôles IA-02 et positions), la synchro sur la grille de beats et des formes nommées. C'est surtout un sujet de **vocabulaire et de rôles**, pas de modèle.
- **Difficulté.** Moyenne. **Valeur.** Moyenne à élevée.

### IA-10 · Fournisseur LLM local (Ollama / LM Studio, API compatible OpenAI)
- **Problème.** Confidentialité, coût et travail hors ligne en tournée.
- **Fonctionnement.** `openrouter.ts` parle déjà un dialecte OpenAI (`completeJson`). Il suffirait d'une URL de base configurable et d'une **validation identique** (la même chaîne zod, réparation et repli).
- **Difficulté.** Faible. **Valeur.** Moyenne. Risque : la qualité des petits modèles sur un JSON structuré. Le cache et la réparation limitent le risque, et l'éval `tests/eval` permet de le mesurer.

## 4. Pistes IA évaluées et déconseillées

| Idée | Verdict | Raison |
|---|---|---|
| Génération directe de valeurs DMX par un LLM | ❌ | Non vérifiable, latence, risque matériel. L'architecture actuelle (plan typé puis compilateur) est la bonne : il faut la garder. |
| IA qui pilote la sortie en continu pendant le show | ❌ | Latence et fiabilité incompatibles avec le DMX. L'IA doit armer et suggérer, et le moteur déterministe exécuter. |
| Reconnaissance d'instruments par modèle lourd | ❌ à court terme | Coût d'intégration (ONNX, taille, temps d'import) disproportionné face à basses / aigus / voix déjà mesurés. |
| Chat généraliste supplémentaire | ❌ | Le Directeur IA et la voix couvrent déjà le conversationnel. Un chat de plus ajouterait de la surface sans utilité opérationnelle. |
| Auto-application par défaut | ❌ | `autoApply: false` est le bon défaut. Il doit rester désactivé tant que la sortie est armée sur du matériel réel. |

## 5. Points de vigilance de sécurité et de fiabilité

1. **Journalisation de la voix.** Retirer ou conditionner (niveau `debug`) les `console.log` de `renderer/voice/*`, qui exposent le texte des demandes et des métadonnées de jeton.
2. **`blackout_off` vocal.** Rallumer une scène par la voix sans confirmation peut surprendre en exploitation. Il faudrait une confirmation quand la sortie est armée.
3. **`ai.allowStrobe`** est désactivé par défaut (bon choix), mais le planificateur local propose quand même `flicker` (un type strobe). Cela génère des notices inutiles. Voir SONG_TO_SHOW_AUDIT §3.4.
4. **Divergence de BPM** entre la validation (BPM du morceau) et la lecture (BPM du moteur) : un effet validé peut être rendu à une autre cadence. Voir SONG_TO_SHOW_AUDIT §3.1.
5. **Confiance affichée non mesurée** (`confidence` de section). Il faut l'étiqueter « estimation » ou la calculer réellement (marge de nouveauté, stabilité du regroupement).

## 6. Priorisation IA

| Rang | Piste | Impact | Faisabilité | Coût API |
|---|---|---|---|---|
| 1 | IA-02 Rôles de machines | 9 | 7 | Aucun |
| 2 | IA-01 Rig Doctor | 8 | 9 | Aucun |
| 3 | IA-04 Vérification avant spectacle | 8 | 9 | Aucun |
| 4 | IA-08 Qualité mesurée sur le rendu | 7 | 7 | Aucun |
| 5 | IA-06 Intention structurée | 7 | 7 | Aucun |
| 6 | IA-03 Retargeting de show | 9 | 5 | Optionnel |
| 7 | IA-07 Copilote live | 7 | 7 | Aucun |
| 8 | IA-05 Préférences locales | 7 | 6 | Aucun |
| 9 | IA-10 LLM local | 5 | 8 | Aucun |
| 10 | IA-09 Séquences spatiales | 6 | 6 | Optionnel |

Huit pistes sur dix ne demandent **aucune API payante**. C'est cohérent avec l'architecture existante : l'IA générative sert à interpréter l'intention et le déterminisme sert à exécuter.
