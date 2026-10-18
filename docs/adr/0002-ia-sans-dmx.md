# 0002 — L'IA ne produit jamais de DMX

- Statut : acceptée

## Contexte
Un modèle de langage peut se tromper, halluciner un canal ou proposer un strobe dangereux. Une trame DMX fausse a des effets physiques immédiats (éblouissement, épilepsie photosensible, mouvement brusque d'une lyre).

## Décision
L'IA (locale ou OpenRouter) ne produit que des **actions typées** (`setIntensity`, `setColor`, `startEffect`…), validées par Zod puis contre le rig réel. Chaque proposition est prévisualisée, appliquée au plus une fois, et le rapport distingue actions exécutées et ignorées. Le garde-fou photosensible filtre les effets ; le strobe exige une autorisation explicite ; les fonctions spéciales (reset, lampe) sont hors de portée. Un plan LLM invalide est réparé section par section à partir du plan local plutôt que rejeté.

## Conséquences
- Toute nouvelle capacité IA passe par une nouvelle action typée et son test dans le banc d'évaluation (`tests/eval`).
- Le contrat d'actions est versionné (`AI_ACTIONS_VERSION`, `migrateAiActions` dans `core/ai/actions.ts`). Tout changement de `aiActionSchema` fait échouer `tests/unit/ai-contract.test.ts` tant que la version n'est pas incrémentée, la migration écrite et les échantillons de la nouvelle version figés dans `tests/fixtures/ai-contract/`.
