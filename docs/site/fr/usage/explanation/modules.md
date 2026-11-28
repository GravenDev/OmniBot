# Les modules, serveur par serveur

OmniBot n'est pas un bot à tout faire qu'on accepte en bloc. C'est un ensemble de modules indépendants, et chaque serveur choisit ceux qu'il veut.

## Pourquoi tout est désactivé au départ

Quand le bot arrive sur un serveur, aucun module ne tourne. Il poste un message de bienvenue qui renvoie vers `/modules` et `/config`, et rien d'autre.

Ce choix tient à deux raisons. D'abord, un module agit sur le serveur : il répond aux messages, poste des annonces, crée des fils ou sanctionne des comptes. Un serveur qui n'a rien demandé ne doit pas voir le bot commencer à réagir tout seul. Ensuite, beaucoup de modules gardent des données : scores, anniversaires, statistiques. En ne les activant qu'à la demande, le bot ne collecte rien qu'un administrateur n'ait choisi.

## Activé ici, pas ailleurs

L'activation et la configuration sont propres à chaque serveur. Le même bot peut faire tourner le Jeu des 4h sur un serveur et seulement les Signalements sur un autre. Les données suivent la même règle : un score, un compte RNGdle ou un anniversaire enregistrés sur un serveur ne se voient pas sur un autre.

Les commandes d'un module n'apparaissent sur un serveur qu'une fois le module activé. Le cœur du bot, lui, est toujours là : il porte `/modules` et `/config` pour les administrateurs, `/pings` et `/privacy` pour tout le monde.

## Désactiver n'efface pas, en général

Désactiver un module l'arrête : il ne répond plus et ne publie plus rien. Sa configuration et ses données sont gardées, et une fois réactivé, il reprend où il en était. Seul le ménage continue : les données arrivées au bout de leur durée de conservation sont quand même supprimées, et les salons vocaux temporaires sont toujours supprimés une fois vides. C'est la même logique quand le bot quitte le serveur : la configuration est gardée, et revient s'il est réinvité.

Deux modules font exception : les Anniversaires et l'Ancienneté. Les anniversaires sont des données que chaque membre a confiées lui-même, pour ce serveur. Les anciennetés recalculées dépendent de messages ou de membres qui peuvent avoir disparu. Les garder après la désactivation reviendrait à conserver des données personnelles sans usage ; les supprimer est irréversible. C'est pourquoi `/modules` demande une confirmation avant de les désactiver, quand il y a quelque chose à supprimer.

## Les modules indisponibles

Certains modules ont besoin d'un « intent privilégié » : une autorisation que Discord accorde à un bot, au cas par cas, pour lire le contenu des messages (Message Content) ou la liste des membres (Server Members). Sans elle, le module ne pourrait pas fonctionner correctement.

Quand l'intent manque, le module n'est pas chargé, sur aucun serveur. `/modules` le montre marqué 🚫, avec l'intent manquant. S'il était déjà activé sur un serveur, il le reste et garde sa configuration : il reprend dès que Discord accorde l'intent et que le bot redémarre. Cela ne dépend pas des administrateurs du serveur, mais de l'opérateur du bot.
