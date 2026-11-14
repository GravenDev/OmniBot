# Citation de messages

|                   |                            |
| ----------------- | -------------------------- |
| Identifiant       | `message-quote`            |
| Configuration     | `/config message-quote`    |
| Intent privilégié | Message Content            |
| Utilisé par       | les membres (liens postés) |

Quand un membre poste le lien d'un message du serveur, le bot y répond avec une citation de ce message, si le membre peut le lire.

## Commandes

Aucune commande.

## Réglages

| Réglage            | Clé                  | Type               | Par défaut | Description                                                                              |
| ------------------ | -------------------- | ------------------ | ---------- | ---------------------------------------------------------------------------------------- |
| Salons exclus      | `excludedChannels`   | Liste de Salon     | aucun      | Salons dont les messages ne sont jamais cités, et où les liens postés ne sont pas cités. |
| Catégories exclues | `excludedCategories` | Liste de Catégorie | aucune     | Catégories dont les salons sont traités comme des salons exclus.                         |

## Fonctionnement

- Liens reconnus : `https://discord.com/channels/…`, y compris `ptb.`, `canary.` et `discordapp.com`.
- Chaque citation a son cadre, à la couleur de rôle de l'auteur (un lavande clair à défaut) : l'auteur, le salon et la date en petit au-dessus du texte, l'avatar de l'auteur à côté, les images et vidéos en galerie, puis les embeds, les stickers et les autres fichiers. Sous un trait viennent le membre qui cite et un bouton **Aller au message** qui ouvre l'original. La mise en page est celle des reposts du starboard.
- Un message transféré est cité avec son contenu transféré. Un message sans texte montre ses embeds, ses fichiers ou ses médias ; la citation ne dit qu'il n'a pas de texte que s'il n'a rien de tout cela. Un message transféré est marqué « ↪ Message transféré ».
- Seuls les 3 premiers liens différents d'un message sont pris en compte.
- La citation ne notifie personne : ni les mentions du message cité, ni l'auteur du lien.
- Ne sont pas cités :
  - les liens vers un autre serveur ;
  - les messages d'un salon que le membre qui poste le lien ne peut pas lire (pour un fil privé : en être membre ou pouvoir gérer les fils) ;
  - les messages d'un salon NSFW, sauf si le lien est posté dans un salon NSFW ;
  - les citations publiées par le bot lui-même ;
  - les liens entre chevrons (`<https://…>`), dans du code ou sous spoiler ;
  - les messages des salons exclus, et les liens postés dans un salon exclu ;
  - les liens postés par des bots.
- Les images et vidéos sous spoiler restent floutées dans la galerie, et un fichier sous spoiler est listé sous spoiler. Si Discord refuse l'un des médias, la citation est publiée sans galerie, ses images et vidéos listées en liens.
- Le bot a besoin, dans le salon du lien, de Voir le salon, d'Envoyer des messages (Envoyer des messages dans les fils pour un fil) et de Voir les anciens messages ; sans elles, il ne répond pas.
- Le bouton **Supprimer**, sous la dernière citation, retire la citation. Il est réservé au membre qui a posté le lien, aux auteurs des messages cités et aux membres qui peuvent gérer les messages ; les autres reçoivent une réponse visible d'eux seuls.

## Données conservées

| Donnée | Conservation                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Aucune | Le module n'enregistre rien. Les citations publiées restent sur Discord jusqu'à leur suppression avec **Supprimer** ou par un modérateur. |
