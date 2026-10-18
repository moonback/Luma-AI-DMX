# 0001 — Moteur DMX dans le processus principal

- Statut : acceptée (Phase 0, réexaminée le 17/10/2026)

## Contexte
Le moteur calcule les trames DMX à 40–44 Hz. Un worker isolerait ce calcul, mais tout `AppService` (IA, cues, télécommande, diagnostic) lit l'état du moteur de façon synchrone. Le problème mesuré au départ était la régularité de la cadence, pas la charge CPU.

## Décision
Le moteur tourne dans le processus principal, piloté par un ordonnanceur dédié (et non `setInterval`).

## Conséquences
- Cadence mesurée 40/44 Hz ± 0,5 Hz ; ≈ 0,25 ms par tick pour quelques projecteurs, ≈ 7,4 ms (30 % de la période) pour 1 000 projecteurs sur 12 univers.
- Pas de sérialisation entre moteur et services.
- À réexaminer au-delà de quelques milliers de projecteurs : worker, ou optimisation de la fusion. Le test `tests/perf/engine.perf.test.ts` sert de garde-fou.
