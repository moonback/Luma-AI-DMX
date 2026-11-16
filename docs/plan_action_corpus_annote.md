# Plan d'action : Création d'un corpus de morceaux réels annotés pour l'évaluation de Song-to-Show

## Objectif
Constituer un jeu de données de référence composé de 20 à 30 morceaux réels annotés manuellement pour évaluer et améliorer la précision de l'analyse automatique de la fonctionnalité Song-to-Show.

## Étapes du plan

### 1. Sélection des morceaux
- **Action** : Choisir 20 à 30 morceaux variés représentant différents genres, tempos et structures musicales couramment utilisés avec l'application.
- **Livrable** : Liste des fichiers audio sélectionnés.

### 2. Annotation manuelle
- **Action** : Analyser chaque morceau pour identifier et enregistrer :
  - Le tempo global et les variations éventuelles de BPM.
  - La position précise de chaque temps et mesure.
  - Les frontières de chaque section (intro, couplet, refrain, pont, outro).
- **Livrable** : Données d'annotation brutes pour chaque morceau.

### 3. Structuration des données
- **Action** : Convertir les annotations manuelles dans un format JSON standardisé et compatible avec la suite d'évaluation de l'application.
- **Livrable** : Fichiers d'annotations au format JSON (`tests/eval/corpus/`).

### 4. Intégration et évaluation
- **Action** : Ajouter le corpus dans le répertoire `tests/eval` et exécuter la suite de tests d'évaluation pour mesurer les écarts entre l'analyse automatique et la vérité terrain.
- **Critère de succès** : Le corpus est chargé correctement et les résultats de l'évaluation sont générés sans erreur.

## Vérification finale
- Validation de l'intégrité du fichier JSON généré.
- Exécution réussie des tests d'évaluation sur le nouveau corpus.
