# Synthèse exécutive — Audit stratégique Luma-AI-DMX 1.9.0

> Audit du 2026-11-08, branche `master`, commit `8467bfc`. Il porte sur ≈ 40 700 lignes TS/TSX (232 fichiers source), 15 pages, ≈ 110 commandes et ≈ 80 fichiers de tests. Les affirmations viennent de la lecture du code, et les numéros de ligne renvoient à ce commit. Aucun essai sur matériel DMX réel ni aucun test utilisateur n'a été mené.

**Documents détaillés**
1. [FUNCTIONAL_INVENTORY.md](FUNCTIONAL_INVENTORY.md) : inventaire et état réel.
2. [AI_FEATURE_AUDIT.md](AI_FEATURE_AUDIT.md) : capacités IA et pistes.
3. [SONG_TO_SHOW_AUDIT.md](SONG_TO_SHOW_AUDIT.md) : audit approfondi de Song to Show.
4. [UX_UI_IMPROVEMENTS.md](UX_UI_IMPROVEMENTS.md) : expérience utilisateur.
5. [FEATURE_IDEAS.md](FEATURE_IDEAS.md) : 25 fonctionnalités proposées et 5 écartées.
6. [COMPETITIVE_ANALYSIS.md](COMPETITIVE_ANALYSIS.md) : marché et différenciation.
7. [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) : notation, top 10 et étapes.

## Verdict en une phrase

Luma-AI-DMX a une **architecture plus saine que son positionnement ne le laisse croire** : cœur pur, schémas validés, IA qui propose sans jamais écrire de DMX, garde-fou photosensible. Mais **Song to Show, sa fonction phare, ne restitue pas fidèlement ce qu'il planifie** : tempo, mouvements, flashs, et retouches perdues. La priorité n'est pas d'ajouter de l'IA. Elle est que le show fasse exactement ce qu'il annonce, puis qu'il comprenne le kit réel.

## 1. Ce que Luma-AI-DMX sait réellement faire aujourd'hui

- **Un moteur DMX réel et sérieux.** Fusion HTP/LTP par bandes de priorité, programmer prioritaire, cue lists (fade, délai, courbes, follow), 13 types d'effets synchronisables au BPM, timeline à 6 pistes, 3 politiques de blackout, cadence de 10 à 44 Hz avec métriques de gigue.
- **Des sorties opérationnelles.** Art-Net, sACN, ENTTEC DMX USB Pro, Open DMX, virtuelle ; RDM (découverte, identification, adressage) ; armement explicite.
- **Un contrôle externe.** MIDI (apprentissage), MTC, LTC, OSC (liste d'IP autorisées), télécommande web sécurisée (jeton → cookie HttpOnly, limitation de débit, aucune commande d'armement).
- **Des machines.** Profils intégrés, import OFL / GDTF / MA2, profil depuis une photo (vision IA, validé par l'utilisateur), modules multi-têtes et pixels, export MVR, feuille de patch, localisation des machines par caméra.
- **Un visualiseur 2D/3D** complet (Three.js), avec décor généré depuis un texte (analyseur local, sans LLM).
- **Une IA bien bornée.** Directeur IA (local FR ou OpenRouter) qui passe par validation, aperçu, application et annulation, et qui impose après coup les contraintes de prompt. Voix Gemini Live branchée sur les mêmes outils. Budget, cache, repli local. Un jeu d'éval de 187 cas.
- **Song to Show de bout en bout.** Analyse locale (BPM, beats, mesure, sections, tonalité, impacts, risers, silences, voix), plan par section (règles ou LLM validé), compilation en scènes, effets, timeline et cue list, avec explication par section, verrouillage, variantes et garde-fou de sécurité.

## 2. Fonctionnalités incomplètes ou insuffisamment exploitées

| Constat | Statut | Référence |
|---|---|---|
| Les effets du show tournent au BPM du moteur (120 par défaut), pas à celui du morceau : à 128 contre 120 BPM, jusqu'à ~8 temps de dérive sur une section de 60 s pour les effets non relancés par phrase | Partiel, défaut **P0** | `Engine.ts` l. 163 et 372, `format.ts`, `songToShow.ts` l. 392-402 |
| Mouvements « pendule » et « zigzag » rendus comme un simple tilt | Déclaratif | `songToShow.ts` l. 215-216, `computeEffect` |
| Les mouvements écrasent la visée calculée (oscillation autour de 0,5) | Partiel | `songToShow.ts` l. 143-144, `merge.ts` |
| « Snap » et « flicker » sont des strobes à 10 Hz, pas des effets au temps ; remplacés d'office quand le strobe est interdit (défaut) | Partiel | `songToShow.ts` l. 183, 186 |
| Une régénération efface les retouches de timeline sans prévenir | Défaut produit **P0** | `handlers/music.ts` (`removeGenerated`) |
| `tempoChanges` calculé, jamais utilisé | Déclaratif | `analyze.ts` l. 383-417 |
| Confiance de section constante (0,85 + bonus) | Simulé | `analyze.ts` l. 514-517 |
| Mesure 3/4 ignorée par le compilateur | Partiel | `songToShow.ts` l. 289 |
| Frontières de section non éditables | Inexistant | `music.setSection` (libellé seul) |
| Audio absent de l'export de projet | Inexistant | `project.export` |
| Règles locales (Song to Show, Directeur IA) en français seulement | Partiel | `Music.tsx`, `intent.ts`, `interpreter.ts` |
| Import MVR, ArtPoll | Inexistants | `project/mvr.ts`, `protocols/*` |
| Qualité artistique notée sur le plan, pas sur le rendu | Partiel | `artisticQuality.ts` |

Sous-exploités : les **positions de scène** (riches dans le visualiseur, ignorées par la génération), le **pipeline live** (tempo et prédiction de drop, qui pourraient porter un mode Song to Show Live) et les **profils d'espace de travail** (base idéale d'un mode exploitation).

## 3. Ce qui pourrait être considérablement amélioré

1. **La fidélité du rendu** de Song to Show : tempo, mouvements relatifs, flashs au temps.
2. **Le contrôle de l'opérateur** : frontières éditables, retouches protégées, variantes auditionnables.
3. **La compréhension du kit** : passer de 3 couches (wash / moving / bars) à des **rôles** (face, contre, latéral, aérien, blinder).
4. **La portabilité** : show = projet + audio.
5. **La cohérence UX** : nommage (« Console Live␠ », « Programmer », « Show Musique »), chaînes françaises codées en dur, notices toutes jaunes, trois surfaces de programmer sans explication.

## 4. Les fonctionnalités IA les plus intéressantes à développer

Huit des dix pistes retenues ne demandent **aucune API payante**.

1. **Rôles de machines déduits** (IA-02 / F-04). C'est le plus gros levier de qualité.
2. **Rig Doctor** (IA-01 / F-12). Diagnostic déterministe du patch et des profils.
3. **Vérification avant spectacle** (IA-04 / F-13).
4. **Qualité mesurée sur le rendu** (IA-08 / F-16).
5. **Intention structurée multilingue** (IA-06).
6. **Retargeting d'un show vers un autre kit** (IA-03 / F-15). Rendu possible parce que le plan est indépendant du rig.

Déconseillé : laisser un LLM produire des valeurs DMX, auto-appliquer par défaut, ajouter un chat généraliste, intégrer un modèle d'instruments ou de stems.

## 5. Transformer Song to Show en véritable générateur intelligent

L'architecture est déjà la bonne : **intention → plan typé → compilateur déterministe → contrôles de sécurité**. Il faut l'exploiter en quatre étapes, sans réécriture.

1. **Fidélité (2 à 3 semaines).** BPM du morceau pour la timeline, `pingpong` / `zigzag` rendus, `snap` au temps, confirmation avant écrasement, mesure 3/4, notices typées.
2. **Maîtrise.** Éditeur de structure (frontières, grille), effets de position relatifs, retouches protégées (généré + surcharges), show portable, marqueurs de synchro manuels.
3. **Intelligence du rig.** Rôles de machines, profils de style structurés (concert, club, mariage, corporate…), palettes par harmonie et couleurs de marque, variantes multiples auditionnables, score calculé sur le rendu.
4. **Différenciation.** Song to Show Live (DJ ou groupe sans fichier, à partir de `TempoTracker` et `DropPredictor`), setlist enchaînée, retargeting, préférences apprises localement.

Préalable de mesure : constituer un **corpus de 20 à 30 morceaux réels annotés**. Les tests actuels sont synthétiques (`tests/music-synth.ts`), donc la qualité de l'analyse n'est pas mesurée aujourd'hui.

## 6. Les 10 améliorations les plus importantes

| # | Amélioration | Priorité | Complexité |
|---|---|---|---|
| 1 | Effets de la timeline au BPM du morceau (C-01 / F-02) | P0 | faible |
| 2 | Retouches protégées : confirmation puis fusion (C-03 / F-09) | P0 → P1 | faible → moyenne |
| 3 | Mouvements et flashs fidèles au plan (C-02, C-04) | P0 | faible |
| 4 | Effets de position relatifs (F-03) | P1 | moyenne |
| 5 | Rôles de machines déduits (F-04) | P1 | moyenne |
| 6 | Éditeur de structure musicale (F-01) | P1 | moyenne |
| 7 | Show portable projet + audio (F-08) | P1 | faible |
| 8 | Rig Doctor + vérification avant spectacle (F-12, F-13) | P1 | faible |
| 9 | Profils de style + intention multilingue (F-05, IA-06) | P1 | moyenne |
| 10 | Song to Show Live (F-06) | P2 | élevée |

## 7. Opportunités de différenciation face aux concurrents

| Opportunité | Face à |
|---|---|
| **Direction artistique explicable** : chaque section dit pourquoi elle est éclairée ainsi | Tous (aucun concurrent étudié ne l'offre, d'après les capacités connues *(à vérifier, sans recherche en ligne)*) |
| **Show recompilable pour un autre kit** (plan indépendant du rig) | SoundSwitch, Daslight, Lightkey |
| **Sécurité intégrée** : garde-fou photosensible, strobe sur autorisation, contraintes imposées après le LLM, budget par lieu | Tous |
| **IA hybride, locale d'abord** : fonctionne hors ligne, LLM optionnel, cache reproductible | Outils IA cloud |
| **Intention en langage naturel** (« contres bleus sur les couplets ») | Tous |
| **Song to Show Live** : la grammaire scénique de Luma appliquée en temps réel | SoundSwitch sur son terrain |
| **Pré-production compatible pro** (MVR en entrée et en sortie, sACN, timecode, feuille de conduite) | Complément, pas concurrent, de grandMA3, MagicQ, Avolites, ONYX |

Positionnement recommandé : **« le directeur lumière assisté qui comprend la musique, votre kit et vos contraintes de sécurité, et qui explique chacun de ses choix »**.

## Problèmes d'architecture à traiter (sans réécriture)

1. Pas de **fusion relative** pour les positions (`merge.ts`) : cela bloque les mouvements de qualité.
2. **BPM global** au moteur : cela bloque la synchro par morceau et la setlist.
3. **Show généré copié** au lieu d'un modèle « généré + surcharges » : cela bloque la retouche durable.
4. **Audio hors du projet** : cela bloque la portabilité.
5. **Intention en regex françaises** : cela bloque l'international sans LLM.

Ce qu'il faut préserver absolument : la séparation plan / compilateur, la validation zod de toute sortie IA, le repli local, `autoApply: false` et `autoArmOnStart: false` par défaut, ainsi que l'honnêteté des étiquettes de provenance du Dashboard.
