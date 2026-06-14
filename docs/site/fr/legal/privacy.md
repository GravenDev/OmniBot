# Politique de confidentialité

Dernière mise à jour : juin 2026

## Responsable du traitement

OmniBot est un projet open-source développé par la communauté Graven - Développement. Le bot est auto-hébergé par les administrateurs de serveur qui le déploient. Chaque opérateur d'instance est le responsable du traitement pour son instance.

Le code source est disponible sur [github.com/GravenDev/OmniBot](https://github.com/GravenDev/OmniBot) sous licence GNU GPL v3.

## Données collectées

OmniBot collecte uniquement les données nécessaires à son fonctionnement :

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

## Stockage des données

Les données sont stockées dans une base de données PostgreSQL gérée par l'opérateur de l'instance du bot. La base de données n'est partagée avec aucun tiers. L'opérateur est responsable de la sécurisation de son instance de base de données.

## Conservation des données

Les données de configuration et d'activation sont conservées tant que le bot est actif sur un serveur. Quand un module est désinstallé, ses données de configuration peuvent être conservées dans le blob de configuration du serveur (configurable par les opérateurs d'instance). Pour demander la suppression des données, contactez l'opérateur de l'instance.

## Partage des données

OmniBot ne partage pas les données collectées avec des tiers. Le seul service externe utilisé est l'API Discord, qui reçoit des données dans le cadre du fonctionnement normal du bot (envoi de messages, réponse aux interactions, enregistrement des commandes).

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

Pour exercer ces droits, contactez l'opérateur de l'instance du bot avec laquelle vous interagissez.

## Modifications de cette politique

Cette politique peut être mise à jour pour refléter les changements dans les pratiques de traitement des données. L'utilisation continue du bot après les modifications constitue l'acceptation de la politique mise à jour.

## Contact

Pour toute question concernant cette politique de confidentialité, ouvrez une issue sur le [dépôt GitHub](https://github.com/GravenDev/OmniBot/issues) ou rejoignez le serveur Discord [Graven - Développement](https://discord.gg/graven).
