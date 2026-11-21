# Création de fils

|                   |                                            |
| ----------------- | ------------------------------------------ |
| Identifiant       | `thread-creator`                           |
| Configuration     | `/config thread-creator`                   |
| Intent privilégié | Message Content                            |
| Utilisé par       | automatique, réglé par les administrateurs |

Dans les salons surveillés, le bot ouvre un fil de discussion sous chaque nouveau message et peut y poster un message de bienvenue.

## Commandes

Aucune commande.

## Réglages

| Réglage              | Clé                  | Type           | Par défaut                                       | Description                                                                                                                                                                                                                                                          |
| -------------------- | -------------------- | -------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Salons surveillés    | `channels`           | Liste de Salon | aucun                                            | Salons où un fil est créé sous chaque message. Liste vide : rien n'est surveillé.                                                                                                                                                                                    |
| Message de bienvenue | `welcomeMessage`     | Texte          | `💬 Utilisez ce fil pour discuter de ce sujet !` | Message posté dans chaque fil créé. La valeur par défaut suit la langue du serveur tant qu'elle n'est pas modifiée.                                                                                                                                                  |
| Template de nom      | `threadNameTemplate` | Texte          | `Discussion - {messageAuthor}`                   | Nom des fils. Variables : `{messageAuthor}` (nom d'affichage de l'auteur), `{messageContent}` (50 premiers caractères du message), `{timestamp}` (date et heure, `JJ/MM HH:MM`, à l'heure de la machine qui fait tourner le bot, qui peut différer de votre fuseau). |

## Fonctionnement

- Seuls les salons textuels sont pris en charge : pas les fils, les salons vocaux, les forums ni les salons d'annonces.
- Les messages des bots sont ignorés.
- Le nom du fil est coupé à 100 caractères, la limite de Discord.
- Au plus 5 fils sont créés toutes les 10 secondes par serveur. Au-delà, les messages attendent leur tour, dans l'ordre. Cette file d'attente est perdue au redémarrage du bot.
- Aucun fil n'est créé si le message a été supprimé entre-temps, si un fil existe déjà sur le message, si le salon a atteint la limite de fils actifs ou si le bot n'a pas les permissions nécessaires.
- Si le bot peut créer le fil mais pas y écrire, le fil est créé sans message de bienvenue.
- Désactiver le module avec `/modules` arrête la surveillance sans effacer les réglages.

## Données conservées

| Donnée | Conservation                                                                                                      |
| ------ | ----------------------------------------------------------------------------------------------------------------- |
| Aucune | Le module n'enregistre rien. Les fils créés restent sur Discord, sous le contrôle des administrateurs du serveur. |
