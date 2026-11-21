# Salons vocaux temporaires

|                   |                                                             |
| ----------------- | ----------------------------------------------------------- |
| Identifiant       | `temp-voice`                                                |
| Configuration     | `/config temp-voice`                                        |
| Intent privilégié | aucun                                                       |
| Utilisé par       | les membres (salons et panneau), les administrateurs (hubs) |

Rejoindre un salon vocal « hub » crée un salon vocal temporaire, y déplace le membre et lui en donne la propriété. Le propriétaire le gère depuis un panneau de contrôle. Le salon est supprimé dès qu'il n'y reste plus aucun membre (les bots ne comptent pas).

## Commandes

Aucune commande slash. Le salon se gère depuis le panneau de contrôle publié dans son chat textuel.

### Panneau de contrôle

Accès : le propriétaire du salon et les membres qui ont la permission Gérer les salons sur ce salon. **Récupérer le salon** est ouvert à tous les membres présents dans le salon. Réponse : visible de vous seul.

Le panneau affiche le nom du salon, son mode d'accès, sa limite, le nombre d'invités et de bloqués, et le propriétaire. Il se met à jour à chaque changement.

Le menu **Qui peut rejoindre ?** règle le mode d'accès :

| Mode               | Effet                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Ouvert**         | Les permissions de la catégorie s'appliquent : tout le monde voit le salon et peut le rejoindre.                               |
| **Sur invitation** | Le salon reste visible, mais seuls le propriétaire et les invités peuvent entrer. Les rôles de modération ne sont pas touchés. |
| **Privé**          | Le salon est caché : seuls le propriétaire, les invités et les modérateurs le voient et peuvent y entrer.                      |

| Bouton                 | Effet                                                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nom et limite**      | Formulaire prérempli : nom du salon (1 à 100 caractères) et limite de membres (0 à 99, 0 pour aucune). Discord autorise 2 renommages par salon toutes les 10 minutes : au-delà, le bot dit quand réessayer.             |
| **Membres**            | Affiche les présents, les invités et les bloqués, avec les menus **Inviter**, **Bloquer**, **Déconnecter** (s'il y a quelqu'un d'autre dans le salon) et **Retirer d'une liste** (s'il y a des invités ou des bloqués). |
| **Transférer**         | Donne le salon à un membre présent dans le salon qui n'en possède pas déjà un.                                                                                                                                          |
| **Supprimer**          | Demande confirmation, en indiquant combien de membres seront déconnectés, puis supprime le salon.                                                                                                                       |
| **Récupérer le salon** | Visible seulement quand le propriétaire a quitté le salon. Un membre présent en prend la propriété, s'il n'en possède pas déjà un autre. Les listes d'invités et de bloqués sont conservées.                            |

| Menu de **Membres**     | Effet                                                                                                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inviter**             | Jusqu'à 10 membres à la fois. Ils peuvent voir et rejoindre le salon même sur invitation ou privé. Le bouton **Prévenir par message privé** (15 minutes) leur envoie le lien du salon en MP, au plus une fois toutes les 10 minutes par membre. |
| **Bloquer**             | Jusqu'à 10 membres à la fois. Ils ne peuvent plus voir ni rejoindre le salon, et sont déconnectés s'ils y sont. Les modérateurs ne peuvent pas être bloqués.                                                                                    |
| **Déconnecter**         | Fait sortir des membres présents, sans les empêcher de revenir. Les modérateurs ne peuvent pas être déconnectés.                                                                                                                                |
| **Retirer d'une liste** | Retire des membres des invités ou des bloqués : leur accès suit de nouveau le mode du salon.                                                                                                                                                    |

Les listes d'invités et de bloqués sont limitées à 25 membres au total par salon.

## Réglages

| Réglage | Clé    | Type               | Par défaut | Description                                                                                                                                                                                |
| ------- | ------ | ------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hubs    | `hubs` | Réglages par salon | aucun      | Pour chaque salon vocal hub : **Nom du salon**, nom des salons créés (1 à 100 caractères, `{user}` remplacé par le pseudo du membre) ; **Limite de membres (0-99)**, 0 pour aucune limite. |

Le bot refuse un hub qui est lui-même un salon temporaire, ou dans la catégorie duquel il lui manque une de ces permissions : Voir le salon, Se connecter, Gérer les salons, Gérer les permissions, Déplacer des membres, Envoyer des messages. Retirer un hub ne supprime pas les salons qu'il a déjà créés.

## Fonctionnement

- Le salon est créé dans la catégorie du hub, avec ses permissions, son débit binaire et sa région. Son nom et sa limite viennent du hub, sauf si le membre a des réglages mémorisés.
- Le propriétaire n'obtient jamais plus de droits que ce qu'il a déjà sur le hub.
- Un membre qui possède déjà un salon temporaire et rejoint un hub est ramené dans son salon. Après une création, il doit attendre 10 secondes avant d'en créer un autre.
- Si le bot ne peut pas créer le salon, le membre en est averti dans le chat du hub.
- Réglages mémorisés : quand le propriétaire change le nom, la limite, le mode d'accès ou ses listes, ces réglages sont repris à son prochain salon. Les changements faits par un modérateur ne sont pas mémorisés.
- Toutes les 10 minutes, et au démarrage du bot, les salons temporaires vides depuis plus d'une minute sont supprimés. Un salon vidé pendant que le bot était hors ligne disparaît donc à son retour.
- Quand le module est désactivé, les salons existants restent en place et leur panneau ne répond plus, mais ils sont toujours supprimés une fois vides.
- Supprimer un hub à la main le retire de la configuration.

## Données conservées

| Donnée                                                                                                     | Conservation                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Salon temporaire ouvert : ID du salon, de son hub et de son propriétaire, mode d'accès, invités et bloqués | Supprimé avec le salon, quand il se vide ou est supprimé ; si le bot est hors ligne, à son retour. |
| Réglages mémorisés d'un membre : nom, limite, mode d'accès, invités et bloqués                             | Supprimés un an après la dernière modification ou la dernière création de salon du membre.         |

`/privacy delete` ne supprime pas ces données.
