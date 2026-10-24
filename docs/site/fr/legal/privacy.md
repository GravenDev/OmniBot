# Politique de confidentialité

Dernière mise à jour : octobre 2026

## Responsable du traitement

OmniBot est un projet open-source développé par la communauté Graven - Développement. Chacun peut héberger sa propre instance du bot, et chaque opérateur d'instance est le responsable du traitement pour son instance.

L'instance officielle, l'application OmniBot proposée par Graven - Développement, est exploitée par l'équipe de Graven - Développement. Pour la joindre, rejoignez le serveur Discord [Graven - Développement](https://discord.gg/graven) ou ouvrez une issue sur le [dépôt GitHub](https://github.com/GravenDev/OmniBot/issues).

Le code source est disponible sur [github.com/GravenDev/OmniBot](https://github.com/GravenDev/OmniBot) sous licence GNU GPL v3.

## Données collectées

OmniBot collecte uniquement les données nécessaires à son fonctionnement. Tous les modules sont désactivés par défaut : les données propres à un module ne sont collectées que sur les serveurs où un administrateur l'a activé.

### Identifiants Discord

- **IDs utilisateur** — pour associer configurations, actions et permissions aux utilisateurs
- **IDs de rôles** — pour stocker des références de rôles dans les configurations des modules
- **IDs de salons** — pour stocker des références de salons dans les configurations des modules
- **IDs de catégories** — pour stocker des références de catégories dans les configurations des modules
- **IDs de serveurs (guildes)** — pour stocker les configurations par serveur et les états d'activation des modules

### Données de configuration

- Valeurs de configuration des modules (chaînes, nombres, toggles booléens, sélections d'énumérations) telles que définies par le schéma de chaque module
- La configuration est stockée au format JSON dans la base de données

### État d'activation des modules

- Quels modules sont activés ou désactivés sur chaque serveur
- La version à laquelle chaque module a été installé pour la dernière fois

### Préférence de mention

Quand un membre désactive ses mentions avec `/pings`, le bot enregistre l'ID du serveur et l'ID du membre, pour ne plus le notifier dans ses annonces sur ce serveur. L'entrée est supprimée quand le membre réactive ses mentions.

### Signalements

Quand un membre signale un message avec le module Signalements, le bot enregistre :

- une copie du message signalé : son texte, sa version modifiée si l'auteur le modifie ensuite, et les liens de ses pièces jointes ;
- l'ID de l'auteur, du salon et du message, et la date d'envoi du message ;
- l'ID de chaque membre qui l'a signalé, avec le motif qu'il a éventuellement donné ;
- les décisions des modérateurs : ID du modérateur, sanction, motif et durée.

Cette copie permet aux modérateurs de juger le message même si son auteur le modifie ou le supprime. L'identité des membres qui signalent n'est montrée qu'aux modérateurs.

### Jeux communautaires

- **Jeu des 4h** : le score de chaque joueur, l'historique de ses points (temps tenu et date), le meilleur temps de chaque journée, et le dernier message du salon de jeu (ID du salon, du message et de son auteur, heure d'envoi).
- **RNGdle** : le pseudo RNGdle qu'un membre lie à son compte Discord, ses tirages téléchargés depuis rngdle.com (numéro, score, nombre de badges et date), son inscription au rappel quotidien, et pour chaque jour le fait qu'il a déjà obtenu sa carte vérifiée.
- **Clash of Code** : pour chaque partie dont le lien est posté, son identifiant CodinGame, son mode, sa date de début et l'ID du salon et du message du lien ; pour chaque joueur, son ID, son pseudo et l'ID de son avatar CodinGame, et l'ID Discord du membre qui y a lié son compte ; pour chaque participation, le rang, le score, le temps, le nombre de caractères et le langage.

### Réactions automatiques

Le module Auto React enregistre, pour chaque salon configuré, l'emoji à ajouter. Il n'enregistre rien sur les membres.

### Statistiques d'activité

Quand le module Server Stats est activé sur un serveur, le bot compte chaque jour, par serveur, les messages par salon et par membre, les réactions par emoji, ainsi que les arrivées et départs de membres. Seuls des compteurs sont enregistrés, jamais le contenu des messages. Ces compteurs sont supprimés au bout de 90 jours. Le bilan quotidien publié sur le serveur peut citer les membres les plus actifs ; les administrateurs peuvent le désactiver.

## Contenu des messages lu sans être stocké

Certains modules lisent le contenu des messages pour fonctionner, sans l'enregistrer en base de données :

- **Message Log** garde en mémoire les messages récents, pour publier dans le salon de logs du staff le texte d'un message supprimé ou l'ancienne et la nouvelle version d'un message modifié ;
- **Message Quote** lit le message dont un membre poste le lien, pour en publier une citation ;
- **LaTeX** lit les messages pour repérer les formules et les rendre en image ;
- **Thread Creator** peut reprendre les 50 premiers caractères d'un message dans le nom du fil qu'il crée ;
- **RNGdle** lit les messages du seul salon RNGdle, pour reconnaître un résultat collé et y répondre avec une carte ;
- **Clash of Code** lit les messages des salons choisis par les administrateurs (tous les salons si aucun n'est choisi), pour repérer les liens de partie : seul l'identifiant de la partie est conservé.

Ce que ces modules publient reste sur le serveur Discord, sous le contrôle de ses administrateurs. Le bot ignore les messages des autres bots, sauf Auto React, qui leur ajoute aussi sa réaction sans les lire.

## Stockage des données

Les données sont stockées dans une base de données PostgreSQL gérée par l'opérateur de l'instance du bot. La base de données n'est partagée avec aucun tiers. L'opérateur est responsable de la sécurisation de son instance de base de données.

## Conservation des données

- **Configuration et activation des modules** : conservées tant que le bot est sur le serveur. Quand le bot quitte un serveur (kick ou retrait), elles sont volontairement conservées afin que tout soit restauré automatiquement si le bot est réinvité. Désactiver un module ne supprime ni sa configuration ni ses données : elles restent soumises aux durées ci-dessous.
- **Signalements** : un signalement en cours est conservé jusqu'à sa clôture. Un signalement clos est supprimé, copie du message comprise, au bout de 90 jours ; les administrateurs de chaque serveur peuvent changer ce délai.
- **Statistiques d'activité** : supprimées au bout de 90 jours.
- **RNGdle** : les tirages, le pseudo et l'inscription au rappel sont conservés jusqu'à ce que le membre se délie avec `/rngdle unlink`, ou qu'un administrateur le délie. L'indication de carte obtenue est supprimée le lendemain.
- **Jeu des 4h** : les scores et l'historique des points sont conservés jusqu'à ce qu'un administrateur supprime le score du joueur.
- **Clash of Code** : les parties, les joueurs et leurs résultats sont conservés sans limite de durée, pour l'historique du classement. La liaison à un compte Discord est retirée quand le membre se délie avec `/coc unlink`, ou qu'un administrateur le délie.
- **Préférence de mention et réactions automatiques** : conservées jusqu'à ce que le membre, ou un administrateur, les retire.

Pour demander la suppression de vos données, contactez l'opérateur de l'instance.

## Partage des données

OmniBot ne vend pas les données collectées et ne les partage avec aucun tiers. Il ne s'en sert pas pour de la publicité, de l'analyse marketing ni pour entraîner des modèles d'intelligence artificielle.

Le bot contacte quatre services externes :

- **l'API Discord**, qui reçoit des données dans le cadre du fonctionnement normal du bot (envoi de messages, réponse aux interactions, enregistrement des commandes) ;
- **rngdle.com**, pour le module RNGdle : le bot y envoie les pseudos RNGdle liés, pour télécharger les tirages, et récupère la table des scores du site ;
- **rng.cubityfir.st**, pour le module RNGdle : le bot y envoie le numéro d'un tirage, pour obtenir la liste de ses badges ;
- **codingame.com**, pour le module Clash of Code : le bot y envoie l'identifiant d'une partie, tiré du lien posté, pour en obtenir le résultat, et récupère les avatars des joueurs sur static.codingame.com.

Aucun identifiant Discord ni contenu de message n'est envoyé à rngdle.com, à rng.cubityfir.st ni à codingame.com.

## Open Source

En tant que projet open-source, le code source complet est publiquement disponible pour audit. Les utilisateurs peuvent :

- Voir exactement quelles données sont collectées et comment elles sont traitées
- Auto-héberger leur propre instance avec un contrôle total sur leurs données
- Modifier le code pour changer les pratiques de traitement des données

## Vos droits

Selon votre juridiction, vous pouvez avoir le droit de :

- Accéder à vos données personnelles
- Demander la suppression de vos données personnelles
- Restreindre ou vous opposer au traitement

Pour exercer ces droits, contactez l'opérateur de l'instance du bot avec laquelle vous interagissez ; pour l'instance officielle, l'équipe de Graven - Développement.

## Modifications de cette politique

Cette politique peut être mise à jour pour refléter les changements dans les pratiques de traitement des données. L'utilisation continue du bot après les modifications constitue l'acceptation de la politique mise à jour.

## Contact

Pour toute question concernant cette politique de confidentialité, ouvrez une issue sur le [dépôt GitHub](https://github.com/GravenDev/OmniBot/issues) ou rejoignez le serveur Discord [Graven - Développement](https://discord.gg/graven).
