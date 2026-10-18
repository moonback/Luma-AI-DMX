# Song-to-Show — améliorations de performance et nouvelles fonctionnalités

Analyse du code au 18/10/2026 : `src/core/music/analyze.ts`, `dsp.ts`, `songToShow.ts`,
`src/core/app/handlers/music.ts`, `src/core/ai/providers/openrouter.ts`, `src/renderer/musicPlayer.ts`,
`src/renderer/features/Music.tsx`.

Rappel du pipeline : import → SHA-256 → décodage → rééchantillonnage mono 22 050 Hz → `analyzeAudio`
(tempo, beats, downbeats, sections, tonalité, événements) → `planLocally` / `planShowWithOpenRouter`
→ `compileShow` (scènes, effets, timeline) → lecture synchronisée par timecode.

Effort : **S** < 1 jour · **M** 1–3 jours · **L** > 3 jours.

---

## 1. Performance

### 1.1 Priorité haute

| # | Constat | Où | Proposition | Effort |
|---|---|---|---|---|
| P1 | **L'analyse tourne sur le thread de l'UI** (découpée en tranches avec `setTimeout`). Un morceau long ou un mix DJ fige l'interface entre deux tranches ; le commentaire `shortcut:` le reconnaît déjà. | `musicPlayer.ts:55` | Déplacer `analyzeAudio` dans un **Web Worker** (le module est pur TS, sans DOM). Transférer le `Float32Array` mono par `postMessage(…, [buffer])` (zéro copie). Si la CSP / `file://` bloque le worker, utiliser un `utilityProcess` Electron côté main. Supprime aussi le besoin de `yieldFn`. | M |
| P2 | **Risque de crash sur les fichiers longs** : `Math.max(...f.rms)` étale un tableau d'une trame par 23 ms. Pour un mix d'une heure (~155 000 trames), ça peut dépasser la limite d'arguments de V8 (`RangeError: Maximum call stack size exceeded`). | `analyze.ts:379` | Remplacer par une boucle (ou `f.rms.reduce((m, x) => Math.max(m, x), 0)`). Même chose, par précaution, pour les autres `Math.max(...)` sur des tableaux de taille variable. Ajouter un test sur un signal de 60 min. | S |
| P3 | **Matrice de similarité complète en O(barres²)**, alors que `boundaries` ne lit que la bande de ±4 barres autour de la diagonale. Négligeable sur 4 min (~120 barres), mais ~3 M cellules `number[][]` (~25 Mo) et ~80 M opérations sur 1 h. | `analyze.ts:185`, `:329` | Ne calculer que la bande `|i − j| < 2R` (tableau `Float32Array` de `n × 2R`) : O(n). | S |
| P4 | **Re-rendu complet de la page Musique 10 fois par seconde** pendant la lecture : `usePlayback` fait `setPos` toutes les 100 ms au niveau de `MusicPage`, ce qui redessine le tableau des sections, les sélecteurs, les palettes… | `Music.tsx:22` | Sortir la tête de lecture (et le libellé « Stop 1:23 ») dans un petit composant qui s'abonne seul à la position, idéalement via `requestAnimationFrame` et un style `transform` sur une `ref` (aucun rendu React). | S |
| P5 | **Les `AudioBuffer` décodés ne sont jamais libérés** : un buffer stéréo 44,1 kHz en float32 pèse ~85 Mo pour 4 min. Dix morceaux ouverts ≈ 850 Mo de RAM dans le renderer. | `musicPlayer.ts:14` (`buffers`) | Cache LRU limité (ex. 2–3 morceaux), le reste rechargé à la demande via `restore()`. | S |

### 1.2 Priorité moyenne

| # | Constat | Où | Proposition | Effort |
|---|---|---|---|---|
| P6 | **Régénérer une section recompile tout le show** et recrée tous les UUID (scènes, effets, timeline). Conséquences : historique d'annulation gonflé, sélection perdue dans la timeline, gros diff du fichier projet, timeline arrêtée si elle jouait. | `music.ts` `regenerateSection` → `applyShow` | Compilation **incrémentale** : ne recompiler que la section touchée (et les fondus de ses voisines), en gardant les IDs stables des autres objets (ID dérivé de `trackId + index + rôle`). | M |
| P7 | **Étapes d'import en série** : décodage, puis envoi `music.storeAudio`, puis rendu `OfflineAudioContext` mono 22 kHz. | `musicPlayer.ts:44-54` | Lancer l'envoi au main et le rendu offline **en parallèle** (`Promise.all`). | S |
| P8 | **Le fichier audio entier passe par l'IPC à chaque import**, même s'il est déjà stocké sur la machine (morceau ré-importé). | `musicPlayer.ts:46`, `music.ts` `storeAudio` | Ajouter une commande `music.hasAudio(hash)` (ou un `fs.access` dans `storeAudio` avant l'écriture) et sauter l'envoi s'il existe. | S |
| P9 | **Suivi de beats** : `Math.log((t − tau) / period) ** 2` est recalculé pour chaque couple (t, tau), soit ~1,5 × période × n appels à `log`. | `analyze.ts:123` | Précalculer la pénalité dans un `Float64Array` indexé par `t − tau` (elle ne dépend que de l'écart). Gain notable sur cette étape. | S |
| P10 | **Allocation d'un `Float32Array` (bandes + chroma) par trame** dans `extract`, conservés dans des `Array` d'objets. | `analyze.ts` `extract` | Deux grands tableaux plats (`n × 24` et `n × 12`) avec des vues `subarray` : moins de pression GC, meilleure localité mémoire. | S |
| P11 | **Timecode envoyé à 10 Hz** par `setInterval` : la timeline suit avec jusqu'à 100 ms d'écart, et le `setInterval` dérive quand l'UI est chargée. | `musicPlayer.ts:101` | Envoyer l'**horodatage de départ** une fois (et à chaque seek) et laisser le moteur extrapoler la position ; ne renvoyer qu'un recalage toutes les 1–2 s. Mieux pour la précision des coupes sur le drop. | M |

### 1.3 Mesurer avant d'optimiser

- Ajouter un **benchmark** (`vitest bench`) de `analyzeAudio` sur 3 durées (30 s, 4 min, 60 min) et de `compileShow` sur un kit de 100 projecteurs, pour chiffrer P1–P3, P9–P10 et éviter les régressions.
- Mesurer l'objectif de la roadmap 1.3 (« génération complète < 30 s en local ») de bout en bout dans l'e2e.

---

## 2. Qualité de l'analyse (fiabilité = moins de retouches)

| # | Constat | Proposition | Effort |
|---|---|---|---|
| Q1 | **Mesure à 4 temps codée en dur** (`j % 4`, phrases de 4 barres). Une valse ou un 6/8 donne des downbeats faux et des sections décalées. | Détecter la métrique (3 ou 4) par le même score que `downbeatPhase` sur les deux hypothèses ; l'exposer et la rendre corrigeable dans l'UI. | M |
| Q2 | **Tempo global unique** : `tempoStable` est calculé, mais les effets synchronisés utilisent un seul BPM. Sur un morceau joué live (tempo qui varie), les chases dérivent. | Stocker une **carte de tempo** (BPM local par 8 temps, déjà calculé dans `local`) et faire suivre les effets `bpmSync` par la grille de beats réelle pendant la lecture. | L |
| Q3 | **`brightness`, `density` et `bassShare` sont calculés mais jamais utilisés** par le planificateur local ni envoyés au LLM. | Les exploiter : brillance → température de couleur / blanc ; densité d'attaques → vitesse des effets (`effectBeats`) ; part de basses → priorité aux washs et aux accents. Les ajouter à la `structure` envoyée à OpenRouter. | S |
| Q4 | **Confiance de tonalité ignorée** : la palette chaude/froide bascule sur `key.mode` même quand la confiance est faible. | En dessous d'un seuil (ex. 0,3), ne pas choisir la palette sur le mode mais sur la brillance. | S |
| Q5 | **Corpus d'évaluation** : le rapport niveau 2 prévoit 50 titres annotés, ils n'existent pas encore. | Créer le corpus (annotations JSON : BPM, downbeats, frontières, étiquettes) + un script de score (F-mesure des frontières à ±0,5 s, erreur d'octave du tempo). Prérequis pour juger toute modification de `analyze.ts`. | L |

---

## 3. Nouvelles fonctionnalités

### 3.1 Édition et contrôle (gain immédiat pour l'utilisateur)

1. **Forme d'onde + grille de beats** dans la bande des sections, avec zoom. Aujourd'hui on ne voit que des blocs de couleur ; impossible de vérifier un downbeat à l'oreille et à l'œil. *(M)*
2. **Déplacer, scinder et fusionner des sections** à la souris (aujourd'hui seule l'étiquette est modifiable), avec aimantation sur les downbeats. *(M)*
3. **Correction de tempo et de phase** : boutons ×2 / ÷2, « tap » pour recaler le premier temps, décalage de grille en ms. Corrige les erreurs les plus fréquentes sans réanalyser. *(S)*
4. **Variantes A/B conservées** : garder les 3 derniers plans et basculer de l'un à l'autre (aujourd'hui « Variante » écrase le plan précédent). *(S)*
5. **Consignes par section dans l'intention globale** : comprendre « refrain 2 en rouge », « le pont sans mouvement » dans le texte d'intention, pas seulement dans le champ par ligne. *(M)*
6. **Aperçu sans lancer l'audio** : survoler une section affiche son look dans la vue 3D (scène appliquée en prévisualisation, sans sortie DMX). *(M)*

### 3.2 Un show plus riche

7. **Utiliser les groupes du projet** (`project.groups`) au lieu des 3 familles fixes (wash / lyres / barres) : « contres en couplet, faces au refrain ». Le planificateur recevrait la liste des groupes nommés. *(M)*
8. **Viser les repères de scène** (`stage.markers` : chanteur, batteur…) avec les lyres : douche sur le chanteur en couplet, balayage public au refrain. *(M)*
9. **Vocabulaire d'effets étendu** : éventail (fan), chase de couleur, blinder sur le drop, zoom / iris qui respire, effets de **position** synchronisés (ballyhoo), et machines à fumée / haze pilotées par l'énergie. *(M par famille)*
10. **Rampes à l'intérieur d'une section** (roadmap 1.5) : un couplet long monte doucement en intensité au lieu d'un look figé. *(S)*
11. **Effets « suiveurs de bande »** en lecture (roadmap 1.5) : dimmer piloté par les basses, couleur par la brillance, en plus des effets calés sur la grille. *(M)*
12. **Détection de la voix** (présence vocale par bande 300 Hz–3 kHz + stabilité harmonique) → poursuite sur le chanteur seulement quand il chante. *(L)*

### 3.3 Du morceau au concert

13. **Setlist** : enchaîner plusieurs morceaux dans une timeline de concert, avec cohérence des palettes sur le set (éviter trois refrains rouges d'affilée) et transitions entre titres. *(L)*
14. **Reconnaissance du morceau en live** (roadmap 1.4) : empreinte acoustique des titres déjà analysés ; quand l'entrée audio live correspond, la timeline démarre et se cale automatiquement. *(L)*
15. **Export vidéo MP4** de la vue 3D synchronisée sur l'audio (roadmap, « faire valider par le client avant la date »). *(L)*
16. **Export du show** en liste de cues vers d'autres consoles (CSV / ASCII Light Cues) en complément de l'export MVR existant. *(M)*

### 3.4 IA

17. **Cache des réponses LLM** par clé `(hash du morceau, intention, kit, variante, modèle)` : régénérer à l'identique ne recoûte rien et reste reproductible. *(S)*
18. **Régénération d'une section par le LLM** : aujourd'hui `regenerateSection` passe toujours par les règles locales (`adjustSection`), même quand OpenRouter est configuré. Envoyer la section, ses voisines et la consigne. *(M)*
19. **Explication du plan** : afficher, par section, *pourquoi* ce look (« refrain répété → même palette que le refrain 1 ; énergie mesurée 0,92 »). Augmente la confiance et accélère les retouches. *(S)*
20. **Préférences apprises** : mémoriser les retouches de l'utilisateur (« toujours plus calme sur les couplets », couleurs refusées) et les injecter dans l'intention par défaut des morceaux suivants. *(M)*

---

## 4. Ordre conseillé

1. **Correctifs rapides** : P2 (crash), P4 (re-rendus), P5 (mémoire), Q3 (descripteurs inutilisés) — environ 1 jour en tout.
2. **Confort d'édition** : 3 (tempo ×2 / tap), 4 (variantes A/B), 1 + 2 (forme d'onde, sections éditables).
3. **Robustesse** : P1 (worker), P6 (compilation incrémentale), Q1 (métrique), Q5 (corpus).
4. **Show plus riche** : 7 (groupes), 8 (repères), 9 (effets), 18 (LLM par section).
5. **Concert** : 13 (setlist), 14 (reconnaissance live), 15 (export vidéo).
