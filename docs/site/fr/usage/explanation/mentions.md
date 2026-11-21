# Les annonces et les mentions

Plusieurs modules publient des annonces qui nomment des membres : un anniversaire, une ancienneté, le classement quotidien ou le rappel de RNGdle. La question est de savoir si elle doit aussi le notifier.

## Pourquoi une préférence par membre

Être mentionné fait plaisir à certains et dérange d'autres, surtout quand les annonces sont quotidiennes. Plutôt que de laisser chaque module décider, le bot tient une seule liste par serveur : les membres qui ne veulent plus être mentionnés. Un membre s'y inscrit avec `/pings`, et les modules dont les annonces mentionnent la consultent tous.

Le nom du membre reste affiché dans l'annonce. Seule la notification disparaît. Ainsi, refuser les mentions ne retire personne d'un classement ou d'une fête.

## Une liste par serveur

Un membre peut aimer être notifié sur un petit serveur d'amis et pas sur un grand serveur public. La préférence est donc propre à chaque serveur, comme l'activation des modules.

## Des annonces qui ne mentionnent personne

Certaines annonces ne notifient jamais : les points du Jeu des 4h sont annoncés sans mention, et un message collant est publié en silence, puisqu'il revient après chaque message. Un résultat Clash of Code répond au membre qui a posté le lien : il le mentionne sans le notifier, quelle que soit sa préférence `/pings`. Le texte d'un message collant ne devient pas non plus une mention de masse : `@everyone` ou une mention de rôle y restent du texte.
