# 0003 — Priorités de fusion

- Statut : acceptée

## Contexte
Plusieurs sources écrivent les mêmes attributs : programmeur, cues, IA, audio réactif, timeline, effets. L'opérateur doit pouvoir prédire qui gagne.

## Décision
Voir `core/engine/merge.ts` et le tableau de `docs/ARCHITECTURE.md` :
- couches de base regroupées par priorité ; dans une même priorité, intensité en HTP, autres attributs en LTP ; une priorité supérieure remplace une inférieure ;
- effets appliqués ensuite, seulement sur les attributs dont le propriétaire a une priorité inférieure ou égale ;
- le programmeur écrase tout et rend la main dès qu'il est relâché ;
- attributs non contrôlés : valeur par défaut du profil.

## Conséquences
Les priorités par défaut (IA 60, audio 55, cues 50, timeline 40) sont réglables. Toute nouvelle source doit déclarer sa priorité et être couverte par les tests de fusion.
