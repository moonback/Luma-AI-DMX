# 0004 — `src/core` sans Electron ni React

- Statut : acceptée

## Contexte
Le logiciel doit être testé sans interface ni matériel, et le renderer ne doit pas avoir accès à Node.

## Décision
`src/core` ne dépend ni d'Electron ni de React : dialogues et secrets sont injectés dans `AppService`. Le renderer ne parle au main que par un bus de commandes unique (`src/shared/commands.ts`), validé par Zod dans le processus principal ; l'origine de l'expéditeur est vérifiée.

## Conséquences
Tout le flux (patch → scène → cue → sortie virtuelle → IA) est testable sous Node (`tests/integration`). Une nouvelle commande = un schéma Zod, un type de résultat, un cas dans le handler de son domaine.
