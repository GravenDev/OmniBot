# Ancienneté

|                   |                                          |
| ----------------- | ---------------------------------------- |
| Identifiant       | `seniority`                              |
| Configuration     | `/config seniority`                      |
| Intent privilégié | Server Members                           |
| Utilisé par       | les administrateurs (réglages, recalcul) |

Chaque jour, le bot fête les membres arrivés sur le serveur un jour comme aujourd'hui il y a une année pleine ou plus, et le jour anniversaire de la création du serveur. La date d'arrivée des membres et la date de création du serveur viennent de Discord.

## Commandes

### `/seniority-admin recompute`

Accès : administrateurs. Réponse : visible de vous seul.

| Option   | Requise | Valeurs | Description                          |
| -------- | ------- | ------- | ------------------------------------ |
| `membre` | oui     | membre  | Membre dont recalculer l'ancienneté. |

Fait partir l'ancienneté d'un membre de son premier message sur le serveur quand il précède son arrivée actuelle : c'est le cas d'un membre parti puis revenu, dont Discord a remis la date d'arrivée à zéro. La réponse donne la date retenue et l'arrivée actuelle. Le bot cherche ce premier message avec la recherche de messages de Discord, qui n'est ouverte qu'aux applications ayant l'accès Message Content ; seule la date du message sert. Seul un membre présent peut être recalculé, jamais un bot. Si Discord indexe encore les messages du serveur, la réponse demande de réessayer plus tard.

## Réglages

| Réglage                            | Clé                   | Type    | Par défaut     | Description                                                                                                                                      |
| ---------------------------------- | --------------------- | ------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Salon des annonces                 | `channel`             | Salon   | aucun          | Salon où est annoncée l'ancienneté des membres, et l'anniversaire du serveur s'il n'a pas le sien. Non défini : l'ancienneté n'est pas annoncée. |
| Salon de l'anniversaire du serveur | `serverChannel`       | Salon   | aucun          | Salon où est annoncé l'anniversaire du serveur. Non défini : le salon des annonces.                                                              |
| Fuseau horaire                     | `timeZone`            | Choix   | `Europe/Paris` | Fuseau horaire que suivent les journées du serveur.                                                                                              |
| Heure des annonces                 | `hour`                | Nombre  | `9`            | Heure de la journée (0 à 23) à laquelle les annonces sont publiées.                                                                              |
| Ancienneté des membres             | `memberAnniversaries` | Booléen | activé         | Annoncer les membres présents sur le serveur depuis une année pleine de plus.                                                                    |
| Anniversaire du serveur            | `serverAnniversary`   | Booléen | activé         | Annoncer l'anniversaire de la création du serveur.                                                                                               |
| Cartes en boucle                   | `loopCard`            | Booléen | activé         | Rejouer les cartes animées sans fin. Désactivé : elles se jouent une fois.                                                                       |

## Fonctionnement

- Chaque jour, à l'heure et dans le fuseau configurés, le bot publie une carte animée des membres fêtés, du plus ancien au plus récent, puis les mentionne, une ligne par ancienneté (« **5 ans** · @A @B »). Les bots n'y figurent pas.
- Les mentions ne déclenchent pas de notification push. Les membres qui ont désactivé leurs mentions avec [`/pings`](../core#pings) ne sont pas notifiés du tout.
- Le jour anniversaire de sa création, le bot publie la carte du serveur : icône, date de création, nombre de membres et plus ancienne présence parmi les membres.
- Si une carte ne peut pas être publiée (permission de joindre des fichiers manquante, par exemple), l'annonce part en texte seul, avec les mêmes informations.
- Discord remet la date d'arrivée à zéro quand un membre quitte puis revient ; `/seniority-admin recompute` la corrige. Une ancienneté recalculée sert aussi à la plus ancienne présence de la carte du serveur.
- Une arrivée un 29 février est fêtée le 28 les années non bissextiles.
- Les annonces d'une journée sont publiées une seule fois. Si le bot est arrêté à l'heure prévue, elles partent à son redémarrage le même jour ; une journée entièrement manquée n'est pas rattrapée.

## Données conservées

| Donnée                                                                                     | Conservation                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dernier jour annoncé du serveur                                                            | Sans limite de durée, remplacé chaque jour d'annonce. Aucune donnée personnelle.                                                                                                                                   |
| Ancienneté recalculée : date d'où elle part, jour où le bot a constaté le départ du membre | Un an après le départ constaté du membre, annulé s'il revient. Supprimée par [`/privacy delete`](../core#privacy-delete) ou la désactivation du module. Conservée si le bot quitte le serveur, jusqu'à son retour. |
