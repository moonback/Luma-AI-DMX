# Document de détail : Fonctionnalité Song-to-Show - Phase de Compilation

## Objectif
Ce document détaille le fonctionnement de l'étape de compilation dans la fonctionnalité Song-to-Show, identifie les limites actuelles et propose des améliorations et corrections basées sur les audits récents.

## 1. Fonctionnement actuel de la compilation
L'étape de compilation intervient après l'approbation du plan de spectacle. Elle consiste à traduire les intentions définies dans le plan en commandes spécifiques exécutables par le moteur d'éclairage.
- **Conversion** : Les types d'effets abstraits et les palettes de couleurs sont convertis en scènes, effets en temps réel et paramètres DMX concrets.
- **Intégration** : Le résultat compilé est injecté dans la timeline et la cue list du projet.

## 2. Limites identifiées
L'audit a mis en évidence plusieurs points faibles dans la compilation actuelle :
- **Dérive du BPM** : Les effets générés tournent au BPM global du moteur (120 par défaut) et non au BPM réel du morceau, entraînant un décalage rythmique.
- **Rendu des mouvements** : Certains mouvements complexes (pendule, zigzag) sont simplifiés et rendus uniquement comme de simples variations de tilt.
- **Écrasement des visées** : Les effets générés peuvent écraser la visée calculée pour les machines à position fixe.

## 3. Améliorations et corrections proposées

### A. Synchronisation rythmique (Priorité P0)
- **Correction** : Adapter le compilateur pour utiliser le BPM spécifique extrait ou calculé du morceau en cours pour tous les effets de la timeline.

### B. Fidélité des mouvements (Priorité P0)
- **Évolution** : Améliorer l'algorithme de calcul des effets (`computeEffect`) pour rendre fidèlement les trajectoires complexes (pendule, zigzag) et éviter l'écrasement de la visée calculée.

### C. Gestion des effets de flash (Priorité P0)
- **Évolution** : Remplacer les effets de strobe génériques par des effets synchronisés précisément sur les temps forts du morceau.

## 4. Prochaines étapes suggérées
1. Modifier le moteur de rendu pour lier les effets de la timeline au BPM du morceau actif.
2. Mettre à jour `computeEffect` pour supporter les nouveaux types de mouvements.
