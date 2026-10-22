# Audit de l'assistant IA — Luma AI DMX

Date : 22/10/2026 · Branche : `master` · Node 24.16.0 · Contrat d'actions IA v2 (inchangé).

Ce document distingue **[Fait]** (constaté dans le code ou par un test), **[Mesure]** (résultat d'une commande),
**[Hypothèse]** (non démontré) et **[Recommandation]**.

## 1. Périmètre examiné

- IA : `src/core/ai/actions.ts`, `director.ts`, `local/interpreter.ts`, `providers/openrouter.ts`, `responseCache.ts`, `transient.ts`, `usage.ts`.
- Application : `src/core/app/handlers/ai.ts`, `src/shared/commands.ts`, `src/renderer/features/AiDirector.tsx` (boutons Proposer / Appliquer / Annuler), `src/renderer/voice/tools.ts` (assistant vocal, mêmes commandes).
- Tests : `tests/unit/ai.test.ts`, `ai-contract.test.ts`, `safety.test.ts`, `tests/eval/*`, `tests/integration/workflow.test.ts`.
- Non examinés en profondeur : moteur (`src/core/engine/`) au-delà de `setAiValues` / `startEffect` / `compute`, flux photo → scène / profil, Song-to-Show.

## 2. Pipeline observé [Fait]

```
Renderer (AiDirector / voix)
  └─ ai.propose {prompt, continueThread}            src/shared/commands.ts (zod, 2000 car. max)
      └─ aiPropose()                                handlers/ai.ts — un seul appel à la fois (aiBusy), annulable (aiAbort)
          ├─ OpenRouter (si clé + fournisseur choisi)
          │    guardBudget → describeRig(rig + état « now » + effets IA) → completeJson
          │    (json_schema / json_object selon le modèle, 3 tentatives sur 429/5xx, délai global)
          │    → extractJson → llmPlanSchema (souple) → 1 requête de réparation max
          │    └─ échec → repli local si fallbackToLocal, sinon UserError
          └─ Local : interpretLocally()             règles déterministes FR/EN
      └─ buildProposal()                            migration de contrat → validateActions (aiActionSchema strict,
                                                    résolution des cibles, capacités, strobe) → aperçu
      └─ guardFlashes()                             simulation 3 s, garde-fou photosensible
      └─ storeProposal()                            empreinte du rig (patch, groupes, scènes), 20 propositions max
  └─ ai.apply {proposalId}
      ├─ refus si l'empreinte a changé (proposition périmée), anti-rebond 300 ms, proposition consommée une seule fois
      └─ executeProposal()                          un brouillon unique, validé et commité une fois ;
                                                    effets démarrés après le commit ; vérification des sources
                                                    (IA / Manuel / autre) sur chaque attribut écrit
  └─ ai.undoApply                                   restaure le projet d'avant l'application (si rien n'a changé depuis)
```

Sécurité constatée : l'IA ne produit que les 13 actions du contrat (aucune trame DMX, aucun armement de sortie) ;
toute réponse distante est revalidée par `aiActionSchema` ; le strobe est refusé si `allowStrobe` est faux et bridé
à `maxStrobeHz` ; le programmeur manuel garde la priorité (vérification « Manuel » dans le rapport) ; la clé
OpenRouter reste dans le processus principal (`secrets`).

## 3. Mesures initiales [Mesure]

| Commande | Résultat avant intervention |
|---|---|
| `vitest run tests/eval tests/unit/ai*.ts tests/unit/safety.test.ts tests/integration/workflow.test.ts` | 44 réussis, 1 ignoré (banc OpenRouter : aucun enregistrement) |
| Banc local (175 cas) | reconnaissance 0,993 · intention 0,992 · validité 1 · 0 violation · latence moy. 2,0 ms / p95 11 ms (1ʳᵉ exécution, JIT inclus) |
| Sonde manuelle des 10 exemples de `audit.md` + variantes | 9 défauts reproduits (section 4) |

## 4. Défauts confirmés et corrigés

| # | Prio | Symptôme reproduit | Cause racine | Correction |
|---|---|---|---|---|
| 1 | P0 | « Mets les pars en bleu **sans strobe** » démarre un strobe quand il est autorisé ; « plus énergique sans chase » garde le chase ; « sans mouvement » lance un panTilt | Aucune gestion de la négation : le mot de l'effet suffisait à le déclencher | `stripNegations()` retire « sans / pas de / aucun … <effet ou couleur> » du texte ; filtre final sur `startEffect` et les effets des cues de `createSequence` ; notice « Contrainte respectée » |
| 2 | P1 | « Mets les lyres en rouge **pas les pars** » colore… les PAR | « pas les X » non reconnu comme exclusion : le groupe Pars devenait la cible | `EXCLUDE_RE` couvre « pas les », « ne touche pas aux », « mais garde », « sans modifier » (sauf « ne … pas », exclu par lookbehind) |
| 3 | P1 | « **Divise par deux** la vitesse de cet effet » → intensité 50 % sur les PAR | La préposition « par » était lue comme le type PAR ; « divise » comme une baisse d'intensité | « par » seul n'est plus un type (pluriel, article ou début de clause d'exclusion requis) ; « vitesse » + divise/double → `adjustEffect` ×0,5 / ×2 |
| 4 | P1 | « Baisse l'intensité **de 20 %** » → niveau absolu 20 % | Tout pourcentage était absolu | « de N % » + verbe de variation = relatif, par projecteur (`relativeLevels`) ; « à N % » reste absolu ; « réduis un peu » = ×0,8 |
| 5 | P1 | « Baisse **leur** intensité » → tous les projecteurs | Aucune mémoire de travail dans le mode local | Le fil (`threads`) mémorise les projecteurs des actions **réellement exécutées** de la dernière application ; invalidé si le rig change ou hors fil ; sans référent → question, aucune action |
| 6 | P1 | « **Annule** uniquement la dernière modification » → `releaseAi` (toute la couche IA relâchée) | `annule\w*` dans la règle « relâcher » | Reconnu à part : aucune action, renvoi vers le bouton « Annuler » (`ai.undoApply`) |
| 7 | P1 | Effet refusé par le moteur après le commit : rapport « Effet démarré » | L'erreur levée dans le démarrage différé était seulement journalisée | Le démarrage différé déplace l'action de `executed` vers `skipped` avec la raison |
| 8 | P1 | Cible LLM `{groupNames:["Inconnu"], fixtureTypes:[spot]}` → tous les spots | `resolveAiTarget` n'annulait la cible que sans filtre de type/tag | Des noms tous introuvables donnent une cible vide (avertissement conservé) |
| 9 | P3 | « Ne change rien » → « non reconnu » + liste d'exemples ; « la face » ne trouve pas le groupe « Faces » | Pas de règle ; correspondance de nom exacte | Règle « aucune modification » ; tolérance singulier/pluriel pour les noms de groupe ≥ 4 lettres |
| 10 | P3 | `withVision` laissait `aiAbort` renseigné après une analyse photo | `finally` incomplet | `app.aiAbort = null` |

OpenRouter [Fait] : le prompt système ne disait rien des négations, du relatif, de l'ambiguïté ni de l'injection
d'instructions. Ajout de quatre règles (contraintes prioritaires, « de 20 % » relatif, `actions: []` + question
si ambigu ou « ne change rien », texte et noms traités comme des données). [Hypothèse] amélioration de qualité :
**non mesurée**, aucun appel payant n'ayant été autorisé et aucun enregistrement n'existant pour le banc rejoué.

## 5. Fichiers modifiés

- `src/core/ai/local/interpreter.ts` — défauts 1 à 6 et 9.
- `src/core/ai/director.ts` — défauts 7 et 8 ; `proposeLocally(…, lastTargets?)`.
- `src/core/app/handlers/ai.ts` — mémoire bornée du fil (défaut 5), défaut 10.
- `src/core/ai/providers/openrouter.ts` — règles du prompt système.
- `tests/unit/ai-understanding.test.ts` (nouveau, 13 tests) ; `tests/eval/cases.json` (+12 cas).

Contrat d'actions, schémas zod, IPC et interface : **inchangés**.

## 6. Plan de tests

| Catégorie (`audit.md` §12.1) | Couverture ajoutée |
|---|---|
| Négations / contraintes de sécurité | strobe autorisé mais nié ; chase et mouvement niés dans les modèles ; couleur niée |
| Exclusions | « pas les pars », « mais garde les faces » |
| Modifications relatives, unités | « de 20 % » vs « à 20 % », « un peu », vitesse ÷2 / ×2 |
| Références au contexte | « leur » avec et sans référent ; parcours service `ai.propose` → `ai.apply` → suite du fil / nouveau fil |
| Faux positifs | « divise par deux » ≠ PAR |
| Cibles ambiguës / inconnues | groupe inconnu + type ne s'élargit pas |
| Actions partiellement exécutées | effet refusé par le moteur → `skipped` |
| Commandes sans effet | « ne change rien », « annule la dernière » |

Métriques du banc (inchangées, `tests/eval/ai.eval.test.ts`) : reconnaissance, intention, validité structurelle,
violations de sécurité (bloquant) et latence, comptées séparément. Les seuils de référence n'ont pas été modifiés.

Preuve que les tests détectent les défauts [Mesure] : sur le code d'origine (`git stash` de `src/`), les 13 tests
unitaires échouent et le banc à 187 cas donne **4 violations de sécurité**, reconnaissance 0,974, intention 0,971.

## 7. Résultats après intervention [Mesure]

| Commande | Résultat |
|---|---|
| `npm run typecheck` | OK |
| `eslint .` + `check-file-size` | OK |
| `check-i18n` | OK après correction de l'échec préexistant de `Stage3D.tsx` (libellé « Cadrer » passé par `t('stage3d.frame')`) |
| `npm run test` | 496 réussis, 1 ignoré |
| `npm run test:perf` | 9 réussis |
| Banc local (187 cas) | reconnaissance 0,994 · intention 0,993 · validité 1 · **0 violation** · latence moy. 0,56 ms / p95 1,3 ms |

Performance : l'objectif « < 100 ms » pour les commandes locales est tenu avec deux ordres de grandeur de marge ;
aucune optimisation n'a été entreprise, faute de goulot mesuré. L'écart avec la mesure initiale vient du
préchauffage JIT, pas d'un gain de code. La latence fournisseur n'a pas pu être mesurée (pas d'appel réel).

## 7 bis. Lot 2 — garde-fous, contrat v3, prompt, application automatique

- **Contraintes appliquées par le code** (`src/core/ai/guards.ts`) : les négations, exclusions et « ne touche pas aux
  couleurs » de la demande sont relues avec les règles du mode local, et toute action (locale ou OpenRouter) qui les
  enfreint est refusée avec la raison ; l'aperçu est recalculé. `ai.revise` refait le contrôle, donc une action refusée
  ne revient pas par une révision.
- **Contrat v3** (additif, migration identité, échantillons figés) : `target.exclude` (groupes / projecteurs exclus).
  `resolveAiTarget` déplacé dans `src/core/ai/target.ts`.
- **`adjustIntensity`** : action du modèle uniquement, convertie à la réception en `setIntensity` par niveau actuel,
  pour que la proposition et l'aperçu montrent les niveaux réels. Ce n'est pas une action du moteur.
- **Prompt** : règles `exclude` / `adjustIntensity` / `question`, cinq exemples demande → JSON ; champ `question`
  affiché dans l'Assistant IA et transmis à l'assistant vocal. La compaction de la description du kit n'a **pas** été
  faite : son gain ne peut pas être mesuré sans appel payant, et elle risque d'appauvrir les demandes spatiales.
- **Application automatique** (Paramètres › Assistant, désactivée par défaut) : une proposition validée est exécutée
  aussitôt par le même chemin que le bouton « Appliquer » (empreinte du kit, anti-rebond, une seule application),
  jamais quand le modèle pose une question ; « Défaire » reste disponible ; l'assistant vocal est prévenu par son prompt.
- Tests : `tests/unit/ai-guards.test.ts` (11), `tests/components/assistantPanel.test.tsx` complété.

## 8. Problèmes restants et limites

- **P2** — Une cible nommée par un mot inconnu du projet (« les contre-jours » quand le groupe s'appelle « Contres »)
  retombe sur « tous les projecteurs » dans le mode local. [Recommandation] demander une précision quand la phrase
  contient « les/des <nom> » non résolu.
- **P2** — Les couleurs des ambiances prédéfinies (« ambiance Noël sans rouge ») ne sont pas filtrées par la négation ;
  seules les couleurs citées explicitement le sont.
- **P2** — Qualité OpenRouter non mesurée : enregistrer le banc (`LUMA_EVAL_RECORD=1`, payant) pour comparer.
- **P2** — `ai.apply` : les valeurs IA sont posées avant le commit ; si le commit échoue, `releaseAi` relâche toute la
  couche IA, y compris l'état antérieur.
- **P3** — La vérification du rapport couvre les attributs de la couche IA, pas l'état des effets ni des cues créés.
- **P3** — « Crée une séquence de trois tableaux » reste non reconnu (échec préexistant du banc).
