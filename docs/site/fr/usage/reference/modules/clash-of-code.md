# Clash of Code

|                   |                                                      |
| ----------------- | ---------------------------------------------------- |
| Identifiant       | `clash-of-code`                                      |
| Configuration     | `/config clash-of-code`                              |
| Intent privilégié | Message Content                                      |
| Utilisé par       | les membres (parties), les administrateurs (imports) |

Suit les parties de [Clash of Code](https://www.codingame.com/multiplayer/clashofcode) dont un membre poste le lien, publie leur résultat et tient un classement des victoires. Les données sont propres à chaque serveur. Elles viennent d'une API publique mais non documentée de CodinGame : si CodinGame la change, le suivi s'arrête.

## Commandes

### `/coc leaderboard`

Accès : tout le monde. Réponse : publique.

| Option | Requise | Valeurs                                                                 | Description                            |
| ------ | ------- | ----------------------------------------------------------------------- | -------------------------------------- |
| `mode` | non     | **Tous les modes** (par défaut), **Fastest**, **Shortest**, **Reverse** | Ne compter que les parties de ce mode. |
| `page` | non     | 1 ou plus                                                               | Numéro de page. Par défaut : 1.        |

Image du classement, 10 joueurs par page, avec les boutons **◀ Précédent** et **Suivant ▶**. Les joueurs sont classés par nombre de victoires (1re place d'une partie), puis par nombre de parties (le moins d'abord). Un membre lié absent de la page voit sa ligne sous le tableau.

### `/coc profile`

Accès : tout le monde. Réponse : publique.

| Option   | Requise | Valeurs                                 | Description                            |
| -------- | ------- | --------------------------------------- | -------------------------------------- |
| `member` | non     | membre                                  | Membre à consulter. Par défaut : vous. |
| `player` | non     | pseudo CodinGame déjà vu sur le serveur | Pseudo CodinGame à consulter.          |

Carte de profil : parties, victoires, taux de victoire, rang moyen, score moyen, temps moyen et rang au classement des victoires. `member` et `player` ne se combinent pas. Sans option, la carte est celle de votre compte lié.

### `/coc link`

Accès : tout le monde. Réponse : visible de vous seul.

| Option   | Requise | Valeurs                                 | Description                                                 |
| -------- | ------- | --------------------------------------- | ----------------------------------------------------------- |
| `player` | oui     | pseudo CodinGame déjà vu sur le serveur | Votre pseudo CodinGame, tel qu'il apparaît dans une partie. |

Lie votre compte Discord à un joueur CodinGame déjà vu dans une partie du serveur. Un joueur n'est lié qu'à un seul membre, et un membre à un seul joueur : lier un autre joueur remplace le précédent. CodinGame ne permet pas de vérifier qu'un compte vous appartient.

### `/coc unlink`

Accès : tout le monde. Réponse : visible de vous seul.

Aucune option.

Délie votre compte CodinGame. Vos parties restent enregistrées.

### `/coc-admin import`

Accès : administrateurs. Réponse : publique.

| Option | Requise | Valeurs                   | Description                       |
| ------ | ------- | ------------------------- | --------------------------------- |
| `game` | oui     | texte, 200 caractères max | Lien ou identifiant de la partie. |

Importe une partie terminée et publie son résultat. C'est le moyen d'ajouter une partie dont le lien n'a pas été posté avant sa fin. Une partie déjà enregistrée sur le serveur est refusée.

### `/coc-admin import-channel`

Accès : administrateurs. Réponse : visible de vous seul.

| Option    | Requise | Valeurs                                | Description        |
| --------- | ------- | -------------------------------------- | ------------------ |
| `channel` | oui     | salon textuel, salon d'annonces ou fil | Salon à parcourir. |

Importe toutes les parties terminées dont le lien a été posté dans le salon, sans rien y publier. La réponse donne l'avancement, puis un bilan : importées, déjà enregistrées, pas terminées, inconnues de CodinGame, en échec. Un seul import de salon à la fois par serveur. L'import s'arrête au bout de 13 minutes, ou si CodinGame demande d'attendre plus de 5 minutes : relancer la commande sur le même salon reprend là où il s'est arrêté, tant que le bot n'a pas redémarré.

### `/coc-admin unlink`

Accès : administrateurs. Réponse : visible de vous seul.

| Option   | Requise | Valeurs | Description      |
| -------- | ------- | ------- | ---------------- |
| `member` | oui     | membre  | Membre à délier. |

Délie le compte CodinGame d'un membre, par exemple un compte réclamé à tort. Aucune partie n'est supprimée.

## Réglages

| Réglage       | Clé        | Type           | Par défaut | Description                                                                        |
| ------------- | ---------- | -------------- | ---------- | ---------------------------------------------------------------------------------- |
| Salons suivis | `channels` | Liste de Salon | aucun      | Salons (et leurs fils) où les liens de partie sont suivis. Vide : tous les salons. |

## Fonctionnement

- Quand un membre poste un lien de partie (`https://www.codingame.com/clashofcode/clash/<id>`, page de résultat comprise), le bot ajoute la réaction ⏳ et suit la partie jusqu'à sa fin.
- À la fin, il retire la réaction et répond au message avec l'image du résultat (rang, joueur, score, temps, et nombre de caractères en mode Shortest) et le nom du ou des gagnants. L'auteur du lien est mentionné sans notification, et personne d'autre.
- Au plus 3 parties sont suivies par message. Sont ignorés : les liens dans du code ou sous spoiler, les messages des bots.
- Un lien vers une partie déjà terminée quand il est posté est ignoré. Pour l'ajouter, un administrateur utilise `/coc-admin import`.
- Une partie déjà enregistrée ou déjà suivie sur le serveur n'est pas suivie une deuxième fois.
- Une partie terminée sans avoir commencé, inconnue de CodinGame, encore en cours après 2 heures ou injoignable 10 fois de suite est abandonnée : la réaction est retirée et rien n'est publié.
- Une partie en cours de suivi est reprise après un redémarrage du bot.

## Données conservées

| Donnée                                                                                                              | Conservation                                                                               |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Parties (identifiant CodinGame, mode, date de début, ID du salon et du message du lien)                             | Sans limite de durée.                                                                      |
| Joueurs (ID, pseudo et ID d'avatar CodinGame) et participations (rang, score, temps, nombre de caractères, langage) | Sans limite de durée.                                                                      |
| Liaison d'un joueur à votre compte Discord                                                                          | Jusqu'à `/coc unlink`, `/coc-admin unlink` ou [`/privacy delete`](../core#privacy-delete). |
