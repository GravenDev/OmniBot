# Réactions automatiques

|                   |                                |
| ----------------- | ------------------------------ |
| Identifiant       | `autoreact`                    |
| Configuration     | `/config autoreact`            |
| Intent privilégié | aucun                          |
| Utilisé par       | les administrateurs (réglages) |

Le bot ajoute une réaction à chaque nouveau message des salons configurés. Chaque salon a un seul emoji.

## Commandes

Aucune commande.

## Réglages

| Réglage                | Clé         | Type               | Par défaut | Description                                                                                                                                                                         |
| ---------------------- | ----------- | ------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Réactions automatiques | `reactions` | Réglages par salon | aucun      | Pour chaque salon textuel ou d'annonces : **Emoji**, la réaction ajoutée. Emoji Unicode, nom d'emoji (`:thumbsup:`), emoji personnalisé (`<:nom:id>`) ou nom d'un emoji du serveur. |

Le bot refuse un emoji personnalisé d'un serveur où il n'est pas, et un salon où il ne peut pas voir le salon, voir les anciens messages ou ajouter des réactions.

## Fonctionnement

- Le bot réagit à tous les nouveaux messages du salon, y compris ceux des autres bots et des webhooks. Il ignore ses propres messages et les messages système.
- Les messages des fils ne sont pas concernés.
- Si un emoji personnalisé n'existe plus, la réaction automatique du salon est retirée.
- Si le bot perd l'accès au salon ou une permission nécessaire, ou si Discord refuse un emoji Unicode, il cesse de réagir dans ce salon pendant 10 minutes, puis réessaie.
- Un membre qui a bloqué le bot ne reçoit pas la réaction.
- La suppression d'un salon retire sa réaction automatique.

## Données conservées

| Donnée                       | Conservation                                                          |
| ---------------------------- | --------------------------------------------------------------------- |
| Salon configuré et son emoji | Jusqu'au retrait dans `/config autoreact` ou la suppression du salon. |
