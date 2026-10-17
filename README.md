# Luma AI DMX

Logiciel desktop de contrôle d'éclairage DMX assisté par IA, construit avec Electron, React et TypeScript. Il réunit une console DMX manuelle, un environnement de programmation (scènes, cues, effets, timeline) et un assistant « Lighting Director » qui produit des actions structurées et validées.

Le nom et la marque sont centralisés dans [`src/shared/brand.ts`](src/shared/brand.ts).

> **État du projet.** Le noyau est fonctionnel et testé en sortie virtuelle et en émission UDP réelle en boucle locale. Aucun test n'a été réalisé sur un projecteur ou une interface DMX physique. Voir [Limites matérielles](#limites-matérielles).

## Sommaire
- [Prérequis](#prérequis)
- [Installation et démarrage](#installation-et-démarrage)
- [Compilation, tests et packaging](#compilation-tests-et-packaging)
- [Prise en main](#prise-en-main)
- [Configuration DMX](#configuration-dmx)
- [Mode virtuel](#mode-virtuel)
- [Configuration de l'IA](#configuration-de-lia)
- [Sécurité](#sécurité)
- [Limites matérielles](#limites-matérielles)
- [Problèmes connus](#problèmes-connus)
- Documentation : [architecture](docs/ARCHITECTURE.md), [format de projet](docs/PROJECT_FORMAT.md), [format de profil](docs/PROFILE_FORMAT.md), [test avec du matériel réel](docs/HARDWARE.md)

## Prérequis
- Node.js 22 ou plus récent (développé avec Node 24.16) et npm.
- Windows 10/11 x64 : c'est la plateforme où le build et les tests ont été exécutés. macOS et Linux sont configurés dans `electron-builder.yml`, mais **n'ont pas été construits ni testés**.
- Facultatif : une clé API Anthropic pour le fournisseur IA externe.

## Installation et démarrage
```bash
npm install
```
```bash
npm run dev
```
`npm run dev` démarre Electron avec rechargement à chaud. Pour lancer le build de production sans installateur :
```bash
npm run build
```
```bash
npm start
```

## Compilation, tests et packaging
| Commande | Rôle |
|---|---|
| `npm run typecheck` | TypeScript strict (`strict`, `noUncheckedIndexedAccess`) |
| `npm run lint` | ESLint (typescript-eslint + règles des hooks React) |
| `npm test` | Vitest : tests unitaires, d'intégration et de composants |
| `npm run test:e2e` | Build puis Playwright, qui pilote l'application Electron réelle |
| `npm run check` | typecheck + lint + tests |
| `npm run package` | Installateur Windows NSIS dans `release/` |
| `npm run package:dir` | Application décompressée, sans installateur |

## Prise en main
1. **Créer un projet** : icône « + » de la barre supérieure ou `Ctrl+N`.
2. **Patcher des projecteurs** : *Fixtures › Ajouter*. Choisissez un profil, un mode, un univers et une quantité. L'adresse est automatique ou manuelle. Les chevauchements et les dépassements de 512 sont refusés. Les profils inclus sont **fictifs** (« Luma Demo ») et servent aux tests : ils ne décrivent aucun modèle commercial. Pour vos projecteurs, importez des profils (voir [docs/PROFILE_FORMAT.md](docs/PROFILE_FORMAT.md)).
3. **Piloter en manuel** : dans la *Live Console*, sélectionnez des projecteurs ou un groupe. Les contrôles sont générés à partir des fonctions du profil : dimmer, couleur (RGB, RGBW ou roue), pan/tilt 16 bits, shutter, gobo… Le manuel est **toujours prioritaire**. `Échap` le relâche.
4. **Enregistrer une scène** : *Live Console › Enregistrer scène* (à partir des valeurs du programmeur).
5. **Créer des cues** : *Cues & Sequences*. Chaque cue référence une scène, avec un fondu, un délai, une courbe et un déclenchement manuel ou enchaîné. Commandes : `Espace` = GO, `Maj+Espace` = BACK, `P` = pause/reprise.
6. **Effets et timeline** : *Effects* (10 types, synchronisation BPM, graine aléatoire) et *Timeline* (scènes, effets et cues sur une ligne de temps, avec annuler/rétablir).
7. **Assistant IA** : *AI Lighting Director*. Décrivez l'ambiance souhaitée, vérifiez la proposition (cibles, avertissements, aperçu), modifiez ou excluez des actions, puis appliquez. Un rapport indique les actions exécutées, celles qui ont été ignorées et la vérification de l'état calculé.
8. **Enregistrer** : `Ctrl+S`. Au moment de quitter, l'application signale les modifications non enregistrées.

## Configuration DMX
Dans *DMX Output › Sorties* :
- **Art-Net** : destination IPv4 (nœud ou broadcast, par exemple `2.255.255.255`), interface locale, correspondance univers local → Port-Address (0–32767), séquence 1–255.
- **sACN / E1.31** : multicast (`239.255.hi.lo`) ou unicast, priorité 0–200, CID persistant. À l'arrêt, l'application envoie 3 paquets « stream terminated ».
- **USB-DMX (Enttec DMX USB Pro)** : choix du port série. La détection signale les puces FTDI, ce qui **ne confirme pas** qu'il s'agit d'une Enttec.
- **Sortie virtuelle** : aucune émission matérielle.

Les sorties réelles **démarrent toujours désarmées**. Pour émettre, cliquez sur *Armer* puis confirmez. Le badge **SIMULATION / LIVE** de la barre supérieure indique en permanence si une sortie réelle est armée. Le bouton **STOP** (`Maj+Échap`) coupe immédiatement toutes les émissions réelles.

Le moniteur 512 canaux affiche séparément **l'état calculé** par le moteur et **la dernière trame transmise** par chaque sortie. Une trame transmise ne prouve pas que le projecteur l'a reçue.

## Mode virtuel
La sortie virtuelle (univers 1 à 4 par défaut) enregistre les trames reçues, l'historique des changements par canal (2 000 derniers) et des statistiques. Elle accepte aussi l'injection de défauts (*DMX Output › Diagnostics*) : erreurs d'envoi ou déconnexion simulée, pour vérifier les alertes et la reconnexion automatique (délai de 1 s à 10 s). Toute la programmation fonctionne sans matériel.

## Configuration de l'IA
- **Mode local déterministe (par défaut)** : règles et modèles intégrés, en français et en partie en anglais, sans réseau. Il comprend notamment les ambiances (lounge, club…), les couleurs, les durées, les intensités, les cibles (« les quatre lyres », noms de groupes), les effets (chase, vague, arc-en-ciel, pulse, mouvements, strobe si autorisé), les drops, les shows de N minutes, les variantes et les ajustements (« plus chaud et moins agressif »). Ce mode est signalé comme tel et ne se présente jamais comme un modèle de langage. Une demande non reconnue est déclarée comme telle.
- **Claude (Anthropic)** : *Settings › IA et fournisseurs* : fournisseur « Claude », modèle (par défaut `claude-opus-5-5`), effort, délai. La clé API est saisie dans l'application, chiffrée par le système (Electron `safeStorage`) dans le processus principal. Elle n'est jamais renvoyée à l'interface ni écrite dans un projet. Les réponses passent par les sorties structurées du SDK officiel `@anthropic-ai/sdk`, puis sont **revalidées** par le schéma strict de l'application. Le repli serveur (`fallbacks: "default"`) est activé en cas de refus de modèle. Si le fournisseur est indisponible, l'application bascule sur le mode local et le signale.
- L'IA ne produit **que** des actions typées (`setIntensity`, `setColor`, `setPosition`, `startEffect`, `stopEffect`, `createScene`, `applyScene`, `createCue`, `createSequence`, `setBpm`, `releaseAi`). Elle n'envoie jamais de DMX, n'exécute aucun code et n'a pas accès aux fonctions spéciales (reset, lampe). Le strobe exige l'autorisation explicite *Autoriser l'IA à proposer des effets strobe*.

## Sécurité
- Electron : `contextIsolation`, `sandbox`, `nodeIntegration: false`, CSP stricte, navigation et nouvelles fenêtres bloquées, seule la permission micro est accordée. Le renderer ne reçoit qu'une API à deux fonctions (`invoke` et `on`). Chaque commande IPC est validée par Zod dans le processus principal ; les origines inconnues sont refusées.
- Priorités : le manuel est toujours prioritaire. À priorité égale : HTP pour l'intensité, LTP pour le reste. Une priorité supérieure remplace. Détails dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Fonctions spéciales : les plages marquées `dangerous` dans les profils (reset, extinction de lampe) ne sont émises qu'après confirmation manuelle. Toute autre source est ramenée à la valeur par défaut du canal.
- Blackout configurable (*Settings › Moteur & sécurité*) : intensités seules, intensités + shutter fermé (par défaut), ou tous les canaux à 0. **Le blackout n'est pas un état universellement sûr** : vérifiez le comportement de vos appareils.
- Strobe : fréquence plafonnée (10 Hz par défaut, réglable).
- Protection contre les boucles : un seul enchaînement automatique de cue par tick, applications IA limitées à une toutes les 300 ms, au plus 50 actions par proposition et 64 cues par séquence.
- STOP OUTPUT : arrêt des émissions. Ensuite, **chaque projecteur applique son propre comportement en cas de perte de signal DMX** (maintien de la dernière valeur ou extinction selon le modèle). Consultez la documentation de vos appareils.

## Limites matérielles
- **Aucun matériel DMX n'a été testé.** Art-Net et sACN sont implémentés d'après les spécifications. Le format des paquets et l'émission UDP sont vérifiés par des tests en boucle locale (`127.0.0.1`), mais pas avec un nœud ou un projecteur réel.
- Le pilote USB-DMX ne prend en charge que l'Enttec DMX USB Pro (« label 6 », d'après la documentation Enttec) et n'a pas été vérifié sur matériel. Les interfaces « Open DMX » (FTDI sans microcontrôleur, qui demandent un timing de break précis) ne sont **pas** prises en charge.
- La fréquence d'émission est **mesurée**, pas garantie. Sous Windows, la résolution des timers donne environ 37 à 40 Hz pour une consigne de 40 Hz (valeur affichée dans la barre d'état). Les latences réseau et d'interface ne sont pas mesurées.
- Le visualiseur 2D est une représentation approximative, pas une simulation photométrique.
- L'audio réactif estime le BPM (histogramme des intervalles entre attaques, parfois faux d'un facteur 2) et détecte des montées d'énergie. Il **ne détecte pas** les refrains ni les drops.

## Problèmes connus
- Les projecteurs multi-cellules (barres LED à plusieurs segments RGB) ne sont pas modélisés : un attribut par mode.
- Dans une liste de cues, les attributs non-intensité absents du cue suivant sont **maintenus** (tracking), alors que les intensités absentes retombent à 0.
- Quand une proposition IA contient plusieurs actions immédiates avec des fondus différents, le fondu le plus long s'applique à l'ensemble.
- Les raccourcis clavier sont fixes (liste dans *Settings › Raccourcis*).
- Le visualiseur 3D n'est pas implémenté : l'architecture est prête (modèle `VisualFixture` indépendant du rendu).
- L'installateur n'est pas signé (avertissement SmartScreen possible).
