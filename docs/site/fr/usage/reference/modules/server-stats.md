# Statistiques du serveur

|                   |                                            |
| ----------------- | ------------------------------------------ |
| Identifiant       | `server-stats`                             |
| Configuration     | `/config server-stats`                     |
| Intent privilégié | Server Members                             |
| Utilisé par       | les administrateurs et les rôles autorisés |

Compte l'activité quotidienne du serveur, publie un bilan chaque nuit et l'affiche à la demande. Seuls des compteurs sont enregistrés, jamais le contenu des messages ni l'identité des membres qui arrivent ou partent.

## Commandes

### `/server-stats today`

Accès : administrateurs et rôles autorisés (réglage `allowedRoles`). Réponse : publique.

Aucune option.

Image du bilan de la journée en cours, compté en direct jusqu'à l'heure indiquée sous la date (heure de Paris).

### `/server-stats day`

Accès : administrateurs et rôles autorisés (réglage `allowedRoles`). Réponse : publique.

| Option | Requise | Valeurs                                                                                                         | Description |
| ------ | ------- | --------------------------------------------------------------------------------------------------------------- | ----------- |
| `date` | oui     | aujourd'hui ou un des 365 jours précédents, choisi dans la liste ou écrit `2026-10-29`, `29/10/2026` ou `29/10` | Le jour.    |

Image du bilan du jour choisi. Sans année, `29/10` désigne la dernière fois que ce jour est passé. Un jour passé est comparé aux jours précédents encore conservés.

### `/server-stats period`

Accès : administrateurs et rôles autorisés (réglage `allowedRoles`). Réponse : publique.

| Option | Requise | Valeurs                                                                                                                        | Description                                              |
| ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `days` | non     | **7 derniers jours** (par défaut), **14 derniers jours**, **30 derniers jours**, **90 derniers jours**, **365 derniers jours** | Les derniers jours complets, aujourd'hui exclu.          |
| `from` | non     | une date, comme pour `/server-stats day`                                                                                       | Premier jour. Par défaut : le plus ancien jour conservé. |
| `to`   | non     | une date, comme pour `/server-stats day`                                                                                       | Dernier jour. Par défaut : aujourd'hui.                  |

Image du bilan de plusieurs jours cumulés. `days` ne se combine pas avec `from` ou `to`. Les membres actifs et les salons actifs ne comptent qu'une fois sur la période. Une période n'affiche ni écart ni record.

## Réglages

| Réglage                              | Clé                      | Type               | Par défaut | Description                                                                                                                                                                                           |
| ------------------------------------ | ------------------------ | ------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Salon du bilan                       | `reportChannel`          | Salon              | aucun      | Salon où le bilan de la veille est publié chaque nuit. Tant qu'il n'est pas défini, rien n'est publié.                                                                                                |
| Salons exclus                        | `excludedChannels`       | Liste de Salon     | aucun      | Salons dont l'activité n'est pas comptée.                                                                                                                                                             |
| Catégories exclues                   | `excludedCategories`     | Liste de Catégorie | aucune     | Catégories dont l'activité des salons n'est pas comptée.                                                                                                                                              |
| Compter les salons privés            | `includePrivateChannels` | Booléen            | désactivé  | Compte aussi les salons que `@everyone` ne voit pas. À activer quand `@everyone` ne voit aucun salon (accès donné par un rôle de membre). Les salons du staff sont alors comptés aussi : excluez-les. |
| Allowed roles                        | `allowedRoles`           | Liste de Rôle      | aucun      | Rôles qui peuvent utiliser `/server-stats`, en plus des administrateurs. Vide : administrateurs seulement.                                                                                            |
| Afficher les membres les plus actifs | `showTopMembers`         | Booléen            | activé     | Affiche les membres les plus actifs dans le bilan.                                                                                                                                                    |

## Fonctionnement

- Dès que le module est activé, le bot compte, par jour (heure de Paris) : les messages par salon, par membre et par heure, les réactions ajoutées par emoji, les arrivées et les départs de membres. Les messages d'un fil comptent pour son salon parent.
- Ne sont pas comptés : les bots, les messages système, les salons et catégories exclus et, par défaut, les salons que `@everyone` ne voit pas (dont les fils privés). Ce qui se passe pendant que le bot est arrêté n'est pas compté.
- Bilan quotidien : chaque jour à minuit (heure de Paris), le bot publie dans le salon du bilan l'image de la veille : nombre de membres, nouveaux membres et départs, messages, membres actifs, réactions, les 5 salons et les 5 réactions les plus actifs, les messages par heure et les 5 membres les plus actifs.
- Une fois 7 journées comptées, messages, membres actifs et réactions sont comparés à la moyenne des 7 dernières journées comptées. Ces trois valeurs et les nouveaux membres sont signalés comme record quand ils dépassent tous les jours conservés, à partir de 7 journées de comparaison et d'une valeur d'au moins 5.
- Personne n'est mentionné, ni dans le bilan quotidien ni dans les réponses à `/server-stats`.
- `/server-stats` est visible de tous les membres. Un membre sans accès reçoit un message visible de lui seul.
- Sans l'intent privilégié Server Members, le module est indisponible sur tous les serveurs.

## Données conservées

| Donnée                                                                                                                      | Conservation                                                                  |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Compteurs du jour : messages par salon et par heure, réactions par emoji, arrivées, départs, nouveaux membres qui ont posté | Supprimés au bout d'un an, même si le module est désactivé.                   |
| Nombre de messages de chaque membre par jour                                                                                | Supprimé au bout d'un an, ou par [`/privacy delete`](../core#privacy-delete). |
| Date de début du comptage sur le serveur                                                                                    | Sans limite de durée.                                                         |
