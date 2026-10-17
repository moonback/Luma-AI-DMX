# Architecture

```
src/
  shared/      brand.ts, commands.ts (contrat IPC Zod + types de résultats), api.ts (types du pont preload)
  core/        logique métier SANS Electron ni React (testable sous Node)
    model/       schémas Zod du domaine (profils, patch, scènes, cues, effets, timeline, projet)
    fixtures/    attributs, profils (validation, bibliothèque, profils fictifs), patch (chevauchements), couleur
    engine/      Engine (tick), merge (priorités), render (DMX 8/16 bits, fonctions spéciales, blackout),
                 playback (cue lists), effects, timeline, resolve (index du projet)
    protocols/   config (schémas), types (OutputAdapter : état, stats, reconnexion), artnet, sacn, enttec,
                 virtual, OutputManager (armement, STOP, cadence, état transmis)
    ai/          actions (schéma strict), director (validation, aperçu, exécution, vérification),
                 local/interpreter (mode déterministe), providers/anthropic (SDK officiel)
    audio/       analyzer (niveau, énergie, attaques, BPM, montées d'énergie), reactive (réactions → moteur)
    project/     format (création, versions, migrations), store (écriture atomique, .bak, récupération)
    settings/    paramètres applicatifs ; log/ journal en mémoire ; visualizer/ modèle visuel 2D/3D
    app/         AppService : orchestration + bus de commandes (injection des dialogues et secrets)
  main/        Electron : fenêtre sécurisée, IPC validé, secrets chiffrés (safeStorage)
  preload/     contextBridge : { invoke, on }
  renderer/    React + Zustand : App (shell), features/* (12 espaces), audioEngine (Web Audio)
tests/         unit, integration (parcours complet), components (Testing Library), e2e (Playwright + Electron)
```

## Flux de données
1. Le renderer envoie une commande typée `window.luma.invoke({ type, ... })`.
2. Le processus principal vérifie l'origine, valide la commande avec `commandSchema` (Zod), puis appelle `AppService.execute`.
3. Les mutations de projet sont appliquées à une copie, **revalidées entièrement** avec `projectSchema`, puis remplacent le document. Les mutations invalides sont refusées sans effet de bord. L'index du projet est reconstruit et transmis au moteur.
4. Le moteur tourne dans le processus principal (`setTimeout` avec compensation de dérive, sans rattrapage après un dépassement). À chaque tick :
   - avancement des playbacks, des effets et de la timeline ;
   - fusion des sources ;
   - complément par les valeurs par défaut, puis virtual dimmer, master et blackout ;
   - rendu en DMX ;
   - remise des trames à l'`OutputManager`.
5. Événements vers le renderer : `values` (≈ 25 Hz, sources ≈ 5 Hz), `runtime` (≈ 10 Hz), `project` (à chaque modification), `log`.

Trois états distincts sont exposés :
- **état demandé** : programmeur, couches, cues ;
- **état calculé** : `engine.values` / `engine.universes` ;
- **état transmis** : `OutputManager.transmitted`, la dernière trame remise au transport, avec son horodatage.

Aucun élément de l'interface ne présente l'état calculé comme une preuve de réception par le projecteur.

## Politique de priorité et de fusion (`core/engine/merge.ts`)
| Source | Priorité par défaut | Réglage |
|---|---|---|
| Manuel (programmeur) | toujours gagnant | — |
| Couche IA | 60 | Settings › Moteur |
| Audio réactif | 55 | Settings › Moteur |
| Listes de cues | 50 | propriétés de la liste |
| Effets | 50 | paramètres de l'effet |
| Timeline | 40 | Settings › Moteur |

- Couches de base (cues, IA, timeline, audio) regroupées par priorité. **Dans une même priorité** : intensité en HTP, autres attributs en LTP (activation la plus récente). Une **priorité supérieure remplace** la valeur d'une priorité inférieure.
- Effets : appliqués ensuite. Un effet ne touche un attribut que si son propriétaire actuel a une priorité inférieure ou égale. Mode `override` = remplace ; mode `scale` = multiplie.
- Programmeur : écrase tout. Le relâcher rend immédiatement la main aux autres sources.
- Attributs non contrôlés : valeur par défaut du profil (par exemple shutter « ouvert », pan/tilt au centre).

## Moteur d'effets
Les effets sont des fonctions pures de la phase (`computeEffect`). Les instances intègrent leur phase dans le tick : aucun timer par effet, pas de travail sur le thread de l'interface. L'aléatoire utilise un hachage déterministe (`hash01(seed, cycle, fixture)`), ce qui donne des résultats reproductibles. Le strobe est plafonné par `maxStrobeHz`.

## Préparation 3D
`core/visualizer/model.ts` produit des `VisualFixture` (position en mètres, pan/tilt en degrés, angle de faisceau, couleur, intensité), indépendants du canvas 2D. Une vue Three.js ou React Three Fiber peut consommer ce même modèle sans toucher au moteur.

## Choix techniques
- **Protocoles implémentés en interne** (dgram) plutôt qu'avec des bibliothèques tierces : Art-Net (ArtDmx) et E1.31 (paquet de données) tiennent en environ 100 lignes chacun, dont les octets sont testés contre les offsets des spécifications. Cela évite des dépendances peu maintenues.
- **Moteur dans le processus principal**, sans worker : la charge mesurée est d'environ 0,25 ms par tick pour quelques projecteurs. Le test de charge (1 000 projecteurs, 12 univers, 3 effets) a mesuré ≈ 7,4 ms par tick sur la machine de développement, soit ≈ 30 % de la période de 25 ms. Au-delà de quelques milliers de projecteurs, un worker ou une optimisation de la fusion deviendrait nécessaire. Un worker ajouterait de la sérialisation sans gain démontré.
- **Pas de base de données** : un projet est un fichier JSON versionné, lisible et exportable.

## Dépendances
| Paquet | Raison |
|---|---|
| electron, electron-vite, vite, @vitejs/plugin-react | application desktop, build main/preload/renderer |
| react, react-dom | interface |
| zustand | état partagé du renderer |
| zod | validation aux frontières (IPC, fichiers, IA, paramètres) |
| lucide-react | jeu d'icônes uniforme |
| serialport | accès série pour l'Enttec DMX USB Pro (module natif N-API, chargé dynamiquement) |
| @anthropic-ai/sdk | fournisseur IA externe (SDK officiel, sorties structurées) |
| vitest, jsdom, @testing-library/* | tests unitaires, d'intégration et de composants |
| @playwright/test | tests end-to-end sur l'application Electron |
| eslint, typescript-eslint, eslint-plugin-react-hooks | lint |
| electron-builder | packaging |
