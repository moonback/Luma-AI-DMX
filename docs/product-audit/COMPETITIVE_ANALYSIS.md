# Analyse concurrentielle et différenciation — Luma-AI-DMX

> Audit du 2026-11-08. L'analyse repose sur les capacités **connues et stables** des produits cités (documentation publique, usages établis). Elle ne contient ni prix ni numéros de version. Les points marqués *(à vérifier)* sont à confirmer avant toute communication externe. L'objectif n'est pas de copier, mais d'identifier les bonnes idées et les espaces libres.

## 1. Cartographie du marché

| Segment | Produits | Utilisateur type | Ce qui compte |
|---|---|---|---|
| Consoles haut de gamme | grandMA3, ChamSys MagicQ, Avolites (Titan), ONYX (Obsidian) | Pupitreurs pros, tournées, théâtres, TV | Fiabilité, vitesse de programmation, gros parcs, réseau, redondance, timecode |
| Logiciels « faciles » sur PC/Mac | Daslight, Lightkey | DJ, petits groupes, bars, églises, événementiel | Prise en main, bibliothèque de machines, boîtier USB |
| Automatisation musique → lumière | SoundSwitch | DJ (intégration aux logiciels de mix) | Show automatique synchronisé à la musique, sans programmation |

**Luma-AI-DMX se situe entre le deuxième et le troisième segment**, avec une ambition de crédibilité « pro » : moteur HTP/LTP à priorités, cue lists, timecode, sACN/Art-Net, garde-fou photosensible, GDTF/MVR.

## 2. Ce que chaque produit fait particulièrement bien

### grandMA3
- **Idées fortes.** Presets et phasers (effets décrits par des pas, relatifs aux valeurs de base), tracking des cues, filtres et « worlds » (limiter ce qu'une action touche), réseau multi-consoles, timecode et show files robustes, très grandes bibliothèques.
- **Leçon pour Luma.** Les **effets relatifs** (phasers autour d'une valeur de base) sont la norme pro. Luma n'a que des effets absolus en position (voir F-03). Les « worlds » ressemblent aux contraintes de prompt de Luma (« sauf les lyres ») : on peut les rendre visibles comme des filtres.

### ChamSys MagicQ
- **Idées fortes.** Logiciel PC gratuit et utilisable avec du matériel tiers *(conditions de sortie à vérifier)*, visualiseur intégré, éditeur d'effets puissant, pixel mapping, support étendu des protocoles.
- **Leçon pour Luma.** L'accès gratuit au logiciel de préparation (« pré-programmation hors ligne ») est un modèle d'acquisition éprouvé. Le palier Starter de Luma peut jouer ce rôle s'il reste généreux sur le visualiseur.

### Avolites (Titan)
- **Idées fortes.** Moteur de « shapes » (effets paramétriques), key frame shapes, intégration vidéo (serveurs média de la marque), approche orientée live et busking.
- **Leçon pour Luma.** Le **busking** (improviser en live à partir de palettes et d'effets) est l'usage réel de beaucoup d'opérateurs. Les Actions rapides et la Console simplifiée de Luma vont dans ce sens. Le mode Song to Show Live (F-06) serait du « busking assisté ».

### ONYX (Obsidian)
- **Idées fortes.** Logiciel PC avec matériel de contrôle dédié, générateur d'effets (FX) accessible, bibliothèque de machines maintenue *(modèle de licence à vérifier)*.
- **Leçon pour Luma.** L'ergonomie des **playbacks** physiques (faders et boutons) compte. La prise en charge MIDI de Luma (front montant, apprentissage) peut évoluer vers des surfaces de contrôle préconfigurées.

### SoundSwitch
- **Idées fortes.** Analyse des morceaux de la bibliothèque DJ, scripts lumière automatiques par morceau, édition fine sur une timeline calée sur la grille, « autoloops » quand un morceau n'est pas scripté, intégration aux logiciels et contrôleurs DJ *(liste exacte des intégrations à vérifier)*.
- **Leçon pour Luma.** C'est le **concurrent direct de Song to Show**. Sa force est le **flux DJ** : bibliothèque de morceaux, synchronisation avec le logiciel de mix, mode de secours sans script. Sa limite perçue *(à vérifier)* : une génération moins « directeur artistique » et moins explicable. Luma peut gagner sur l'**explication, l'intention en langage naturel, l'adaptation au rig réel et la sécurité**. Il perd aujourd'hui sur le flux DJ live et la synchronisation avec les logiciels de mix.

### Daslight
- **Idées fortes.** Prise en main par scènes et pas, interface « easy », boîtiers USB/Ethernet avec mode autonome *(fonctionnalités exactes selon le boîtier, à vérifier)*.
- **Leçon pour Luma.** Le public débutant veut **résultat immédiat + matériel qui marche**. L'onboarding avec projets de démo et la Console simplifiée de Luma vont dans le bon sens. Le diagnostic matériel (F-12, F-20) fera la différence.

### Lightkey
- **Idées fortes.** Une interface macOS très soignée, orientée live, une grande bibliothèque de machines, un visualiseur 3D intégré, une réaction audio, des présets d'effets prêts à l'emploi.
- **Leçon pour Luma.** Une **qualité visuelle et une cohérence d'interface** qui donnent confiance. Les incohérences de nommage et les chaînes non traduites de Luma (UX_UI_IMPROVEMENTS T2-T3) coûtent en crédibilité face à ce standard.

## 3. Grille comparative fonctionnelle (vue qualitative)

Légende : ●● fort, ● présent, ○ faible ou absent, ? à vérifier. Pour Luma, l'évaluation vient du code. Pour les concurrents, elle vient des capacités connues.

| Capacité | grandMA3 | MagicQ | Avolites | ONYX | SoundSwitch | Daslight | Lightkey | **Luma** |
|---|---|---|---|---|---|---|---|---|
| Moteur cues / tracking pro | ●● | ●● | ●● | ●● | ○ | ● | ● | ● (pas de tracking) |
| Effets relatifs (phasers / shapes) | ●● | ●● | ●● | ● | ● ? | ● | ● | ○ (absolus en position) |
| Timecode (MTC / LTC) | ●● | ●● | ●● | ● | ? | ● ? | ● ? | ● |
| Art-Net / sACN | ●● | ●● | ●● | ●● | ● | ● | ● | ● (pas d'ArtPoll) |
| GDTF / MVR | ●● | ● ? | ● ? | ● ? | ○ ? | ○ ? | ○ ? | ● (export MVR seul) |
| Visualiseur 3D intégré | ● | ●● | ● ? | ● ? | ○ ? | ● | ●● | ●● |
| Show automatique depuis la musique | ○ | ○ | ○ | ○ | ●● | ● ? | ● ? | ●● (pré-calcul) |
| Analyse de structure (sections, drops) | ○ | ○ | ○ | ○ | ●● | ○ | ○ ? | ● (heuristique) |
| Intention en langage naturel | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ●● |
| Explication des choix générés | ○ | ○ | ○ | ○ | ○ ? | ○ | ○ | ●● |
| Garde-fou photosensible | ○ ? | ○ ? | ○ ? | ○ ? | ○ ? | ○ ? | ○ ? | ●● |
| Assistant vocal | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| Flux DJ live (intégration aux logiciels de mix) | ○ | ○ | ○ | ○ | ●● | ● ? | ● ? | ○ |
| Robustesse multi-opérateur / redondance | ●● | ●● | ● | ● | ○ | ○ | ○ | ○ |

## 4. Où Luma ne doit pas se battre

- **Le moteur de console haut de gamme** (tracking complet, multi-utilisateurs, redondance, réseau de consoles). Le coût est énorme et la clientèle captive. Viser la **compatibilité** (MVR, GDTF, sACN, timecode) plutôt que la parité.
- **Le pixel mapping et la vidéo.** C'est un marché à part, sans synergie avec le cœur IA + musique.

## 5. Opportunités de différenciation (classées)

| # | Opportunité | Pourquoi Luma peut gagner | Socle existant | Manques |
|---|---|---|---|---|
| D1 | **Direction artistique explicable** | Seul produit, parmi ceux étudiés, qui dit *pourquoi* chaque section est éclairée ainsi, en langage d'éclairagiste *(à vérifier, sans recherche en ligne)*. | `why`, `summary`, notices de sécurité | Qualité mesurée sur le rendu (F-16), variantes auditionnables (F-10) |
| D2 | **Show adapté au rig réel, recompilable** | Le plan est indépendant des machines : un même show se recompile pour un autre kit. Aucun concurrent identifié ne le propose *(à vérifier pour SoundSwitch)*. | Séparation plan / compilateur | Rôles (F-04), retargeting (F-15) |
| D3 | **Sécurité intégrée** | Garde-fou photosensible Harding approché, strobe soumis à autorisation, contraintes de prompt imposées après le LLM, IA qui propose sans appliquer. | `flashGuard`, `enforceConstraints`, `autoApply: false` | Budget par lieu (F-19), vérification avant spectacle (F-13) |
| D4 | **IA hybride, locale d'abord** | Fonctionne hors ligne, LLM optionnel, cache reproductible, budget mensuel. | Règles locales, cache, repli | Intention structurée multilingue (IA-06), LLM local (F-22) |
| D5 | **Intention en langage naturel** (« contres bleus sur les couplets, explosion sur les drops ») | Aucun concurrent de la liste ne l'offre en natif, d'après les capacités connues *(à vérifier, sans recherche en ligne)*. | `parseIntent`, `groupsBySection`, LLM | Rôles (F-04) pour viser sans groupes, multilingue |
| D6 | **Song to Show Live** | Il réunit l'analyse live (déjà là) et la grammaire scénique (déjà là). C'est le seul moyen de concurrencer SoundSwitch sur son terrain. | `TempoTracker`, `DropPredictor`, `reactive.ts` | Planificateur réactif (F-06) |

## 6. Positionnement recommandé

> **« Le directeur lumière assisté qui comprend la musique, votre kit et vos contraintes de sécurité, et qui explique chacun de ses choix. »**

- **Contre SoundSwitch.** Explication, intention, adaptation au rig, sécurité, puis le mode live (F-06) pour couvrir son terrain.
- **Contre Daslight et Lightkey.** Génération automatique crédible, diagnostic matériel, qualité perçue (cohérence UI).
- **Face aux consoles pro.** Être le **meilleur outil de pré-production** (MVR en entrée et en sortie, génération, feuille de conduite), compatible avec leur exploitation (sACN, timecode). Ne pas chercher à les remplacer.

## 7. Bonnes idées concurrentes à reprendre, adaptées et sans copie

| Idée observée | Adaptation Luma | Réf. |
|---|---|---|
| Phasers / shapes relatifs | Blend `offset` dans `mergeSources` | F-03 |
| Mode de secours quand un morceau n'est pas scripté (autoloops) | Song to Show Live avec looks pré-compilés par style | F-06 |
| Bibliothèque de morceaux avec état « scripté / non scripté » | Badges sur les morceaux : analysé, show généré, audio manquant, retouché | UX S9, F-09 |
| Busking par palettes | Actions rapides et palettes par rôle | F-04 |
| Pré-programmation hors ligne gratuite | Palier Starter généreux sur le visualiseur | Stratégie commerciale |
| Import du plan depuis les outils de CAO | Import MVR | F-14 |
