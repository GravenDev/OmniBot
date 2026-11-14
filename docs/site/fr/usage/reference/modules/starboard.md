# Starboard

|                   |                                                         |
| ----------------- | ------------------------------------------------------- |
| Identifiant       | `starboard`                                             |
| Configuration     | `/config starboard`                                     |
| Intent privilégié | Message Content                                         |
| Utilisé par       | les membres (réactions), les administrateurs (réglages) |

Quand assez de membres différents réagissent à un message avec l'un des emojis configurés, le bot le reposte dans le salon starboard. Le compteur du repost suit ensuite les réactions.

## Commandes

Aucune commande.

## Réglages

| Réglage            | Clé                  | Type               | Par défaut | Description                                                                                 |
| ------------------ | -------------------- | ------------------ | ---------- | ------------------------------------------------------------------------------------------- |
| Salon starboard    | `channel`            | Salon              | aucun      | Salon des reposts. Tant qu'il n'est pas défini, rien n'est reposté.                         |
| Emojis             | `emojis`             | Liste de Emoji     | ⭐         | Réactions comptées, standards ou personnalisées.                                            |
| Seuil              | `threshold`          | Nombre             | `3`        | Nombre de membres différents qui doivent réagir. Une valeur sous 1 compte comme 1.          |
| Auto-star          | `selfStar`           | Booléen            | désactivé  | Compte la réaction de l'auteur du message.                                                  |
| Ignorer les bots   | `ignoreBots`         | Booléen            | activé     | Ne reposte jamais les messages des bots et des webhooks.                                    |
| Salons surveillés  | `allowedChannels`    | Liste de Salon     | aucun      | Seuls ces salons et leurs fils sont surveillés. Vide : tous les salons.                     |
| Salons exclus      | `excludedChannels`   | Liste de Salon     | aucun      | Salons dont les messages ne sont jamais repostés.                                           |
| Catégories exclues | `excludedCategories` | Liste de Catégorie | aucune     | Catégories dont les messages des salons ne sont jamais repostés.                            |
| Sous le seuil      | `belowThreshold`     | Choix              | `keep`     | Quand les réactions repassent sous le seuil : `keep` garde le repost, `remove` le supprime. |

## Fonctionnement

- Les super réactions comptent comme les autres. Un membre qui réagit avec plusieurs des emojis ne compte qu'une fois. Les bots ne comptent jamais, l'auteur du message seulement avec **Auto-star**.
- Le repost reprend l'auteur, le salon, la date, le texte (1500 caractères au plus), les images et vidéos, les stickers, les embeds, la liste des autres fichiers, le message auquel il répond et le contenu d'un message transféré. Il a la même mise en page que les citations de Message Quote, avec un liseré jaune : l'auteur, le salon et la date en petit au-dessus du texte, l'avatar de l'auteur à côté, les médias en galerie, puis, sous un trait, le compteur et un bouton **Aller au message**. Un message de webhook est signé du nom du webhook, et un fichier sous spoiler est listé sous spoiler. Personne n'est mentionné.
- Le compteur suit chaque réaction ajoutée ou retirée, et le repost suit les modifications du message d'origine. Les réactions sur le repost lui-même ne comptent pas.
- Avec `remove`, un repost supprimé sous le seuil peut revenir si le seuil est de nouveau atteint.
- Si le message d'origine est supprimé, son repost l'est aussi. Si un modérateur supprime le repost, le message n'est plus jamais reposté.
- Ne sont jamais repostés : les messages du salon starboard et de ses fils, les messages système, ceux du bot, ceux des bots et des webhooks (sauf si **Ignorer les bots** est désactivé), ceux des salons exclus ou non surveillés, ceux d'un salon NSFW vers un starboard qui ne l'est pas, et ceux des fils privés.
- Les salons réservés à un rôle sont repostés comme les autres. Pour qu'un salon n'apparaisse jamais dans le starboard, ajoutez-le aux salons exclus, ou sa catégorie aux catégories exclues pour un forum, un salon de médias ou une scène. Exclure un salon n'efface pas les reposts déjà publiés.
- Si le bot ne peut pas voir le salon starboard ou y écrire, rien n'est reposté. Changer de salon starboard laisse les anciens reposts en place, et leur compteur continue d'être mis à jour.
- La suppression d'un salon, d'un forum ou d'un fil supprime les reposts de ses messages. La suppression du salon starboard oublie ses reposts.
- Ces suppressions ne sont vues que quand le module est activé et le bot en ligne. Sinon, le repost reste en place et peut être supprimé à la main.

## Données conservées

| Donnée                                                                                                                                                 | Conservation                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pour chaque message reposté : ID du message d'origine, de son salon et du parent de ce salon, du repost et de son salon, nombre de réactions par emoji | Supprimée avec le message d'origine, avec son salon ou son fil, avec le salon starboard, ou avec le repost quand il repasse sous le seuil et que **Sous le seuil** vaut `remove`. Conservée si un modérateur supprime le repost, pour que le message ne soit plus reposté. |

Le texte du message et la liste des membres qui ont réagi ne sont pas enregistrés.
