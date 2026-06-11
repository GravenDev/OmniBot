# Guide des Modules

Un module dans AsyncMod est une unité fonctionnelle autonome qui peut être installée et désinstallée par serveur
Discord. Chaque module peut contenir des commandes, des listeners d'événements et ses propres données.

## Structure d'un Module

```
src/modules/mon-module/
├── mon-module.module.ts    # Définition du module principal
├── commands/               # Commandes du module
│   └── ma-commande.command.ts
├── listeners/              # Listeners d'événements
│   └── mon-listener.listener.ts
└── models/                 # Modèles de données (optionnel)
    └── mon-modele.prisma
```

## Création d'un Module

### 1. Définition du Module Principal

Créez le fichier principal de votre module :

```typescript
// src/modules/mon-module/mon-module.module.ts

export default defineModule({
  id: "mon-module",
  name: "Mon Module",
  description: "Description de mon module personnalisé.",
  version: "1.0.0",
  author: "Votre Nom", // Optionnel

  // Intents Discord requis par le module
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],

  // Appelé au démarrage du bot
  onLoad(client, registry) {
    // Enregistrer les commandes
    registry.register(maCommande);

    // Enregistrer les listeners
    registry.register(monListener);

    // Enregistrer les interactions
    registry.register(monInteraction);

    logger.info("Mon module chargé avec succès");
  },

  // Appelé quand le module est installé sur un serveur
  onInstall(client, guild, registry) {
    logger.info(`Mon module installé sur ${guild.name}`);

    // Exemples de logique d'installation :
    // - Créer des rôles
    // - Configurer des channels
    // - Initialiser des données
  },

  // Appelé quand le module est désinstallé d'un serveur
  onUninstall(client, guild, registry) {
    logger.info(`Mon module désinstallé de ${guild.name}`);

    // Exemple de logique de nettoyage :
    // - Supprimer des données
    // - Nettoyer des configurations
  },
});
```

### 2. Interface ModuleDeclaration

Voici les propriétés disponibles pour définir un module :

```typescript
interface ModuleDeclaration {
  id: string; // Identifiant unique (requis)
  name: string; // Nom d'affichage (requis)
  description: string; // Description (requis)
  version: string; // Version semver (requis)
  author?: string; // Auteur (optionnel)
  intents?: GatewayIntentBits[]; // Intents Discord (optionnel)

  // Hooks du cycle de vie
  onLoad: (client, registry) => void;
  onInstall: (client, guild, registry) => void;
  onUninstall: (client, guild, registry) => void;
}
```

## Bonnes Pratiques

### Naming Convention

- **ID du module** : kebab-case (`mon-super-module`)
- **Nom du fichier** : `{id}.module.ts`
- **Dossier** : même nom que l'ID du module

### Gestion des Intents

Ne déclarez uniquement les intents nécessaires à votre module.

### Gestion des Erreurs

Toujours gérer les erreurs dans les hooks :

```typescript
onInstall(client, guild, registry);
{
  try {
    // Logique d'installation
  } catch (error) {
    logger.error(`Erreur lors de l'installation du module : ${error.message}`);
  }
}
```

### Organisation des Fichiers

- Gardez le fichier principal du module léger
- Séparez la logique complexe dans des services
- Utilisez des sous-dossiers pour organiser commandes et listeners

## Découverte automatique

Les modules sont chargés automatiquement depuis `src/modules/` au démarrage — aucun enregistrement manuel n'est nécessaire en dehors du dossier du module.

## Prochaines Étapes

Une fois votre module créé, consultez :

- [Guide des Commandes](./commands.md) pour ajouter des commandes
- [Guide des Listeners](./listeners.md) pour écouter des événements
- [Guide des Interactions](./interactions.md) pour définir des interactions (boutons, modal, etc.)
