# Honeypot

|                   |                                |
| ----------------- | ------------------------------ |
| Identifiant       | `honeypot`                     |
| Configuration     | `/config honeypot`             |
| Intent privilégié | Message Content                |
| Utilisé par       | les administrateurs (réglages) |

Quand un membre écrit dans un salon piège, le bot le softban : il le bannit en supprimant ses messages récents sur tout le serveur, puis lève aussitôt le bannissement. Le piège vise les bots de spam et les comptes piratés, qui postent partout sans lire. Le membre peut revenir avec une invitation.

## Commandes

Aucune commande.

## Réglages

| Réglage           | Clé              | Type           | Par défaut | Description                                                                                                        |
| ----------------- | ---------------- | -------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Salons pièges     | `trapChannels`   | Liste de Salon | aucun      | Salons où personne ne doit écrire. Un membre qui y poste est softban. Rien ne se passe tant qu'aucun n'est défini. |
| Salon des logs    | `logChannel`     | Salon          | aucun      | Salon où chaque piège déclenché est consigné.                                                                      |
| Salon du compteur | `counterChannel` | Salon          | aucun      | Salon où le bot tient un message qui compte les membres pris au piège, mis à jour à chaque prise.                  |
| Rôles exemptés    | `exemptRoles`    | Liste de Rôle  | aucun      | Les membres ayant l'un de ces rôles ne sont jamais sanctionnés.                                                    |
| Durée de purge    | `purgeWindow`    | Durée          | `1h`       | Jusqu'où le softban supprime les messages du membre sur tout le serveur (7 jours au plus).                         |

## Fonctionnement

- Ne sont jamais sanctionnés : le propriétaire du serveur, les membres qui peuvent gérer les messages dans le salon piège (administrateurs compris) et ceux qui ont un rôle exempté. Les messages des bots, des webhooks et du système sont ignorés.
- Si le bot ne peut pas bannir le membre (rôle trop haut, permission Bannir des membres manquante), il supprime seulement le message piège et le signale dans le log.
- La raison inscrite au journal d'audit est « Honeypot : message dans #salon ».
- Si un salon des logs est défini, chaque déclenchement y est consigné : l'auteur, le salon piège, le message cité et le résultat de la sanction. Personne n'est notifié. Réservez ce salon au staff : le message y est cité quel que soit son salon d'origine.
- Si un salon du compteur est défini, le bot y publie le message « 🍯 Le pot de miel », modifié à chaque prise, qui compte les membres pris et indique la date de la dernière prise. Il apparaît à la première prise qui suit le choix du salon. Si le bot perd ses permissions dans ce salon, le message reste figé et se met à jour à la première prise qui suit leur retour.
- Le bot a besoin de la permission Bannir des membres, et de Gérer les messages dans les salons pièges.

## Données conservées

| Donnée                                                                                    | Conservation                                                                              |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Nombre de membres pris, date de la dernière prise, ID du message compteur et de son salon | Sans limite de durée, même quand le module est désactivé ou que le bot quitte le serveur. |
| Qui a été pris                                                                            | Non enregistré.                                                                           |
