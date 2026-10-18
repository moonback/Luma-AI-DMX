# Tester avec de vrais projecteurs

Ces étapes n'ont **pas** encore été réalisées : aucun matériel n'était disponible pendant le développement. La section « Campagne de validation » ci-dessous décrit le protocole, les outils intégrés et les critères d'acceptation du niveau 2 ; chaque session y ajoute son rapport.

## Préparation
1. Créez un profil exact pour chaque modèle (à partir du manuel DMX du fabricant) et importez-le (voir [PROFILE_FORMAT.md](PROFILE_FORMAT.md)). Marquez `dangerous` les plages reset et lampe. Vérifiez la valeur « shutter ouvert » et les valeurs par défaut de pan/tilt.
2. Patchez chaque projecteur avec **le même mode et la même adresse** que ceux réglés sur l'appareil.
3. Réglez la politique de blackout adaptée à vos appareils (*Settings › Moteur & sécurité*).
4. Personne ne doit être exposé aux faisceaux, au strobe ou aux mouvements pendant les essais.

## Art-Net
1. Placez le PC sur le réseau du nœud (souvent `2.x.x.x` ou `10.x.x.x`, masque `255.0.0.0`).
2. *DMX Output › + Art-Net* : destination = IP du nœud (unicast recommandé) ou broadcast du sous-réseau, interface locale = IP du PC. Indiquez la correspondance univers local → Port-Address configurée sur le nœud.
3. *Armer* et confirmer. Vérifiez sur le nœud la LED ou la page d'état de réception, puis dans *Diagnostics* la cadence mesurée et l'absence d'erreurs.

## sACN / E1.31
1. *DMX Output › + sACN* : multicast (le commutateur doit transmettre le multicast, éventuellement avec IGMP snooping configuré) ou unicast vers l'IP du récepteur. Univers 1–63999, priorité 100 par défaut.
2. Après *Armer*, vérifiez la source affichée par le récepteur (nom « Luma AI DMX », CID visible dans *Settings › Réseau / DMX*).

## USB-DMX (Enttec DMX USB Pro uniquement)
1. Installez le pilote FTDI VCP, branchez l'interface, puis *DMX Output › Interfaces USB-DMX détectées › Rechercher*.
2. *+ USB-DMX* : choisissez le port (puce FTDI détectée = compatible possible, **non confirmé**), puis armez.
3. Débranchez le câble pendant l'émission : la sortie doit passer en **Erreur**, une alerte doit apparaître et la reconnexion doit être tentée.

## USB-DMX « Open DMX » (FTDI sans microcontrôleur)
1. Installez le pilote FTDI VCP. Le pilote doit accepter 250 000 bauds, ce qui est le cas du FT232R.
2. *DMX Output › + USB-DMX (Open DMX / FTDI)* : choisissez le port, gardez 30 images/s, puis armez.
3. Le break est généré par le logiciel (environ 1 ms, avec gigue). Si un récepteur clignote ou perd le signal, baissez la cadence ou utilisez une interface avec microcontrôleur (Enttec Pro, nœud Art-Net/sACN).

## Vérifications à faire
- Contrôlez canal par canal sur l'appareil (ou avec un testeur DMX) : moniteur « Transmis » = valeurs reçues.
- 16 bits : pan/tilt fins, dans le bon sens.
- STOP OUTPUT et blackout : observez le comportement **réel** de chaque appareil en cas de perte de signal.
- Mesurez la latence de bout en bout si elle est critique pour votre usage : l'application ne la mesure pas.

## Campagne de validation (niveau 2)

Objectif : au moins **2 interfaces** (par exemple un nœud Art-Net ou sACN et un Enttec DMX USB Pro) et **3 types de projecteurs** (PAR RGBW, lyre 16 bits, barre LED ou stroboscope), testés selon le protocole ci-dessous. Le rapport de chaque session est collé dans le journal en bas de page.

### Matériel
| Élément | Rôle |
|---|---|
| Testeur DMX (ou page d'état / moniteur du nœud) | lire les valeurs **reçues** canal par canal |
| Nœud Art-Net ou sACN, Enttec DMX USB Pro | interfaces à valider |
| PAR RGBW, lyre 16 bits, 3e type | comportement réel, 16 bits, perte de signal |
| Câble DMX 5 broches + bouchon de terminaison | ligne propre |

### Outils intégrés (*DMX Output › Diagnostics › Campagne matériel*)
- **Mires de test**, lancées après confirmation, sur un univers local : elles remplacent la trame du show par des valeurs brutes (STOP OUTPUT les coupe aussi). Elles pilotent **tous** les canaux, reset et lampe compris : à faire avec le testeur, pas avec des projecteurs devant des personnes.
  - *Signature* : canal *n* = *n* mod 256 (canal 1 → 1, canal 255 → 255, canal 256 → 0, canal 300 → 44, canal 512 → 0).
  - *Balayage* : un seul canal à 255, qui avance de 2 canaux par seconde.
  - *Rampe* : tous les canaux de 0 à 255 puis 0, sur 10 s.
  - *Zéro* : tout à 0.
- **Durée des coupures** : chaque passage Erreur → Prête d'une sortie est chronométré (aussi visible dans le journal : « Connexion rétablie après X s »).
- **Rapport de session** : version, durée, cadence et gigue mesurées, statistiques de chaque sortie, reconnexions, mires utilisées, critères cochés automatiquement quand c'est mesurable. Bouton « Copier (Markdown) ».

### Protocole par interface
1. Configurer la sortie, l'armer (confirmation), vérifier l'état « Prête ».
2. **Signature** : relever au testeur au moins les canaux 1, 2, 255, 256, 257, 300, 511, 512, puis un échantillon de 20 canaux au hasard. Tous doivent correspondre. Noter les écarts.
3. **Balayage** : laisser défiler un tour complet (≈ 4 min 16 s) en surveillant le testeur : aucun canal sauté ni doublé.
4. **Rampe** : la valeur suit sans paliers ni saut.
5. **Endurance** : lancer un show réel (cue list en boucle ou timeline) pendant **8 h**. Le rapport ne doit montrer aucune erreur d'envoi et une cadence stable.
6. **Reconnexion** : débrancher le câble USB (ou le réseau) 10 s puis rebrancher, trois fois. Chaque reconnexion doit prendre **moins de 10 s**.
7. **Perte de signal** : STOP OUTPUT puis blackout ; noter le comportement de chaque projecteur (maintien, extinction, retour en position).
8. Coller le rapport de session ci-dessous, avec les relevés manuels (testeur, comportement des projecteurs).

### Par type de projecteur
- Profil exact importé, même mode et même adresse que sur l'appareil.
- Live Console : chaque attribut bouge le bon paramètre ; plages « dangereuses » (reset, lampe) demandent confirmation.
- 16 bits : pan/tilt fins dans le bon sens, sans à-coups sur un balayage lent.
- Strobe : la limite de fréquence et le garde-fou photosensible agissent comme prévu.

### Critères d'acceptation
- [ ] Testeur : valeurs reçues = valeurs envoyées sur 100 % des canaux relevés, pour chaque interface.
- [ ] 8 h sans erreur d'envoi ni perte de trame.
- [ ] Reconnexion < 10 s après débranchement.
- [ ] 2 interfaces et 3 types de projecteurs validés.

## Journal des sessions
*Aucune session pour l'instant. Collez ici le rapport de chaque session (bouton « Rapport de session »), complété des relevés manuels.*
