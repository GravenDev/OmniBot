# Journal des messages

|                   |                           |
| ----------------- | ------------------------- |
| Identifiant       | `message-log`             |
| Configuration     | `/config message-log`     |
| Intent privilégié | Message Content           |
| Utilisé par       | le staff (salon des logs) |

Le bot consigne dans un salon réservé au staff les messages supprimés et, si l'option est active, les messages modifiés.

## Commandes

Aucune commande.

## Réglages

| Réglage                     | Clé                  | Type               | Par défaut | Description                                                                             |
| --------------------------- | -------------------- | ------------------ | ---------- | --------------------------------------------------------------------------------------- |
| Salon des logs              | `logChannel`         | Salon              | aucun      | Salon où les messages sont consignés. Tant qu'il n'est pas défini, rien n'est consigné. |
| Salons exclus               | `excludedChannels`   | Liste de Salon     | aucun      | Salons dont les messages ne sont pas consignés.                                         |
| Catégories exclues          | `excludedCategories` | Liste de Catégorie | aucune     | Catégories dont les messages des salons ne sont pas consignés.                          |
| Consigner les modifications | `logEdits`           | Booléen            | activé     | Consigne aussi les messages modifiés, avec leur texte avant et après.                   |

## Fonctionnement

- Message supprimé : le log donne l'auteur, le salon, la date d'envoi, le texte et le nom des pièces jointes, avec l'ID de l'auteur et l'ID du message. Un texte trop long pour le log est joint en fichier.
- Un message que le bot n'a plus en mémoire ne peut pas être consigné : Discord n'en transmet alors ni l'auteur ni le texte.
- La ligne « Supprimé par » n'apparaît que si le journal d'audit du serveur confirme qu'un modérateur a supprimé le message d'un autre membre. Le bot a besoin de la permission _Voir les logs du serveur_. En cas de doute, aucun nom n'est affiché.
- Suppression en masse : un log par salon, avec le nombre de messages supprimés et, en fichier joint, le texte de ceux qui étaient en cache.
- Message modifié : le log donne le texte avant et après, et un lien vers le message. Si l'un des deux dépasse 1 024 caractères, les deux versions complètes sont jointes en fichier. Une mise à jour qui ne change pas le texte (aperçu de lien, épinglage) est ignorée.
- Ne sont pas consignés : les messages des bots, des webhooks, les messages système, ceux des salons et catégories exclus et ceux du salon des logs.
- Un forum ou un fil ne se choisit pas dans les salons exclus : excluez sa catégorie.
- Les mentions des logs ne notifient personne.
- Dans le salon des logs, le bot a besoin de _Voir le salon_, _Envoyer des messages_ et _Intégrer des liens_, sinon rien n'est consigné. Sans _Joindre des fichiers_, les logs partent sans fichier joint.
- Le salon des logs doit être réservé au staff : il reçoit le texte des messages de tous les salons non exclus, fils privés compris.

## Données conservées

| Donnée                                                       | Conservation                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Messages récents (auteur, texte, pièces jointes), en mémoire | Un temps limité, en mémoire seulement. Rien n'est enregistré en base de données. |
| Logs publiés dans le salon des logs                          | Sur Discord, sous le contrôle des administrateurs du serveur.                    |
