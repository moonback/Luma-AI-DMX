# Améliorations UX/UI — Luma-AI-DMX 1.9.0

> Audit du 2026-11-08, commit `8467bfc`. Ce document **complète** [`docs/UX_UI_REPORT.md`](../UX_UI_REPORT.md), qui donne des principes généraux, sans le dupliquer. Ici, chaque constat est rattaché à un fichier et à un comportement observé dans le code. Aucun test utilisateur n'a été mené : les « irritants » sont déduits du code et de l'organisation des écrans.

## 1. Ce qui est déjà bien fait (à préserver)

- **Provenance des données sur le Dashboard.** Chaque KPI porte une étiquette persisté / mesuré / estimé / config (`Kpi src=…`). Peu de logiciels du marché le font.
- **Explication par section dans Song to Show** (« pourquoi : … ») et notices de remplacement de sécurité.
- **Profils d'espace de travail et visibilité des composants.** Chaque page et chaque panneau peut être masqué (`componentVisibilitySchema`). C'est une base idéale pour des modes débutant / expert.
- **Mode Console Simplifiée verrouillé au démarrage** pour les opérateurs occasionnels (`simpleConsoleOnStart`, `simpleLocked`).
- **Modale de génération annulable**, avec des étapes réelles remontées par le main (`GEN_STEPS`), et non une barre de progression factice.

## 2. Constats transverses

| # | Constat | Preuve dans le code | Impact | Recommandation |
|---|---|---|---|---|
| T1 | **Trois surfaces pour le même programmer**, sans explication | Pages `console`, `pantilt`, `programmer`. Les groupes se créent dans `LiveConsole`, `GroupsPanel` et `Programmer`. | Confusion pour savoir où faire quoi, et un doute sur la synchronisation entre ces vues. | Garder les trois, mais : (1) renommer `Programmer` en **« Bibliothèque »** (scènes, palettes, groupes) ; (2) sous-titre de chaque page « pour qui / pour quoi » ; (3) un seul composant de création de groupe réutilisé partout. |
| T2 | **Nommage incohérent** | Navigation FR : « Console Live␠ » (espace final dans `nav.console`), « Programmer » non traduit, « Show Musique » au lieu de « Song to Show », id `pantilt` pour la Console Simplifiée. | Une impression d'inachevé, et une documentation (README) qui ne correspond pas à l'UI. | Un glossaire unique : **Song to Show** partout, « Console experte » / « Console simplifiée », « Bibliothèque ». Corriger les clés i18n. |
| T3 | **Chaînes françaises codées en dur** malgré l'i18n | `Music.tsx` (« Styles »), `Timeline.tsx` (`KIND_LABELS`), `SelectionModal.tsx` (`aria-label="Machine précédente"`, « Fermer », « Intensité »), `Audio.tsx` (« Utiliser comme BPM », « BPM moteur »). | En anglais, l'UI est mixte, et les lecteurs d'écran annoncent du français. | Étendre `scripts/check-i18n.mjs` aux attributs `aria-label` et `title` et aux littéraux JSX. |
| T4 | **Les notices ont toutes le même poids visuel** | `Music.tsx` affiche `notices` en jaune (`#fcd34d`). Une erreur d'intégrité, un éloge (« Excellent contraste dynamique ») et un repli IA ont le même rendu. | Les erreurs passent inaperçues et les éloges sont pris pour des alertes. | Typer les notices (`error`, `warning`, `info`, `success`) dès le cœur (`CompileResult.notices`, `ShowIntegrityReport`), avec icône et couleur. Les replier au-delà de 3. |
| T5 | **Actions destructrices silencieuses** | « Régénérer », « Variante », « Restaurer » et la retouche d'une section passent par `removeGenerated` : les modifications de timeline sont perdues. | Perte de travail, la pire irritation possible pour un pro. | Confirmation quand les objets générés ont été modifiés, avec une option « garder mes retouches ». Voir SONG_TO_SHOW_AUDIT §3.5. |
| T6 | **Deux modèles d'annulation** | Historique projet (`history.ts`) et piles locales (timeline, visualiseur) qui interceptent Ctrl+Z (`App.tsx`, commentaire « keep their own Ctrl+Z »). | Ctrl+Z ne fait pas la même chose selon la page. | Afficher dans la barre d'état ce que Ctrl+Z annulera (« Annuler : déplacement d'événement »). À terme, une pile unifiée. |
| T7 | **Feedback de sortie DMX** | L'état SIMULATION / LIVE figure dans le KPI du Dashboard et la TopBar. | L'opérateur ne voit pas toujours qu'il émet vraiment. | Bandeau de couleur permanent quand une sortie réelle est armée (déjà recommandé par `UX_UI_REPORT.md` §1), avec le nombre d'univers émis. |
| T8 | **Paramètres longs** | `Settings.tsx` fait 813 lignes, avec 11 onglets en 4 groupes. | Les réglages critiques (strobe autorisé, garde-fou, priorités) sont noyés parmi les réglages de confort. | Une recherche dans les paramètres. Une section « Sécurité du show » qui regroupe `allowStrobe`, `maxStrobeHz`, `flashGuard`, `blackoutPolicy` et `autoArmOnStart`. |

## 3. Console Simplifiée (`PanTiltConsole.tsx`, `pantilt/*`)

| Constat | Recommandation |
|---|---|
| L'ouverture du modal passe par un **double-clic** (en-tête du fichier). Ce geste est peu découvrable sur écran tactile et inconnu des débutants. | Un bouton « Régler » visible dès qu'une sélection existe. Le double-clic reste un raccourci. |
| La sélection de plage par **Maj+clic** n'est pas signalée. | Un indice discret sous la grille : « Maj+clic : sélectionner une plage ». |
| Le modal liste les familles (intensité, couleur, position, faisceau), mais sans **état global** de la sélection mixte (valeurs différentes). | Afficher « mixte » quand les machines sélectionnées divergent, comme les consoles pro. |
| Aucun **retour en arrière visuel** sur ce que la console simplifiée tient : le programmer garde les valeurs jusqu'à « Libérer ». | Badge « 3 machines tenues manuellement » et un bouton Libérer toujours visible. |
| Les tuiles ne montrent pas la **couleur et l'intensité réelles en sortie** (à vérifier sur `FixtureTile`). | Pastille de couleur et barre d'intensité alimentées par l'état du moteur. C'est le retour le plus utile pour un débutant. |

## 4. Dashboard (`Dashboard.tsx`)

| Constat | Recommandation |
|---|---|
| 8 KPI de même poids, dont « Charge moteur » et « IA », qui intéressent peu en exploitation. | Deux rangées : **exploitation** (sortie, cue active, BPM, alertes) puis **système** (charge, protocoles, IA). Les profils d'espace de travail permettent déjà de masquer. |
| Le panneau « Scène depuis un texte » (décor 3D) est sur l'accueil, alors que la fonction la plus différenciante (Song to Show) n'y apparaît pas. | Carte « Dernier morceau » : générer, jouer, ouvrir la timeline. |
| Les alertes ne proposent pas d'action directe (à vérifier selon le type d'alerte). | Chaque alerte avec son bouton de correction (« Armer la sortie », « Réimporter l'audio », « Ouvrir le patch »). |

## 5. Paramètres (`Settings.tsx`)

- **Recherche globale** des réglages, avec un filtre sur les libellés i18n.
- **Section Sécurité du show** (cf. T8). Aujourd'hui, `allowStrobe` est sous « IA », alors qu'il concerne aussi Song to Show et les effets.
- **Indicateur « modifié »** sur les réglages qui diffèrent des valeurs par défaut, avec un bouton « Rétablir ».
- **Exposer les réglages cachés** utiles aux pros : `phraseBars` (granularité des cues Song to Show) et compensation de latence audio (nouvelle).

## 6. Gestion des machines (`Fixtures.tsx`, 445 lignes)

| Constat | Recommandation |
|---|---|
| L'ajout passe par une boîte de dialogue (profil, mode, univers, adresse, nombre, préfixe). C'est complet, mais **sans aperçu de l'occupation des univers**. | Une barre d'occupation de l'univers dans le dialogue, avec les conflits en rouge **avant** validation. |
| Quatre sources de profils (intégrés, OFL, GDTF, MA2), plus la photo IA, sans **indicateur de qualité** du profil (canaux manquants, plages non typées). | Badge de complétude du profil, alimenté par le futur « Rig Doctor » (AI_FEATURE_AUDIT IA-01). |
| La position des machines se règle dans le visualiseur, pas dans le patch. | Lien « Placer sur scène » depuis chaque ligne. Afficher le **rôle** déduit (IA-02). |
| L'export MVR existe, mais **pas l'import**. | Import MVR, qui récupère patch et positions depuis Vectorworks ou grandMA3 (voir FEATURE_IDEAS F-14). |

## 7. Song to Show (`Music.tsx`, `music/*`)

L'écran empile 4 panneaux sur une page : lecteur et timeline studio, intention, tableau des sections, éditeur modal.

| # | Constat | Recommandation |
|---|---|---|
| S1 | Flux non linéaire : importer, écouter, choisir une intention, générer, retoucher, jouer et ouvrir la timeline sont tous visibles en même temps. | Un **stepper** léger (1 Morceau · 2 Intention · 3 Show · 4 Jouer) qui ne cache rien mais met en avant l'étape courante. |
| S2 | Les règles locales ne lisent que le français (commentaire du fichier). L'UI anglaise propose un champ texte qui, sans LLM, comprend mal. | Intention structurée : chips (Énergie, Couleurs, Mouvement, Strobe, Fumée, Poursuite) qui remplacent ou complètent le texte. Voir AI_FEATURE_AUDIT IA-06. |
| S3 | Deux façons de retoucher une section : le champ « instruction » dans le tableau et le modal `SectionEditor`. | Garder seulement le modal, qui ouvre avec un champ d'instruction en tête. Le tableau devient lecture et sélection. |
| S4 | Les **frontières de section ne sont pas modifiables**. Seul le libellé l'est, et changer le libellé ne recompile pas, sans le dire. | Poignées de frontière sur `SongStudioTimeline` (glisser, scinder, fusionner), aimantées sur les temps forts. Badge « modifié, régénérer » après un changement de libellé. |
| S5 | La comparaison A/B (`VariantCompareModal`) compare des **plans textuels**, sur deux versions seulement (`plan` et `previousPlan`). | Variantes nommées (A/B/C), avec **audition** : jouer la section N avec la variante A puis B au même timecode. |
| S6 | Le BPM affiché est celui du morceau, mais les effets tournent au BPM du moteur (voir SONG_TO_SHOW_AUDIT §3.1), sans aucun indice dans l'UI. | Une fois corrigé, afficher « Tempo du show : 128 (morceau) » dans le lecteur. |
| S7 | Le score de qualité artistique et ses notices ont la même apparence que des avertissements. | Un badge de score avec un détail déplié, séparé des notices de sécurité. |
| S8 | « Variante » boucle sur 5 stratégies sans le dire (6e = 1re). | Montrer le nom de la stratégie appliquée (« Cinématographique ») et un menu pour la choisir directement. |
| S9 | Morceau sans audio sur la machine : seul le message « Fichier audio non chargé » apparaît, à la lecture. | Badge « audio manquant » dans la liste des morceaux, avec un bouton « Relier le fichier ». |

## 8. Navigation et découvrabilité

- **15 pages dans une barre latérale.** Ajouter une palette de commandes (Ctrl+K), si le sélecteur existant ne couvre pas toutes les actions (à vérifier).
- **Les raccourcis existent** (`shortcuts.ts`, configurables), mais ils sont peu visibles. Les afficher dans les infobulles des boutons (déjà fait pour la navigation via `keys[page:…]`) et proposer une fiche « ? ».
- **Mode exploitation.** Un profil d'espace de travail « Show » prédéfini (Cues, Actions rapides, Console simplifiée, Audio), avec les pages d'édition masquées. Le mécanisme existe déjà. Voir LUMA-110 dans `ROADMAP.md`.

## 9. Accessibilité

- `aria-label` codés en dur en français (T3).
- Le modal de sélection expose un `role="slider"` pour le pad pan/tilt. Il faut vérifier la gestion clavier (flèches, Pg↑/Pg↓) et la valeur `aria-valuetext`.
- Couleurs inline dans `Music.tsx` (`#22d3ee`, `#a78bfa`, `#fcd34d`…) au lieu des tokens du thème : risque de contraste insuffisant en thème clair.

## 10. Quick wins UX (moins d'une journée chacun)

1. Corriger les clés i18n de navigation (espace final, « Programmer », « Show Musique »).
2. Typer et colorer les notices Song to Show (erreur, avertissement, info, succès).
3. Confirmation avant une régénération qui écraserait des retouches.
4. Badge « libellé modifié, régénérer » dans le tableau des sections.
5. Bouton « Régler » visible dans la Console Simplifiée.
6. Badge « audio manquant » sur les morceaux.
7. Section « Sécurité du show » dans les paramètres (regroupement, sans nouveau réglage).
8. Retrait des `console.log` de la voix.
