# Modules

Tous les modules sont désactivés par défaut. Un administrateur les active avec `/modules` et les règle avec `/config <identifiant>`.

| Module                                    | Identifiant      | Intent privilégié | Ce qu'il fait                                                                                                           |
| ----------------------------------------- | ---------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [Ancienneté](./seniority)                 | `seniority`      | Server Members    | Fête l'ancienneté des membres sur le serveur, et l'anniversaire du serveur.                                             |
| [Anniversaires](./birthday)               | `birthday`       | Server Members    | Souhaite les anniversaires des membres et met le paradoxe des anniversaires à l'épreuve.                                |
| [Citation de messages](./message-quote)   | `message-quote`  | Message Content   | Cite les messages Discord dont le lien est posté, pour les membres autorisés à les lire.                                |
| [Clash of Code](./clash-of-code)          | `clash-of-code`  | Message Content   | Suit les parties de Clash of Code dont le lien est posté, publie leur résultat et tient un classement des victoires.    |
| [Création de fils](./thread-creator)      | `thread-creator` | Message Content   | Crée automatiquement des fils de discussion sous chaque nouveau message dans les salons configurés.                     |
| [Honeypot](./honeypot)                    | `honeypot`       | Message Content   | Softban quiconque écrit dans un salon piège, pour attraper les bots de spam et les comptes piratés.                     |
| [Jeu des 4h](./four-hour-game)            | `four-hour-game` | aucun             | Un point quand votre message reste le dernier du salon de jeu pendant le délai configuré, et un point du jour.          |
| [Journal des messages](./message-log)     | `message-log`    | Message Content   | Consigne les messages supprimés et modifiés dans un salon du staff.                                                     |
| [LaTeX](./latex)                          | `latex`          | Message Content   | Affiche des formules LaTeX sous forme d'image.                                                                          |
| [Messages collants](./sticky)             | `sticky`         | aucun             | Garde un message en bas des salons configurés en le republiant après chaque nouveau message.                            |
| [Réactions automatiques](./autoreact)     | `autoreact`      | aucun             | Ajoute automatiquement une réaction à chaque nouveau message dans les salons configurés.                                |
| [RNGdle](./rngdle)                        | `rngdle`         | Message Content   | Suit les tirages rngdle.com des membres : classements, profils, statistiques du serveur.                                |
| [Salons vocaux temporaires](./temp-voice) | `temp-voice`     | aucun             | Crée un salon vocal pour qui rejoint un hub, géré par son propriétaire depuis un panneau, et le supprime une fois vide. |
| [Signalements](./reports)                 | `reports`        | Message Content   | Les membres signalent un message ; les modérateurs reçoivent une alerte avec des actions.                               |
| [Starboard](./starboard)                  | `starboard`      | Message Content   | Reposte dans un salon dédié les messages qui reçoivent assez de réactions.                                              |
| [Statistiques du serveur](./server-stats) | `server-stats`   | Server Members    | Compte l'activité quotidienne du serveur, publie un bilan chaque nuit et l'affiche à la demande.                        |

Les commandes du cœur du bot (`/modules`, `/config`, `/pings`, `/privacy`) sont dans [Commandes du bot](../core).
