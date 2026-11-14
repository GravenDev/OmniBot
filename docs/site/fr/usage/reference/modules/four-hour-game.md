# Jeu des 4h

|                   |                                                 |
| ----------------- | ----------------------------------------------- |
| Identifiant       | `four-hour-game`                                |
| Configuration     | `/config four-hour-game`                        |
| Intent privilégié | aucun                                           |
| Utilisé par       | les membres (jeu), les administrateurs (scores) |

Dans le salon de jeu, le dernier message posté « tient » : si aucun autre membre n'écrit pendant le délai configuré, son auteur marque un point. Chaque jour, le message resté le plus longtemps sans réponse rapporte un point du jour, compté à part.

## Commandes

### `/jd4h score`

Accès : tout le monde. Réponse : publique.

| Option   | Requise | Valeurs | Description                            |
| -------- | ------- | ------- | -------------------------------------- |
| `member` | non     | membre  | Membre à consulter. Par défaut : vous. |

Image du joueur : points, points du mois (UTC), meilleur temps tenu, série en cours et record, date du dernier point, points du jour et rang au classement des points du jour, rang au classement du serveur. Un membre sans aucun point reçoit un message texte.

### `/jd4h leaderboard`

Accès : tout le monde. Réponse : publique.

| Option | Requise | Valeurs                                            | Description         |
| ------ | ------- | -------------------------------------------------- | ------------------- |
| `type` | non     | **Points des 4h** (par défaut), **Points du jour** | Classement affiché. |

Image du classement, 10 joueurs par page, avec les boutons **◀ Précédent** et **Suivant ▶**. La ligne du membre qui lance la commande est surlignée, ou ajoutée sous le tableau. Les membres à 0 point n'y figurent pas.

### `/jd4h-admin set`

Accès : administrateurs. Réponse : visible de vous seul.

| Option   | Requise | Valeurs           | Description                 |
| -------- | ------- | ----------------- | --------------------------- |
| `member` | oui     | membre            | Membre dont fixer le score. |
| `score`  | oui     | 1 à 1 000 000 000 | Nouveau score.              |

Fixe le score. L'historique des points du membre est conservé.

### `/jd4h-admin unset`

Accès : administrateurs. Réponse : visible de vous seul.

| Option   | Requise | Valeurs | Description                     |
| -------- | ------- | ------- | ------------------------------- |
| `member` | oui     | membre  | Membre dont supprimer le score. |

Supprime le score du membre, l'historique de ses points et ses points du jour.

## Réglages

| Réglage      | Clé       | Type  | Par défaut | Description                                                                                   |
| ------------ | --------- | ----- | ---------- | --------------------------------------------------------------------------------------------- |
| Salon du jeu | `channel` | Salon | aucun      | Salon dans lequel se joue le jeu. Tant qu'il n'est pas défini, le module ne fait rien.        |
| Délai        | `delay`   | Durée | `4h`       | Durée pendant laquelle un message doit rester le dernier pour que son auteur marque un point. |

## Fonctionnement

- Un message de l'auteur du dernier message est ignoré : on ne relance pas son propre délai.
- Quand le délai est écoulé, le message suivant fait marquer un point à l'auteur du message précédent. Le bot l'annonce dans le salon : temps tenu, nouveau total, rang. Personne n'est mentionné.
- Un message supprimé ne compte plus : le message de joueur précédent encore présent reprend sa place.
- Sont ignorés : les messages de bots, les messages système, les messages des fils du salon.
- Point du jour : les journées suivent l'heure de Paris. À minuit, l'auteur du message resté le plus longtemps en place dans la journée gagne le point du jour, annoncé dans le salon. Le délai configuré ne compte pas pour le point du jour.
- Au redémarrage, le bot relit le salon pour rattraper les points marqués pendant son arrêt.

## Données conservées

| Donnée                                                                        | Conservation                                                                      |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Score, historique des points (temps tenu, date), points du jour               | Jusqu'à `/jd4h-admin unset` ou [`/privacy delete`](../core#privacy-delete).       |
| Meilleur temps de chaque journée                                              | Comme ci-dessus.                                                                  |
| Dernier message du salon de jeu (ID du salon, du message, de l'auteur, heure) | Remplacé à chaque message. Effacé par `/privacy delete` si vous en êtes l'auteur. |
