# RNGdle

|                   |                                                  |
| ----------------- | ------------------------------------------------ |
| Identifiant       | `rngdle`                                         |
| Configuration     | `/config rngdle`                                 |
| Intent privilégié | Message Content                                  |
| Utilisé par       | les membres (jeu), les administrateurs (comptes) |

Suit les tirages quotidiens des membres sur [rngdle.com](https://www.rngdle.com). Chaque membre lie son pseudo RNGdle, puis le bot télécharge ses tirages et en tire des classements, des profils et des statistiques. Les données sont propres à chaque serveur.

## Commandes

### `/rngdle leaderboard`

Accès : tout le monde. Réponse : publique.

Aucune option.

Image du classement des tirages du jour (UTC), 25 joueurs au plus : numéro tiré, score, écart avec la veille et placement en percentile. Trois encadrés résument la journée : score moyen, nombre de joueurs et pire tirage.

### `/rngdle profile`

Accès : tout le monde. Réponse : publique.

| Option     | Requise | Valeurs                          | Description                            |
| ---------- | ------- | -------------------------------- | -------------------------------------- |
| `member`   | non     | membre                           | Membre à consulter. Par défaut : vous. |
| `username` | non     | pseudo RNGdle lié sur le serveur | Pseudo RNGdle à consulter.             |

Image du profil : meilleur et pire tirage, score moyen, score total, série en cours et record, record de badges, rang au classement général et répartition par palier. `member` et `username` ne se combinent pas.

### `/rngdle history`

Accès : tout le monde. Réponse : publique.

| Option     | Requise | Valeurs                          | Description                                  |
| ---------- | ------- | -------------------------------- | -------------------------------------------- |
| `member`   | non     | membre                           | Membre à consulter. Par défaut : vous.       |
| `username` | non     | pseudo RNGdle lié sur le serveur | Pseudo RNGdle à consulter.                   |
| `count`    | non     | 5 à 15                           | Nombre de tirages par page. Par défaut : 10. |

Image des derniers tirages du joueur, du plus récent au plus ancien : date, numéro, score et placement. Les boutons **◀ Précédent** et **Suivant ▶** remontent vers les tirages plus anciens.

### `/rngdle timeline`

Accès : tout le monde. Réponse : publique.

| Option     | Requise | Valeurs                          | Description                            |
| ---------- | ------- | -------------------------------- | -------------------------------------- |
| `member`   | non     | membre                           | Membre à consulter. Par défaut : vous. |
| `username` | non     | pseudo RNGdle lié sur le serveur | Pseudo RNGdle à consulter.             |

Image de la frise chronologique du joueur, depuis le mois de son premier tirage : ses tirages MYTHIC, ANOMALY et TRASH, comparés au nombre attendu.

### `/rngdle trend`

Accès : tout le monde. Réponse : publique.

| Option     | Requise | Valeurs                                                | Description                            |
| ---------- | ------- | ------------------------------------------------------ | -------------------------------------- |
| `member`   | non     | membre                                                 | Membre à consulter. Par défaut : vous. |
| `username` | non     | pseudo RNGdle lié sur le serveur                       | Pseudo RNGdle à consulter.             |
| `days`     | non     | **30 jours**, **90 jours** (par défaut), **365 jours** | Nombre de jours couverts.              |

Image de la forme récente du joueur : meilleur et pire tirage, score moyen comparé à la période précédente, placement moyen, répartition par palier et graphique du placement de chaque tirage.

### `/rngdle server-stats`

Accès : tout le monde. Réponse : publique.

Aucune option.

Image des statistiques du serveur : meilleur et pire tirage de tous les temps, nombre de tirages, score moyen, score total et répartition par palier.

### `/rngdle leaderboard-all`

Accès : tout le monde. Réponse : publique.

| Option   | Requise | Valeurs                                                             | Description                     |
| -------- | ------- | ------------------------------------------------------------------- | ------------------------------- |
| `period` | non     | **Depuis toujours** (par défaut), **Ce mois-ci**, **Cette semaine** | Période classée (UTC).          |
| `page`   | non     | 1 ou plus                                                           | Numéro de page. Par défaut : 1. |

Image du classement général, 10 joueurs par page, avec les boutons **◀ Précédent** et **Suivant ▶**. Les joueurs sont classés par indice : score total ÷ (nombre de tirages + 20). Un second tableau classe les joueurs par meilleur tirage. La ligne du membre qui lance la commande est ajoutée sous le tableau s'il n'est pas sur la page.

### `/rngdle versus`

Accès : tout le monde. Réponse : publique.

| Option    | Requise | Valeurs | Description                       |
| --------- | ------- | ------- | --------------------------------- |
| `player1` | oui     | membre  | Premier joueur.                   |
| `player2` | non     | membre  | Second joueur. Par défaut : vous. |

Image comparant les deux joueurs : score total, nombre de tirages, score moyen, meilleur tirage, record de badges et face-à-face sur les jours où les deux ont tiré. Les deux joueurs doivent avoir lié leur compte.

### `/rngdle link`

Accès : tout le monde. Réponse : visible de vous seul.

| Option     | Requise | Valeurs                  | Description          |
| ---------- | ------- | ------------------------ | -------------------- |
| `username` | oui     | texte, 64 caractères max | Votre pseudo RNGdle. |

Lie votre compte Discord à un pseudo RNGdle et importe tous ses tirages. Le pseudo doit exister sur rngdle.com et ne pas être lié à un autre membre du serveur. Pour changer de pseudo, déliez-vous d'abord avec `/rngdle unlink`. Relancée avec le même pseudo, la commande importe les nouveaux tirages.

### `/rngdle unlink`

Accès : tout le monde. Réponse : visible de vous seul.

Aucune option.

Délie votre compte et supprime vos tirages sur ce serveur, après confirmation par le bouton **Délier** (ou **Annuler**).

### `/rngdle remind`

Accès : tout le monde. Réponse : visible de vous seul.

| Option    | Requise | Valeurs             | Description                              |
| --------- | ------- | ------------------- | ---------------------------------------- |
| `enabled` | oui     | **True**, **False** | Active ou désactive le rappel quotidien. |

Inscrit ou désinscrit au rappel quotidien. Il faut un compte RNGdle lié pour s'inscrire.

### `/rngdle-admin register`

Accès : administrateurs. Réponse : visible de vous seul.

| Option     | Requise | Valeurs                  | Description    |
| ---------- | ------- | ------------------------ | -------------- |
| `member`   | oui     | membre                   | Membre à lier. |
| `username` | oui     | texte, 64 caractères max | Pseudo RNGdle. |

Lie un membre à un pseudo RNGdle et importe tous ses tirages. Un pseudo n'est lié qu'à un seul membre par serveur. Lier le membre à un autre pseudo supprime les tirages de l'ancien.

### `/rngdle-admin delete`

Accès : administrateurs. Réponse : visible de vous seul.

| Option   | Requise | Valeurs | Description      |
| -------- | ------- | ------- | ---------------- |
| `member` | oui     | membre  | Membre à délier. |

Délie le membre, supprime ses tirages sur ce serveur et annule son inscription au rappel.

### `/rngdle-admin show`

Accès : administrateurs. Réponse : visible de vous seul.

Aucune option.

Liste les comptes liés sur le serveur.

### `/rngdle-admin refresh`

Accès : administrateurs. Réponse : visible de vous seul.

| Option | Requise | Valeurs             | Description                                                 |
| ------ | ------- | ------------------- | ----------------------------------------------------------- |
| `full` | non     | **True**, **False** | Retélécharger tous les tirages, pas seulement les nouveaux. |

Télécharge tout de suite les nouveaux tirages du serveur. Avec `full`, retélécharge tout l'historique, au plus une fois tous les quarts d'heure.

### `/rngdle-admin clear`

Accès : administrateurs. Réponse : visible de vous seul.

Aucune option.

Supprime les tirages enregistrés sur ce serveur. Ils sont retéléchargés à la synchronisation suivante.

## Réglages

| Réglage                           | Clé                  | Type    | Par défaut | Description                                                                                                                          |
| --------------------------------- | -------------------- | ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Salon RNGdle                      | `leaderboardChannel` | Salon   | aucun      | Salon du classement et du rappel quotidiens, où les membres collent leurs résultats. Tant qu'il n'est pas défini, rien n'est publié. |
| Cartes sur les résultats partagés | `shareCards`         | Booléen | activé     | Répond par une carte quand un membre colle son résultat RNGdle dans le salon RNGdle.                                                 |

## Fonctionnement

- Paliers : chaque tirage est classé selon le percentile de son score parmi tous les tirages de rngdle.com : TRASH (moins de 1 %), COMMON (moins de 50 %), UNCOMMON (moins de 75 %), RARE (moins de 90 %), EPIC (moins de 95 %), ANOMALY (moins de 99 %), MYTHIC.
- Les tirages sont téléchargés à 06:00, 18:00 et 01:00 UTC, et au plus toutes les 5 minutes par serveur quand une commande `/rngdle` est lancée. Si rngdle.com est lent, la commande affiche les données déjà enregistrées après 10 secondes.
- Classement quotidien : chaque jour à 01:00 UTC, le bot publie le classement de la veille dans le salon RNGdle. Le message cite le ou les meilleurs joueurs, le nombre de participants, le tirage le plus rare, le pire tirage et les séries remarquables. Si le téléchargement des tirages d'un serveur échoue, le classement et le rappel partent quand même, à partir des tirages déjà enregistrés.
- Rappel quotidien : chaque jour à 18:00 UTC, le bot mentionne dans le salon RNGdle les inscrits au rappel qui n'ont pas encore tiré depuis minuit UTC. Si personne n'est à rappeler, rien n'est posté.
- Les membres qui ont désactivé leurs mentions avec [`/pings`](../core#pings) sont cités sans être mentionnés.
- Résultat collé : quand un membre colle dans le salon RNGdle le résultat partagé par rngdle.com, le bot y répond avec une carte du tirage (score, palier, badges), sans notifier. Cela marche aussi pour un membre non lié ; sa carte porte alors la mention « Non connecté ». Le bot ne lit le contenu des messages que dans ce salon.
- Un membre a au plus une carte vérifiée par jour (UTC). Les cartes suivantes sont dessinées à partir du seul texte collé.
- Les messages des bots sont ignorés.

## Données conservées

| Donnée                                                             | Conservation                                                                                                                                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pseudo RNGdle lié, tirages (numéro, score, nombre de badges, date) | Jusqu'à `/rngdle unlink`, `/rngdle-admin delete` ou [`/privacy delete`](../core#privacy-delete). `/rngdle-admin clear` supprime les tirages, qui sont retéléchargés ensuite. |
| Inscription au rappel quotidien                                    | Jusqu'à `/rngdle remind` sur **False**, `/rngdle unlink`, `/rngdle-admin delete` ou `/privacy delete`.                                                                       |
| Carte vérifiée obtenue dans la journée                             | Supprimée le surlendemain, ou par `/privacy delete`.                                                                                                                         |
