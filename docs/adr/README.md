# Décisions d'architecture (ADR)

Une ADR courte par choix structurant : contexte, décision, conséquences. Une décision remplacée n'est pas effacée ; elle passe au statut « Remplacée par NNNN ».

| N° | Décision | Statut |
|---|---|---|
| [0001](0001-moteur-dans-le-processus-principal.md) | Moteur DMX dans le processus principal, sans worker | Acceptée |
| [0002](0002-ia-sans-dmx.md) | L'IA ne produit jamais de DMX : actions typées, validées, prévisualisées | Acceptée |
| [0003](0003-priorites-de-fusion.md) | Fusion par priorité, HTP/LTP dans une même priorité, programmeur toujours gagnant | Acceptée |
| [0004](0004-core-sans-electron.md) | `src/core` sans Electron ni React, bus de commandes unique validé par Zod | Acceptée |
| [0005](0005-handlers-par-domaine.md) | Commandes traitées par des handlers de domaine, routage exhaustif à la compilation | Acceptée |
