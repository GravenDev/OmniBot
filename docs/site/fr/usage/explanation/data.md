# Les données gardées par le bot

Un bot qui compte des messages, garde des scores ou cite des messages manipule forcément des données sur les membres. OmniBot cherche à en garder le moins possible, et à laisser chacun reprendre les siennes.

## Rien sans un module activé

Le cœur du bot ne garde que la configuration du serveur, la liste des modules activés et, pour les membres qui l'ont demandé, leur préférence `/pings`. Tout le reste dépend des modules. Comme ils sont tous désactivés au départ, un serveur qui n'active rien ne fait collecter aucune donnée de module. Le détail de chaque module est dans la section « Données conservées » de sa page de [référence](../reference/modules/).

## Lire n'est pas garder

Plusieurs modules lisent le contenu des messages sans l'enregistrer. Le Journal des messages garde les messages récents en mémoire, pour publier le texte d'un message supprimé dans un salon du staff. La Citation de messages lit le message dont on poste le lien, pour le citer. LaTeX lit les messages pour y repérer des formules. Ce qu'ils publient reste sur le serveur, sous le contrôle de ses administrateurs.

Quand un module garde quelque chose, c'est souvent un compteur plutôt qu'un contenu. Les Statistiques du serveur comptent les messages par salon et par membre, jamais leur texte, et n'enregistrent pas qui arrive ou part. Le Honeypot compte les comptes pris au piège, sans garder lesquels.

## Des durées limitées quand c'est possible

Certaines données disparaissent d'elles-mêmes : les signalements au plus tard 30 jours après le dernier signalement du message, les compteurs d'activité au bout d'un an, les réglages mémorisés d'un salon vocal temporaire un an après leur dernier usage. D'autres restent tant qu'elles servent : un score de jeu ou un classement n'a de sens que s'il dure.

## Chaque membre garde la main

Un membre n'a pas à passer par un administrateur pour effacer ce que le bot sait de lui. `/privacy delete` supprime, sur le serveur où il la lance, ses statistiques, ses données de jeu, son anniversaire (et le rôle d'anniversaire du jour), son ancienneté recalculée et sa préférence de mention, que les modules soient activés ou non.

Certaines données n'en font pas partie. Les signalements d'abord : un signalement sert aux modérateurs à juger un message, même si son auteur l'a modifié ou supprimé. Laisser l'auteur, ou celui qui signale, l'effacer viderait le module de son sens. Ils sont donc supprimés par la purge automatique, pas à la demande. Les réglages mémorisés d'un salon vocal temporaire ne sont pas supprimés non plus : ils partent d'eux-mêmes un an après leur dernier usage. Enfin, les joueurs Clash of Code et leurs résultats, qui viennent de CodinGame, restent au classement : seul leur lien avec le membre est retiré.

La [politique de confidentialité](../../legal/privacy) donne la liste complète, avec les bases légales et les services externes contactés.
