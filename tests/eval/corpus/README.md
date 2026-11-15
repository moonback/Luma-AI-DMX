# Corpus de référence Song-to-Show

Ce répertoire contient les annotations de référence de morceaux audio réels. Les fichiers audio ne sont pas versionnés ici : leurs droits de reproduction et de redistribution doivent être vérifiés séparément. Placez les fichiers autorisés dans un stockage local non commité, puis renseignez `audio.source` avec un identifiant ou un chemin relatif stable.

## État initial

Le corpus démarre volontairement vide. Aucun BPM, beat, downbeat, mesure ou découpage de section n'est inventé. Une piste ne peut être marquée `complete` qu'après écoute/analyse manuelle et double vérification des repères temporels.

Objectif de livraison : 20 à 30 pistes réelles et annotées. La validation `npm run eval:corpus` échoue tant que le seuil de 20 pistes complètes n'est pas atteint.

## Format

- `corpus.json` : index des pistes annotées.
- `schema.json` : JSON Schema versionné.
- `annotations/<track-id>.json` : un fichier par morceau.
- `scripts/validate-song-corpus.mjs` : intégrité, cohérence temporelle, couverture et rapport.

## Protocole d'annotation

1. Consigner titre, artiste, version/édition, durée, genre, source et droits d'utilisation.
2. Relever le BPM de référence et les éventuels changements dans `tempoSegments` (temps en secondes, BPM et signature).
3. Annoter chaque attaque de temps dans `beats`, avec numéro de mesure/temps et confiance. Ne pas déduire les temps manquants par interpolation sans les signaler.
4. Annoter les débuts/fins de mesures dans `bars`.
5. Délimiter les sections dans `sections` avec début inclusif, fin exclusive, type et libellé. Les répétitions restent des sections distinctes.
6. Faire vérifier les annotations par une seconde écoute. Utiliser `review.status = "verified"` uniquement après contrôle.
7. Noter toute ambiguïté (pickup, swing, rubato, métrique composée, silence, changement de tempo) dans `notes`.

Les timestamps sont exprimés en secondes depuis le début du fichier audio analysé. La tolérance d'évaluation doit être définie par métrique (beats, downbeats, sections) et non appliquée uniformément.

## Commandes

- `npm run eval` : banc IA existant.
- `npm run eval:corpus` : valide le corpus de référence et écrit `test-results/song-corpus-eval.json`.

Le validateur ne télécharge aucun morceau, n'appelle aucun fournisseur IA et ne transmet aucun audio.
