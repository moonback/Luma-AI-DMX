# Document de détail : Fonctionnalité Song-to-Show - Phase de Planification

## Objectif
Ce document détaille le fonctionnement de l'étape de planification dans la fonctionnalité Song-to-Show, identifie les limites actuelles et propose des améliorations et corrections basées sur les audits récents.

## 1. Fonctionnement actuel de la planification
L'étape de planification intervient après l'analyse locale du morceau. Elle consiste à générer un plan de spectacle section par section (intro, couplet, refrain, etc.).
- **Génération du plan** : Réalisée soit par des règles déterministes locales, soit par une proposition validée via OpenRouter.
- **Contenu du plan** : Définit les types d'effets, les palettes de couleurs et l'ambiance lumineuse pour chaque segment musical.

## 2. Limites identifiées
L'audit a mis en évidence plusieurs points faibles dans la planification actuelle :
- **Perte des retouches** : Une régénération du show écrase les modifications manuelles de la timeline sans avertissement.
- **BPM global vs BPM par morceau** : Les effets tournent au BPM du moteur (120 par défaut) au lieu de s'adapter au BPM spécifique du morceau en cours.
- **Rôles de machines sous-optimaux** : Le système utilise une classification en 3 couches (wash, moving, bars) moins précise qu'une approche par rôles et positions de scène.

## 3. Améliorations et corrections proposées

### A. Protection des retouches (Priorité P0)
- **Correction** : Implémenter une confirmation explicite de l'utilisateur avant toute régénération de show qui écraserait des personnalisations antérieures.
- **Évolution** : Fusionner intelligemment le show généré avec les modifications (surcharges) apportées par l'opérateur.

### B. Synchronisation des effets (Priorité P0)
- **Évolution** : Assurer que la compilation des effets utilise le BPM extrait ou calculé du morceau spécifique, et non le BPM global du moteur.

### C. Adaptation des rôles de machines (Priorité P1)
- **Évolution** : Déduire les rôles de machines (face, contre, latéral, aérien, etc.) à partir de leurs positions dans le visualiseur et de leurs capacités, pour enrichir la précision de la planification.

## 4. Prochaines étapes suggérées
1. Mettre à jour le compilateur pour utiliser le BPM du morceau.
2. Développer l'interface de gestion des conflits lors de la régénération du show.
