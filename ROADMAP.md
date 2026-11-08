# Luma AI DMX — Roadmap stratégique

> Vision : faire évoluer Luma AI DMX vers un environnement professionnel de programmation et d'exploitation lumière, fiable sur le terrain, mesurable, extensible et assisté par IA sans déléguer les décisions de sécurité à un modèle.

**Référence :** version 1.9.0 et fonctionnalités consignées dans CHANGELOG.md.  
**Périmètre :** 50 propositions nouvelles, identifiées LUMA-101 à LUMA-150.  
**Statut initial :** toutes les propositions ci-dessous sont à planifier ; aucune n'est présentée comme déjà implémentée.

## Principes de livraison

- Prioriser la sécurité d'exploitation, l'observabilité et la validation sur matériel avant les fonctions spectaculaires.
- Toute fonction touchant au signal DMX doit définir un comportement en perte de connexion, au redémarrage et à l'arrêt.
- Toute action IA doit rester explicable, bornée, vérifiable et annulable lorsque cela est possible.
- Les objectifs de performance doivent être mesurés sur une machine de référence et sur une charge reproductible.
- Chaque fonctionnalité doit disposer de critères d'acceptation, tests et documentation.

## Phase 1 — Fiabilité, sécurité et matériel physique

Objectif : transformer les implémentations logicielles en une chaîne de contrôle matériel instrumentée et validable.

### LUMA-101 — Matrice de compatibilité des interfaces DMX
- **Description technique :** créer un registre de modèles d'interfaces, révisions firmware, VID/PID, capacités, limitations et versions de pilotes ; ajouter un banc de tests par adaptateur.
- **Impact utilisateur :** savoir avant l'installation si une interface est officiellement testée et quelles fonctions sont disponibles.
- **Couche :** core, main, renderer.

### LUMA-102 — Détection et qualification USB automatique
- **Description technique :** identifier les périphériques USB par descripteurs, proposer une qualification contrôlée et distinguer détection FTDI, interface reconnue et interface validée.
- **Impact utilisateur :** réduire les erreurs de sélection de port et éviter les fausses confirmations de compatibilité.
- **Couche :** main, core, renderer.

### LUMA-103 — Moniteur de santé des transports
- **Description technique :** mesurer taux d'émission, pertes, erreurs, reconnexions, délais et disponibilité par sortie ; exposer un modèle d'état normalisé.
- **Impact utilisateur :** diagnostiquer immédiatement une sortie dégradée.
- **Couche :** core, main, renderer.

### LUMA-104 — Watchdog de cadence DMX
- **Description technique :** surveiller les échéances de frame, détecter les retards consécutifs, appliquer une stratégie de dégradation configurable et journaliser les incidents.
- **Impact utilisateur :** anticiper les irrégularités de transmission pendant un show.
- **Couche :** core, main.

### LUMA-105 — Profils de perte de signal par univers
- **Description technique :** définir des politiques explicites à la perte du transport : maintien, blackout logiciel, arrêt contrôlé ou alerte seule ; ne jamais supposer le comportement du projecteur.
- **Impact utilisateur :** rendre les procédures de panne prévisibles et documentées.
- **Couche :** core, renderer.

### LUMA-106 — Journal d'exploitation horodaté
- **Description technique :** journal append-only des armements, STOP, changements de patch, erreurs de transport, cues et actions opérateur avec horodatage monotone.
- **Impact utilisateur :** reconstituer précisément un incident.
- **Couche :** core, main.

### LUMA-107 — Diagnostic réseau Art-Net / sACN
- **Description technique :** inspecter interfaces réseau, routes, multicast, pare-feu, CID, conflits d'univers et destinations ; fournir un test de boucle contrôlé.
- **Impact utilisateur :** réduire le temps de mise en service réseau.
- **Couche :** main, core, renderer.

### LUMA-108 — Test de sortie physique guidé
- **Description technique :** assistant pas à pas avec intensité plafonnée, couleurs fixes, confirmation opérateur, validation par univers et retour au désarmement systématique.
- **Impact utilisateur :** vérifier une installation sans lancer un show complet.
- **Couche :** renderer, core, main.

### LUMA-109 — Gestionnaire de snapshots DMX
- **Description technique :** capturer les valeurs calculées et transmises par univers, comparer deux snapshots et exporter un diagnostic anonymisable.
- **Impact utilisateur :** comparer rapidement un état attendu et un état observé.
- **Couche :** core, renderer.

### LUMA-110 — Mode répétition / exploitation verrouillée
- **Description technique :** profils de permissions opérateur, verrouillage des modifications structurelles en LIVE, confirmation renforcée des actions critiques et journal des dérogations.
- **Impact utilisateur :** réduire les erreurs de manipulation pendant l'exploitation.
- **Couche :** core, main, renderer.

## Phase 2 — IA avancée et orchestration multi-agents

Objectif : améliorer la qualité artistique et la compréhension contextuelle tout en conservant un contrôle déterministe des actions.

### LUMA-111 — Planificateur IA multi-étapes
- **Description technique :** décomposer une intention en sous-objectifs, dépendances, préconditions et étapes de validation ; limiter profondeur, budget et durée.
- **Impact utilisateur :** obtenir des propositions complexes plus cohérentes et auditables.
- **Couche :** ai, core.

### LUMA-112 — Agents spécialisés avec contrats de capacité
- **Description technique :** séparer analyse musicale, dramaturgie, patch, sécurité et optimisation dans des agents déclarant leurs outils et permissions.
- **Impact utilisateur :** améliorer la spécialisation sans donner à chaque agent un accès global au moteur.
- **Couche :** ai, core.

### LUMA-113 — Simulateur de proposition avant application
- **Description technique :** exécuter les actions proposées sur un état de scène isolé, calculer les deltas DMX et détecter les conflits avant mutation réelle.
- **Impact utilisateur :** visualiser les conséquences d'une proposition sans toucher au show actif.
- **Couche :** ai, core, renderer.

### LUMA-114 — Explication causale des choix IA
- **Description technique :** associer chaque action à ses indices, contraintes, règles et éléments de contexte ; afficher les raisons d'un refus.
- **Impact utilisateur :** comprendre et corriger une proposition au lieu de l'accepter à l'aveugle.
- **Couche :** ai, renderer.

### LUMA-115 — Mémoire de projet avec provenance
- **Description technique :** stocker les préférences de show, conventions de nommage et décisions validées avec provenance, date, portée et mécanisme d'oubli.
- **Impact utilisateur :** éviter de répéter les mêmes consignes tout en gardant le contrôle sur le contexte.
- **Couche :** ai, core.

### LUMA-116 — Détection d'ambiguïtés interactive
- **Description technique :** scorer les ambiguïtés de cible, timing, couleur, intensité et intention ; demander une clarification avant de générer des actions risquées.
- **Impact utilisateur :** réduire les erreurs dues aux demandes imprécises.
- **Couche :** ai, renderer.

### LUMA-117 — Optimiseur de show sous contraintes
- **Description technique :** optimiser transitions, répétitions, couverture de fixtures et diversité des looks sous contraintes de sécurité, patch et durée.
- **Impact utilisateur :** obtenir des shows plus équilibrés sans perdre les contraintes de production.
- **Couche :** ai, core.

### LUMA-118 — Comparateur de variantes artistiques
- **Description technique :** produire plusieurs variantes versionnées et comparer énergie, couleurs, mouvements, densité d'effets et complexité de patch.
- **Impact utilisateur :** choisir rapidement une direction artistique.
- **Couche :** ai, renderer.

### LUMA-119 — Évaluation continue des modèles IA
- **Description technique :** corpus de requêtes de référence, tests de régression, score de validité du contrat, respect des négations, sécurité et latence par fournisseur.
- **Impact utilisateur :** éviter qu'un changement de modèle dégrade silencieusement le comportement.
- **Couche :** ai, core.

### LUMA-120 — Routage IA selon coût et latence
- **Description technique :** sélectionner un modèle selon tâche, budget, latence mesurée, disponibilité et capacité JSON ; fallback déterministe explicite.
- **Impact utilisateur :** maîtriser les coûts et conserver une réponse rapide.
- **Couche :** ai, core.

## Phase 3 — Performance, rendu 3D et ingénierie de scène

Objectif : maintenir une interface fluide et une visualisation exploitable sur des rigs importants.

### LUMA-121 — Profiling de rendu Three.js
- **Description technique :** instrumenter temps CPU/GPU estimé, draw calls, géométries, matériaux, mémoire et temps de frame ; exporter des profils.
- **Impact utilisateur :** identifier les scènes qui dégradent le rendu.
- **Couche :** renderer.

### LUMA-122 — Niveaux de détail adaptatifs
- **Description technique :** LOD selon distance caméra, importance scénique et budget de frame, avec hystérésis pour éviter les bascules visuelles.
- **Impact utilisateur :** conserver un rendu fluide sur les scènes denses.
- **Couche :** renderer.

### LUMA-123 — Culling spatial de fixtures
- **Description technique :** frustum culling et partition spatiale des projecteurs, accessoires et structures ; mise à jour incrémentale des objets visibles.
- **Impact utilisateur :** accélérer les scènes comportant plusieurs centaines de composants.
- **Couche :** renderer.

### LUMA-124 — Cache de shaders et préchauffage de scène
- **Description technique :** précompiler les matériaux principaux, mettre en cache les variantes de shaders et mesurer le temps de démarrage du visualiseur.
- **Impact utilisateur :** limiter les saccades lors du premier affichage.
- **Couche :** renderer.

### LUMA-125 — Profils photométriques documentés
- **Description technique :** paramètres de faisceau, angle, ouverture, température de couleur et atténuation simplifiée issus de données vérifiables.
- **Impact utilisateur :** améliorer la pertinence visuelle des prévisualisations.
- **Couche :** core, renderer.

### LUMA-126 — Éditeur de rigging avec contraintes
- **Description technique :** attaches, points de suspension, limites géométriques et avertissements de collision ; séparation explicite entre aide visuelle et calcul structurel certifié.
- **Impact utilisateur :** accélérer le placement des structures sans confondre visualisation et validation mécanique.
- **Couche :** renderer, core.

### LUMA-127 — Alignement et calibration multi-caméras
- **Description technique :** sauvegarder des vues caméra, points de repère, transformations et calibration ; comparer deux configurations de scène.
- **Impact utilisateur :** retrouver rapidement un cadrage de travail.
- **Couche :** renderer.

### LUMA-128 — Simulation volumétrique à budget contrôlé
- **Description technique :** qualité volumétrique adaptative, résolution dynamique et limites de particules selon le budget GPU.
- **Impact utilisateur :** obtenir des faisceaux et une brume plus stables sur les machines modestes.
- **Couche :** renderer.

### LUMA-129 — Mode scène massive
- **Description technique :** virtualisation des listes, chargement progressif des modèles, batching et rendu différé des éléments non sélectionnés.
- **Impact utilisateur :** travailler sur des plateaux complexes sans ralentir les interactions.
- **Couche :** renderer.

### LUMA-130 — Benchmark de performance reproductible
- **Description technique :** scènes de référence, nombre fixe de fixtures, parcours caméra, mesures de frame time p50/p95/p99 et seuils par profil matériel.
- **Impact utilisateur :** suivre objectivement les régressions de performance.
- **Couche :** renderer, core.

## Phase 4 — Écosystème cloud et collaboration

Objectif : permettre le travail d'équipe et la circulation contrôlée des projets sans fragiliser le fonctionnement local.

### LUMA-131 — Synchronisation de projets versionnée
- **Description technique :** synchronisation différentielle, version de schéma, contrôle d'intégrité et résolution de conflits par entité.
- **Impact utilisateur :** retrouver un projet sur plusieurs postes sans écrasement silencieux.
- **Couche :** core, main.

### LUMA-132 — Historique de versions de show
- **Description technique :** snapshots nommés, diff sémantique du patch, des cues, des scènes et des réglages ; restauration sélective.
- **Impact utilisateur :** revenir à une version stable avant une modification risquée.
- **Couche :** core, renderer.

### LUMA-133 — Collaboration avec présence opérateur
- **Description technique :** présence, rôle, verrouillage de zones et indicateurs de modifications concurrentes.
- **Impact utilisateur :** coordonner plusieurs membres d'une équipe.
- **Couche :** core, main, renderer.

### LUMA-134 — Commentaires et annotations de production
- **Description technique :** annotations attachées à une fixture, un cue, une section musicale ou un élément de scène, avec auteur et statut.
- **Impact utilisateur :** centraliser les consignes de montage et de programmation.
- **Couche :** core, renderer.

### LUMA-135 — Gestion des rôles et permissions d'équipe
- **Description technique :** rôles administrateur, programmeur, opérateur et observateur ; permissions vérifiées côté service.
- **Impact utilisateur :** adapter les accès à l'organisation de production.
- **Couche :** core, main.

### LUMA-136 — Partage sécurisé de show
- **Description technique :** export partageable avec manifeste, empreintes, options d'exclusion des secrets et contrôle de compatibilité.
- **Impact utilisateur :** transmettre un show sans divulguer de clés ou données privées.
- **Couche :** core, main, renderer.

### LUMA-137 — Catalogue privé de profils d'équipe
- **Description technique :** dépôt de profils validés, approbation, versionnage, provenance et signatures de contenu.
- **Impact utilisateur :** réutiliser des profils fiables dans toute l'équipe.
- **Couche :** core, main, renderer.

### LUMA-138 — Sauvegarde et restauration vérifiées
- **Description technique :** sauvegardes planifiées, chiffrement optionnel, manifeste, vérification d'intégrité et test de restauration.
- **Impact utilisateur :** réduire le risque de perte de projet.
- **Couche :** core, main, renderer.

### LUMA-139 — Tableau de bord de parc logiciel
- **Description technique :** inventaire des versions, état des mises à jour, compatibilité projet et alertes de sécurité pour les postes autorisés.
- **Impact utilisateur :** simplifier la maintenance de plusieurs postes de régie.
- **Couche :** main, renderer.

### LUMA-140 — Mode offline-first avec synchronisation différée
- **Description technique :** file d'opérations locales idempotentes, reprise réseau, détection de divergence et politique de conflit explicite.
- **Impact utilisateur :** continuer à travailler sans connexion puis synchroniser plus tard.
- **Couche :** core, main.

## Phase 5 — Extensions et intégrations professionnelles

Objectif : ouvrir le moteur à des équipements, workflows et outils tiers avec des contrats stables.

### LUMA-141 — SDK public d'extensions
- **Description technique :** API versionnée, sandbox de plugins, permissions déclaratives, cycle de vie et compatibilité semver.
- **Impact utilisateur :** enrichir Luma sans modifier le cœur.
- **Couche :** core, main, renderer.

### LUMA-142 — API de contrôle locale documentée
- **Description technique :** service local authentifié, scopes, quotas, schémas versionnés et journalisation des commandes.
- **Impact utilisateur :** intégrer des outils externes de manière maîtrisée.
- **Couche :** main, core.

### LUMA-143 — Adaptateurs MIDI avancés
- **Description technique :** profils de surfaces de contrôle, feedback LED, banques, pickup mode et mapping exportable.
- **Impact utilisateur :** exploiter des contrôleurs physiques avec moins de configuration manuelle.
- **Couche :** core, main, renderer.

### LUMA-144 — Intégration timecode SMPTE étendue
- **Description technique :** diagnostic LTC, compensation de dérive, drop-frame/non-drop-frame et resynchronisation de timeline.
- **Impact utilisateur :** fiabiliser les spectacles synchronisés à une régie externe.
- **Couche :** core, main, renderer.

### LUMA-145 — Adaptateurs consoles et protocoles tiers
- **Description technique :** architecture d'adaptateurs isolés, découverte des capacités et tests de conformité pour chaque intégration ajoutée.
- **Impact utilisateur :** connecter Luma à un environnement technique plus large.
- **Couche :** core, main.

### LUMA-146 — Import/export de formats de show
- **Description technique :** pipeline d'import avec validation, mapping des fonctions, rapport de pertes et export documenté vers des formats pris en charge.
- **Impact utilisateur :** réduire les reconstructions manuelles entre outils.
- **Couche :** core, renderer.

### LUMA-147 — Générateur de rapports techniques
- **Description technique :** rapports patch, univers, adresses, consommation déclarée, réseau, profils et avertissements avec export PDF/CSV.
- **Impact utilisateur :** produire des documents de préparation et de passation fiables.
- **Couche :** core, renderer.

### LUMA-148 — Centre de diagnostic et support
- **Description technique :** collecte volontaire, anonymisation, bundle de logs, versions, configuration non secrète et export contrôlé.
- **Impact utilisateur :** accélérer le support sans exposer les secrets.
- **Couche :** main, core, renderer.

### LUMA-149 — Gestion des mises à jour avec canal de préversion
- **Description technique :** canaux stable/beta, vérification de signature, notes de version, compatibilité projet et retour arrière documenté.
- **Impact utilisateur :** adopter les nouveautés avec un risque maîtrisé.
- **Couche :** main, renderer.

### LUMA-150 — Certification interne des extensions et profils
- **Description technique :** suite de conformité automatisée, validation des schémas, tests de sécurité et badge de niveau de vérification.
- **Impact utilisateur :** distinguer clairement contenu communautaire, testé et validé.
- **Couche :** core, main, renderer.

## Synthèse de priorisation

| Phase | IDs | Priorité stratégique | Résultat attendu |
|---|---|---|---|
| 1. Fiabilité & matériel | LUMA-101 à 110 | Critique | Exploitation matérielle observable et maîtrisée |
| 2. IA & multi-agents | LUMA-111 à 120 | Haute | IA explicable, mesurée et bornée |
| 3. Performance & 3D | LUMA-121 à 130 | Haute | Rendu stable sur scènes denses |
| 4. Cloud & collaboration | LUMA-131 à 140 | Moyenne | Travail d'équipe et continuité multi-postes |
| 5. Extensions & intégrations | LUMA-141 à 150 | Moyenne | Écosystème durable et interopérable |

## Définition of Done commune

Une fonctionnalité ne passe pas à « terminée » tant que les éléments pertinents ne sont pas réunis :

- [ ] Critères d'acceptation vérifiables.
- [ ] Tests unitaires et d'intégration adaptés.
- [ ] Tests de sécurité si une frontière de confiance est touchée.
- [ ] Mesure de performance si un chemin temps réel est concerné.
- [ ] Gestion des erreurs, annulation et reprise documentées.
- [ ] Interface localisée en français et anglais.
- [ ] Documentation et CHANGELOG mis à jour.
- [ ] Limites matérielles et validations réelles explicitement consignées.

Cette roadmap est une proposition stratégique. L'ordre de livraison doit être réévalué après chaque audit technique et chaque campagne de validation terrain.
