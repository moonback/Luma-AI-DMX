# Roadmap produit priorisée — Luma-AI-DMX

> Audit du 2026-11-08, commit `8467bfc`. Cette roadmap couvre les constats de [SONG_TO_SHOW_AUDIT.md](SONG_TO_SHOW_AUDIT.md), [AI_FEATURE_AUDIT.md](AI_FEATURE_AUDIT.md), [UX_UI_IMPROVEMENTS.md](UX_UI_IMPROVEMENTS.md) et [FEATURE_IDEAS.md](FEATURE_IDEAS.md). Elle **complète** [`ROADMAP.md`](../../ROADMAP.md) (LUMA-101…150) au lieu de la remplacer : quand une ligne rend concret un item LUMA, la référence est indiquée.

## 1. Méthode de notation

- **Impact utilisateur (/10)** : nombre d'utilisateurs touchés × gravité ou gain perçu.
- **Valeur pro (/10)** : importance pour un usage professionnel (fiabilité, vitesse, compatibilité).
- **Innovation (/10)** : différenciation face au marché (voir [COMPETITIVE_ANALYSIS.md](COMPETITIVE_ANALYSIS.md)).
- **Faisabilité (/10)** : 10 = le socle existe et le changement est local ; 1 = refonte.
- **Complexité** : faible (moins d'une semaine), moyenne (1 à 4 semaines), élevée (plus d'un mois).
- **Priorité.** P0 : défaut qui trahit une promesse ou fait perdre du travail. P1 : forte valeur, socle prêt. P2 : forte valeur, prérequis nécessaires. P3 : opportunité.

Les corrections (préfixe **C-**) sont des écarts vérifiés dans le code. Les fonctionnalités (**F-**) et pistes IA (**IA-**) sont décrites dans leurs documents.

## 2. Tableau de notation complet

| ID | Amélioration | Impact | Valeur pro | Innov. | Faisab. | Complexité | Priorité |
|---|---|---|---|---|---|---|---|
| C-01 | Effets de la timeline au BPM du morceau (et non de `engine.bpm`) | 9 | 9 | 2 | 9 | faible | **P0** |
| C-02 | Rendre `pingpong` / `zigzag` dans `computeEffect` (+ tests) | 6 | 6 | 1 | 10 | faible | **P0** |
| C-03 | Confirmation avant une régénération qui écrase des retouches | 8 | 9 | 1 | 9 | faible | **P0** |
| C-04 | `snap` synchronisé au temps ; pas de `flicker` si le strobe est interdit | 6 | 7 | 2 | 9 | faible | **P0** |
| C-05 | Prise en compte de la mesure (3/4) dans `compileShow` | 4 | 6 | 1 | 9 | faible | P1 |
| C-06 | Confiance de section : étiquetée « estimation » ou réellement calculée | 5 | 7 | 3 | 8 | faible | P1 |
| C-07 | Notices typées (erreur / avertissement / info / succès) du cœur à l'UI | 7 | 7 | 2 | 9 | faible | P1 |
| C-08 | Nommage et i18n (navigation, `aria-label`, chaînes codées en dur) + contrôle lint | 6 | 6 | 1 | 9 | faible | P1 |
| C-09 | Retrait des `console.log` de la voix (vie privée) | 3 | 6 | 1 | 10 | faible | P1 |
| C-10 | LTC : passer de `ScriptProcessorNode` à `AudioWorklet` | 3 | 6 | 1 | 7 | moyenne | P2 |
| C-11 | Badge « libellé modifié, régénérer » dans le tableau des sections | 5 | 5 | 1 | 10 | faible | P1 |
| C-12 | Badge et relinking « audio manquant » | 6 | 7 | 1 | 9 | faible | P1 |
| C-13 | Section « Sécurité du show » dans les paramètres | 5 | 8 | 2 | 9 | faible | P1 |
| F-01 | Éditeur de structure musicale | 8 | 8 | 6 | 7 | moyenne | **P1** |
| F-02 | BPM et carte de tempo par timeline | 7 | 8 | 4 | 7 | moyenne | P1 |
| F-03 | Effets de position relatifs (blend `offset`) | 8 | 9 | 4 | 7 | moyenne | **P1** |
| F-04 | Rôles de machines déduits | 9 | 9 | 8 | 6 | moyenne | **P1** |
| F-05 | Profils de style structurés | 8 | 7 | 6 | 8 | moyenne | P1 |
| F-06 | Song to Show Live | 8 | 7 | 9 | 5 | élevée | P2 |
| F-07 | Setlist enchaînée | 7 | 8 | 5 | 6 | moyenne | P2 |
| F-08 | Show portable (projet + audio) | 8 | 8 | 3 | 9 | faible | **P1** |
| F-09 | Retouches protégées (généré + surcharges) | 8 | 9 | 6 | 5 | moyenne | P1 |
| F-10 | Variantes multiples avec audition (LUMA-118) | 7 | 7 | 7 | 6 | moyenne | P2 |
| F-11 | Palettes par harmonie et couleurs de marque | 6 | 6 | 5 | 9 | faible | P2 |
| F-12 | Rig Doctor | 8 | 9 | 6 | 8 | faible | **P1** |
| F-13 | Vérification avant spectacle (LUMA-108) | 7 | 9 | 4 | 8 | faible | P1 |
| F-14 | Import MVR (LUMA-146) | 6 | 9 | 3 | 6 | moyenne | P2 |
| F-15 | Retargeting de show | 7 | 9 | 9 | 4 | élevée | P2 |
| F-16 | Qualité artistique mesurée sur le rendu | 6 | 6 | 8 | 6 | moyenne | P2 |
| F-17 | Marqueurs de synchro manuels | 6 | 7 | 4 | 8 | faible | P2 |
| F-18 | Copilote d'exploitation | 7 | 8 | 7 | 7 | moyenne | P2 |
| F-19 | Budget de sécurité par lieu | 6 | 9 | 7 | 7 | faible | P1 |
| F-20 | ArtPoll et santé des nœuds (LUMA-107) | 6 | 8 | 2 | 6 | moyenne | P2 |
| F-21 | Préférences apprises localement (LUMA-115) | 6 | 5 | 7 | 6 | moyenne | P3 |
| F-22 | Fournisseur LLM local (LUMA-120) | 5 | 6 | 5 | 8 | faible | P3 |
| F-23 | Compensation de latence audio / DMX | 5 | 7 | 2 | 9 | faible | P2 |
| F-24 | Feuille de conduite imprimable (LUMA-147) | 5 | 7 | 2 | 9 | faible | P3 |
| F-25 | Courbe d'énergie éditable | 6 | 6 | 7 | 6 | moyenne | P3 |
| IA-06 | Intention structurée multilingue | 7 | 6 | 6 | 7 | moyenne | P1 |
| UX-S1 | Stepper Song to Show | 6 | 4 | 2 | 8 | faible | P2 |
| UX-S3 | Retouche de section unifiée (modal seul) | 5 | 4 | 1 | 9 | faible | P2 |
| UX-CS | Console Simplifiée : bouton « Régler », état mixte, couleur réelle des tuiles | 7 | 5 | 2 | 8 | faible | P1 |
| UX-DB | Dashboard : KPI exploitation / système, carte Song to Show, alertes actionnables | 5 | 5 | 2 | 8 | faible | P2 |

## 3. Les trois catégories

### Quick Wins (complexité faible, faisabilité ≥ 8)
C-01, C-02, C-03, C-04, C-05, C-06, C-07, C-08, C-09, C-11, C-12, C-13, F-08, F-12, F-13, F-19, F-23, UX-CS.

C-01 à C-04 sont des **P0** : ils corrigent un écart entre ce que l'utilisateur lit et ce que la lumière fait.

### Évolutions majeures (socle à étendre)
F-01, F-02, F-03, F-05, F-07, F-09, F-10, F-14, F-16, F-17, F-18, F-20, IA-06.

### Innovations stratégiques (différenciation durable)
F-04 (rôles), F-06 (Song to Show Live), F-15 (retargeting), F-16 (qualité mesurée), F-21 (préférences locales), F-25 (courbe d'énergie).

## 4. Les 10 améliorations prioritaires

| Rang | ID | Pourquoi maintenant |
|---|---|---|
| 1 | **C-01 / F-02** BPM du show = BPM du morceau | Défaut P0 : les effets générés ne tournent pas sur les temps dès que le BPM du projet diffère. Il invalide la promesse centrale de Song to Show. Le correctif est local (`engine/timeline.ts`). |
| 2 | **C-03 → F-09** Retouches protégées | Perdre du travail est rédhibitoire pour un pro. La confirmation d'abord (quelques heures), la fusion ensuite. |
| 3 | **C-02 + C-04** Mouvements et flashs fidèles au plan | Ce qui est annoncé (« pendule », « zigzag », « snap ») doit être rendu. Coût minime. |
| 4 | **F-03** Effets de position relatifs | Débloque la qualité des mouvements pour Song to Show, l'IA et les effets manuels. Rejoint la norme pro (phasers). |
| 5 | **F-04** Rôles de machines | Plus gros levier de qualité de génération. Prérequis du retargeting et des intentions spatiales. |
| 6 | **F-01** Éditeur de structure musicale | Rend l'analyse heuristique acceptable sur tous les morceaux, sans modèle supplémentaire. |
| 7 | **F-08** Show portable | Sans lui, un show ne voyage pas entre deux machines. Socle (zip, hash) déjà présent. |
| 8 | **F-12 + F-13** Rig Doctor et vérification avant spectacle | La fiabilité perçue se joue sur le matériel. Ce sont des contrôles déterministes, sans API. |
| 9 | **F-05 + IA-06** Styles structurés et intention multilingue | Ouvre Song to Show aux non-francophones et aux contextes (mariage, corporate, club) avec des garanties. |
| 10 | **F-06** Song to Show Live | L'innovation qui ouvre le marché DJ et club, en réutilisant le pipeline live existant. |

## 5. Roadmap en étapes

### Étape 0 · « Le show fait ce qu'il dit » (2 à 3 semaines)
- C-01, C-02, C-03, C-04, C-05, C-07, C-11, C-12.
- Tests à ajouter : formes `pingpong` / `zigzag` ; effet de timeline au BPM du morceau quand `engine.bpm` diffère ; le strobe interdit ne génère plus de `flicker` ; avertissement en cas d'écrasement de retouches.
- **Critère de sortie.** Un morceau à 128 BPM dans un projet à 120 BPM produit des chases calés sur le temps (test unitaire sur la phase), et aucun mouvement du tableau ne diffère de son rendu.

### Étape 1 · « Maîtrise et fiabilité » (1 à 2 mois)
- F-01, F-03, F-08, F-09 (fusion complète), F-12, F-13, F-19, F-23, C-06, C-08, C-09, C-13, UX-CS.
- Corpus de test : 20 à 30 morceaux réels annotés à la main (sections, downbeats), pour **mesurer** l'analyse (précision des frontières à ±1 mesure, BPM à ±2 %). C'est la première dette de qualité : les tests actuels sont synthétiques.
- **Critère de sortie.** Un pro peut préparer un show au bureau, le corriger, le transporter et le jouer sans perte, avec une liste de contrôle verte.

### Étape 2 · « Intelligence du rig » (2 à 3 mois)
- F-04, F-05, IA-06, F-11, F-16, F-10, F-02 (carte de tempo), F-17, F-18, F-14.
- **Critère de sortie.** « Contres bleus sur les couplets » fonctionne sans groupe créé, et le score de qualité est calculé sur le rendu.

### Étape 3 · « Différenciation » (3 à 6 mois)
- F-06 (Live), F-07 (setlist), F-15 (retargeting), F-20, F-21, F-22, F-24, F-25, C-10.
- **Critère de sortie.** Un DJ set sans fichier préparé produit des changements de look à la phrase, avec moins de 1 faux drop pour 10 min sur le corpus de test.

## 6. Ce qu'il ne faut pas faire maintenant

- **Réécrire le moteur ou passer à une autre stack.** Le cœur pur, les schémas zod et le routage typé sont de bonne qualité : chaque recommandation ci-dessus est un changement ciblé.
- **Ajouter un modèle de séparation de sources ou d'instruments** avant d'avoir mesuré l'analyse actuelle sur un corpus réel.
- **Activer l'auto-application IA par défaut**, ou laisser un LLM écrire des valeurs DMX.
- **Lancer la collaboration cloud (Phase 4 de `ROADMAP.md`)** avant que le show soit portable et protégé (F-08, F-09) : ce sont ses prérequis.

## 7. Correspondance avec `ROADMAP.md`

| Item existant | Rendu concret par |
|---|---|
| LUMA-103 Moniteur de santé des transports | F-20, F-18 |
| LUMA-107 Diagnostic réseau Art-Net / sACN | F-20 |
| LUMA-108 Test de sortie physique guidé | F-13 |
| LUMA-110 Mode répétition / exploitation verrouillée | Profil d'espace de travail « Show » (UX §8), F-13 |
| LUMA-113 Simulateur de proposition | Existe en partie (`previewValues`) ; F-16 pour Song to Show |
| LUMA-117 Optimiseur de show sous contraintes | F-19, F-05 |
| LUMA-118 Comparateur de variantes artistiques | F-10 (existe partiellement : `VariantCompareModal`) |
| LUMA-146 Import/export de formats de show | F-08, F-14 |
| LUMA-147 Générateur de rapports techniques | F-24 |
