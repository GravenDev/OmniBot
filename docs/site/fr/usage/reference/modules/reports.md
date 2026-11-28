# Signalements

|                   |                                                      |
| ----------------- | ---------------------------------------------------- |
| Identifiant       | `reports`                                            |
| Configuration     | `/config reports`                                    |
| Intent privilégié | Message Content                                      |
| Utilisé par       | les membres (signalement), les modérateurs (alertes) |

Les membres signalent un message par une réaction ou par le menu contextuel. Les modérateurs reçoivent dans le salon des alertes une alerte avec une copie du message et des boutons d'action. Rien n'est signalé tant que le salon des alertes n'est pas défini.

## Commandes

### Signaler le message

Accès : tout le monde. Réponse : visible de vous seul.

Commande du menu contextuel d'un message : clic droit sur le message (appui long sur mobile), **Applications**, **Signaler le message**. Aucune option.

Une fenêtre demande un motif facultatif (500 caractères au plus), puis une confirmation s'affiche. Ne peuvent pas être signalés : vos propres messages, les messages des bots et du système, et ceux du salon des alertes et de ses fils.

## Réglages

| Réglage              | Clé             | Type  | Par défaut | Description                                                                                                |
| -------------------- | --------------- | ----- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| Salon des alertes    | `alertChannel`  | Salon | aucun      | Salon où les modérateurs reçoivent les signalements. Rien n'est signalé tant qu'il n'est pas défini.       |
| Emoji de signalement | `emoji`         | Emoji | 🚩         | Réagir avec cet emoji signale le message. La réaction est retirée aussitôt.                                |
| Rôle modérateur      | `moderatorRole` | Rôle  | aucun      | Rôle mentionné à l'arrivée d'un nouveau signalement.                                                       |
| Conservation         | `retention`     | Durée | `30d`      | Durée pendant laquelle un signalement clos garde sa copie du message avant d'être purgé. 30 jours au plus. |

## Fonctionnement

- Par réaction : le bot retire aussitôt la réaction, pour que personne ne voie qui a signalé. Celui qui signale ne reçoit aucune confirmation. Si le bot ne peut pas voir le salon d'alertes ou y écrire, la réaction reste et rien n'est signalé. S'il ne peut pas retirer la réaction (permission Gérer les messages manquante dans le salon), le signalement part quand même mais la réaction reste visible, et l'alerte le signale. Les messages qu'on ne peut pas signaler par la commande ne le sont pas non plus par réaction, même si la réaction est retirée.
- Un message signalé donne une seule alerte, quel que soit le nombre de signalements. Le premier mentionne le rôle modérateur ; les suivants mettent l'alerte à jour sans mentionner. Un même membre ne compte qu'une fois par message.
- L'alerte montre l'auteur, le salon et un lien vers le message, sa date, une copie du message (texte et liens des pièces jointes), les membres qui ont signalé avec leurs motifs, et l'historique des signalements de l'auteur. Si l'auteur modifie ou supprime son message, l'alerte l'indique et garde la copie.
- Boutons de l'alerte, avec la permission qu'ils demandent dans le salon des alertes :
  - **Supprimer le message** (Gérer les messages, aussi dans le salon du message) : l'alerte reste ouverte.
  - **Avertir** (Exclure temporairement) : envoie en message privé à l'auteur le texte saisi et le lien du message.
  - **Exclure…** (Exclure temporairement) : exclusion temporaire, `1h` par défaut, 28 jours au plus.
  - **Expulser** (Expulser des membres).
  - **Bannir** (Bannir des membres) : suppression facultative de ses messages récents, 7 jours au plus.
  - **Softban** (Bannir des membres) : bannit puis débannit aussitôt pour supprimer ses messages récents, `1d` par défaut, 7 jours au plus.
  - **Classer sans suite** (Gérer les messages).
  - **Signalement abusif** (Gérer les messages) : le signalement ne compte pas dans l'historique de l'auteur.
  - **Rouvrir** (Gérer les messages) : rouvre une alerte close.
- Toutes les actions sauf **Supprimer le message** et **Rouvrir** closent l'alerte. Un nouveau signalement sur une alerte close la rouvre et mentionne le rôle modérateur.
- Le motif d'une sanction est facultatif, sauf pour l'avertissement ; il est repris dans le journal d'audit du serveur. Une sanction est refusée si l'auteur est le propriétaire du serveur, si votre rôle le plus haut n'est pas au-dessus du sien, ou si le bot ne peut pas l'atteindre. Un auteur qui a quitté le serveur ne peut plus qu'être banni ou softban.
- Chaque jour à 04:00 UTC, les signalements expirés sont supprimés et leur alerte indique qu'ils ont été purgés.

## Données conservées

| Donnée                                                                                                                         | Conservation                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Signalement : copie du message (texte, version modifiée, pièces jointes), ID de l'auteur, du salon et du message, date d'envoi | Clos : supprimé après la durée `retention`. Dans tous les cas, supprimé au plus tard 30 jours après le dernier signalement du message. Non effacé par `/privacy delete`. |
| Membres qui ont signalé et leurs motifs                                                                                        | Comme ci-dessus.                                                                                                                                                         |
| Décisions des modérateurs : modérateur, sanction, motif, durée                                                                 | Comme ci-dessus.                                                                                                                                                         |
