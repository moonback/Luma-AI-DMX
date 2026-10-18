# Contribuer à Luma AI DMX

## Flux de travail
1. Une branche par fonctionnalité ou correctif, partie de `master` : `feat/…`, `fix/…`, `docs/…`.
2. Des commits petits, chacun vert (`npm run check`), au format [Conventional Commits](https://www.conventionalcommits.org/fr/) :
   ```
   feat(scene): poser une structure au clic
   fix(engine): le blackout coupe aussi dimmer#n
   ```
   Types acceptés : `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `style`, `revert`.
   Le titre dit **ce qui change** (≤ 100 caractères) ; le corps dit **pourquoi**. Pas de « up », pas de compte rendu de conversation.
3. Une PR vers `master`, même en solo. La CI (`.github/workflows/ci.yml`) doit être verte : messages de commit, typecheck, lint, tests + couverture de `src/core`, e2e, paquet Windows.
4. Toute modification visible par l'utilisateur ajoute une ligne dans la section « Non publié » de `CHANGELOG.md`.

## Vérifications locales
| Commande | Rôle |
|---|---|
| `npm run check` | typecheck + lint + tests + perf |
| `npm run test:coverage` | tests avec seuils de couverture sur `src/core` |
| `npm run test:e2e` | build puis Playwright |
| `node scripts/check-commits.mjs origin/master` | vérifie les messages de la branche |

## Publier une version
1. Déplacer « Non publié » sous un nouveau titre `## [x.y.z] — AAAA-MM-JJ` dans `CHANGELOG.md`.
2. `npm version x.y.z` (met à jour `package.json` et crée le tag `vx.y.z`).
3. `git push --follow-tags` : le workflow `release.yml` construit, signe (si les secrets `WIN_CSC_LINK` et `WIN_CSC_KEY_PASSWORD` existent) et publie la release GitHub, lue par la mise à jour automatique. Une version `x.y.z-beta.n` part sur le canal bêta.

## Textes de l'interface
Tout nouveau texte visible passe par `src/renderer/i18n` : la clé dans `fr.ts`, sa traduction dans `en.ts` (le typage refuse une clé manquante), puis `useT()` dans un composant ou `t()` ailleurs. `node scripts/check-i18n.mjs` (lancé par `npm run lint`) refuse qu'un fichier gagne des textes en dur ; après une extraction, `node scripts/check-i18n.mjs --update` abaisse la référence.

## Règles de conception
Voir `docs/ARCHITECTURE.md` et les décisions dans `docs/adr/`. En particulier : `src/core` ne dépend ni d'Electron ni de React ; l'IA ne produit jamais de DMX ; aucun fichier source ne dépasse 600 lignes.
