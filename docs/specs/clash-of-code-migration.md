# Spec — Module Clash of Code : portage depuis le bot CoC

> **Statut : implémenté.** Ce document a servi de contrat d'implémentation.

## Objectif

Porter dans OmniBot le bot [GravenDev/CoC](https://github.com/GravenDev/CoC) (Rust, serenity + sea-orm), qui suit les parties de Clash of Code postées sur le serveur, publie leur résultat et tient un classement. Le bot n'a jamais été déployé : il n'y a aucune donnée à reprendre.

## Source de l'API

`POST https://www.codingame.com/services/ClashOfCode/findClashReportInfoByHandle`, corps `["<handle>"]`, sans authentification. Elle répond `422` (`{"id":502,"message":"Clash not found"}`) pour une partie inconnue. Les avatars viennent de `https://static.codingame.com/servlet/fileservlet?id=<avatarId>&format=profile_avatar`. L'API n'est pas documentée : `services/api.ts` valide chaque champ et rejette une réponse inattendue.

## Arborescence

```
src/modules/clash-of-code/
├── clash-of-code.module.ts      # intents Guilds, GuildMessages, MessageContent
├── clash-of-code.config.ts      # channels: [CHANNEL]
├── clash-of-code.prisma         # CocGame, CocPlayer, CocParticipation
├── commands/                    # /coc (leaderboard, profile, link, unlink), /coc-admin (import, unlink)
├── interactions/                # pagination du classement
├── listeners/                   # détection des liens
├── services/
│   ├── api.ts                   # client CodinGame
│   ├── links.ts                 # extraction des liens (pur)
│   ├── stats.ts                 # classement et profil (pur)
│   ├── store.ts                 # accès Prisma, import transactionnel, liaison
│   ├── views.ts                 # données + rendu
│   └── watcher.ts               # suivi des parties en cours
├── rendering/                   # image de résultat, thème, formats
└── tasks.ts                     # reprise du suivi (au démarrage puis toutes les heures)
```

## Décisions

- Les commandes sont regroupées sous `/coc` et `/coc-admin` au lieu de `/leaderboard`, `/profile`, `/import` et `/bulk`, qui entreraient en collision avec d'autres modules.
- `/bulk` n'est pas porté : il importait une liste d'identifiants codée en dur pour une migration ponctuelle.
- `/import` devient `/coc-admin import`, réservé aux administrateurs : le bot original l'ouvrait à tous.
- Ajout de `/coc link` : la colonne `discord_id` du bot original n'était jamais remplie.
- Le classement compte les victoires comme l'original, avec le nombre de parties en départage et une pagination.

## Corrections par rapport au bot original

| Défaut d'origine                                                                    | Correction                                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Liste d'attente en mémoire, perdue au redémarrage                                   | Partie suivie stockée en base (`status = WATCHING`) et reprise par la tâche `resume-watch` |
| Partie en erreur interrogée indéfiniment                                            | Abandon après 2 h ou 10 erreurs de suite                                                   |
| Lien détecté seulement en début de message, identifiant englobant la fin du message | Regex sur l'identifiant hexadécimal, n'importe où, hors code et spoilers                   |
| Doublon testé par `LIKE %handle%`, tous serveurs confondus                          | Clé `(guildId, handle)`                                                                    |
| Joueurs partagés entre serveurs                                                     | Clé `(guildId, codingamerId)`                                                              |
| `/leaderboard` non filtré par serveur                                               | Toutes les requêtes sont limitées au serveur                                               |
| Import sans transaction, partiel en cas d'erreur                                    | Une transaction, sérialisée par serveur ; réimporter est sans effet                        |
| `mode` nul → plantage (`unwrap`)                                                    | Mode facultatif                                                                            |
