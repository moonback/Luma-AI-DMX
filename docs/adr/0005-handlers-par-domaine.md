# 0005 — Handlers de commandes par domaine

- Statut : acceptée (18/10/2026)

## Contexte
`AppService.ts` atteignait 1 400 lignes, dont un `switch` de ≈ 110 cas : conflits, revue difficile, croissance à chaque fonctionnalité.

## Décision
`AppService` garde l'état partagé, le cycle de vie et le routage. Chaque domaine a son module dans `src/core/app/handlers/` ; le routage se fait sur le préfixe du type de commande (`project.`, `fixture.`…) via une table `ROUTES` typée `{ [D in CommandDomain]: … }`, donc exhaustive à la compilation. Les helpers non liés à une commande vivent dans `control.ts`, `monitor.ts` et `files.ts`.

## Conséquences
- Un nouveau préfixe de commande sans handler ne compile pas.
- Les champs d'`AppService` ne sont plus `private` : ils forment l'état partagé des handlers. Main et renderer n'utilisent que `execute`, les événements et le cycle de vie.
- Règle : aucun fichier de `src/core/app` au-delà de 400 lignes.
