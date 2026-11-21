# Anniversaires

|                   |                                                                    |
| ----------------- | ------------------------------------------------------------------ |
| Identifiant       | `birthday`                                                         |
| Configuration     | `/config birthday`                                                 |
| Intent privilégié | Server Members                                                     |
| Utilisé par       | les membres (leur anniversaire), les administrateurs (suppression) |

Chaque membre peut enregistrer le jour et le mois de son anniversaire, jamais l'année. Chaque jour, le bot souhaite dans le salon des annonces les anniversaires des membres qui ont accepté d'être annoncés. Le module confronte aussi le paradoxe des anniversaires aux inscriptions du serveur.

## Commandes

### `/birthday set`

Accès : tout le monde. Réponse : visible de vous seul.

| Option     | Requise | Valeurs                          | Description                                                                    |
| ---------- | ------- | -------------------------------- | ------------------------------------------------------------------------------ |
| `day`      | oui     | 1 à 31                           | Jour du mois.                                                                  |
| `month`    | oui     | **janvier** à **décembre**       | Mois.                                                                          |
| `announce` | non     | **True** (par défaut), **False** | L'annoncer sur le serveur. **False** : compté dans les statistiques seulement. |

Enregistre ou modifie votre anniversaire. Une date qui n'existe pas (30 février) est refusée ; le 29 février est accepté. La réponse est votre fiche d'anniversaire : la date, le salon où elle est annoncée, les membres annoncés qui partagent votre date, et un bouton **Ne plus annoncer mon anniversaire** (ou **Annoncer mon anniversaire**) pour changer ce choix.

### `/birthday show`

Accès : tout le monde. Réponse : visible de vous seul.

Aucune option.

Affiche votre fiche d'anniversaire, comme `/birthday set`, avec le même bouton. Sans anniversaire enregistré, la réponse le dit.

### `/birthday remove`

Accès : tout le monde. Réponse : visible de vous seul.

Aucune option.

Supprime votre anniversaire. Vous perdez aussitôt le rôle d'anniversaire.

### `/birthday upcoming`

Accès : tout le monde. Réponse : publique.

Aucune option.

Liste les anniversaires des 30 prochains jours, aujourd'hui compris, des seuls membres qui ont accepté d'être annoncés. Personne n'est notifié.

### `/birthday stats`

Accès : tout le monde. Réponse : publique.

| Option    | Requise | Valeurs                      | Description                                      |
| --------- | ------- | ---------------------------- | ------------------------------------------------ |
| `role`    | non     | rôle                         | Seulement parmi les membres de ce rôle.          |
| `channel` | non     | salon vocal ou de conférence | Seulement parmi les personnes de ce salon vocal. |

Image du paradoxe des anniversaires sur le serveur : nombre d'anniversaires enregistrés, probabilité théorique d'une date partagée, dates réellement partagées, inscription à laquelle est apparue la première date partagée, inscriptions qui manquent pour dépasser une chance sur deux, courbe de la probabilité et répartition par mois. Un résumé en texte accompagne l'image. Avec `role` ou `channel`, le calcul porte sur ce seul groupe ; les deux options ensemble sont refusées. Tous les anniversaires comptent, annoncés ou non, mais une date partagée n'est nommée que si tous ses membres ont accepté d'être annoncés.

### `/birthday-admin remove`

Accès : administrateurs. Réponse : visible de vous seul.

| Option   | Requise | Valeurs | Description                           |
| -------- | ------- | ------- | ------------------------------------- |
| `member` | oui     | membre  | Membre dont supprimer l'anniversaire. |

Supprime l'anniversaire d'un membre, qui perd aussitôt le rôle d'anniversaire. Aucune commande ne permet d'enregistrer celui de quelqu'un d'autre.

## Réglages

| Réglage                               | Clé                 | Type           | Par défaut     | Description                                                                                                                                          |
| ------------------------------------- | ------------------- | -------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Salon des annonces                    | `channel`           | Salon          | aucun          | Salon où sont annoncés les anniversaires. Rien n'est annoncé tant qu'il n'est pas défini.                                                            |
| Rôle d'anniversaire                   | `role`              | Rôle           | aucun          | Rôle donné pour la journée aux membres annoncés. Il est retiré à tous les autres à l'annonce suivante.                                               |
| Fuseau horaire                        | `timeZone`          | Choix          | `Europe/Paris` | Fuseau horaire que suivent les journées du serveur.                                                                                                  |
| Heure des annonces                    | `hour`              | Nombre         | `9`            | Heure de la journée (0 à 23) à laquelle les annonces sont publiées.                                                                                  |
| Messages d'anniversaire               | `messages`          | Liste de Texte | aucun          | Messages tirés au hasard et cités sur la carte quand un seul membre est fêté ; `{user}` est remplacé par le membre. Vide : la carte n'en cite aucun. |
| Paliers du paradoxe des anniversaires | `paradoxMilestones` | Booléen        | activé         | Annoncer les paliers du paradoxe : 23 inscriptions, première date partagée, 57 inscriptions.                                                         |
| Calendrier du mois                    | `monthlyCalendar`   | Booléen        | activé         | Le 1er de chaque mois, publier un calendrier des anniversaires du mois.                                                                              |
| Carte en boucle                       | `loopCard`          | Booléen        | activé         | Rejouer la carte animée sans fin. Désactivé : elle se joue une fois.                                                                                 |

## Fonctionnement

- Chaque jour, à l'heure et dans le fuseau configurés, le bot publie une carte animée des anniversaires du jour, puis mentionne les membres fêtés. Les membres qui ont désactivé leurs mentions avec [`/pings`](../core#pings) ne sont pas notifiés.
- Seuls les membres qui ont accepté d'être annoncés sont fêtés, nommés ou affichés. Les autres comptent seulement dans les statistiques.
- Le 29 février est fêté le 28 les années non bissextiles.
- Si un rôle d'anniversaire est défini, il est donné aux membres fêtés et retiré à tous les autres. Un membre qui supprime son anniversaire ou choisit de ne plus être annoncé le perd aussitôt.
- L'annonce d'une journée est publiée une seule fois. Si le bot est arrêté à l'heure prévue, elle part à son redémarrage le même jour ; une journée entièrement manquée n'est pas rattrapée.
- Si la carte ne peut pas être publiée (permission de joindre des fichiers manquante, par exemple), le bot publie un message texte à la place.
- Le 1er de chaque mois, le bot publie le calendrier du mois en image, sans mentionner personne. Un mois sans anniversaire à montrer ne publie rien.
- Quand un enregistrement fait franchir un palier du paradoxe (23 inscriptions, première date partagée, 57 inscriptions), le bot l'annonce une seule fois, sans nommer ni membre ni date.
- Un membre qui quitte le serveur perd son anniversaire enregistré.

## Données conservées

| Donnée                                                                                             | Conservation                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anniversaire : jour, mois, choix d'être annoncé                                                    | Jusqu'à `/birthday remove`, `/birthday-admin remove`, [`/privacy delete`](../core#privacy-delete), le départ du membre ou la désactivation du module. Conservé si le bot quitte le serveur, jusqu'à son retour. |
| État du serveur : dernier jour annoncé, paliers franchis, inscription de la première date partagée | Jusqu'à la désactivation du module.                                                                                                                                                                             |
