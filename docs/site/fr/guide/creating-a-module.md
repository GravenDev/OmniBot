# Créer un module

Un module dans OmniBot est une unité fonctionnelle autonome qui peut être installée et désinstallée par serveur Discord. Chaque module peut contenir des commandes, des écouteurs d'événements, des interactions et ses propres données.

## Structure d'un module

```
src/modules/mon-module/
├── mon-module.module.ts       # Définition du module principal
├── commands/                  # Commandes du module
│   └── ma-commande.command.ts
├── listeners/                 # Écouteurs d'événements
│   └── mon-listener.listener.ts
├── interactions/              # Handlers d'interactions (boutons, etc.)
│   └── mon-bouton.button.ts
├── services/                  # Services métier
│   └── mon-service.service.ts
└── models/                    # Modèles Prisma (optionnel)
    └── mon-modele.prisma
```

## Création d'un module

### 1. Définition du module principal

Créez le fichier principal de votre module :

```typescript
// src/modules/mon-module/mon-module.module.ts

import { GatewayIntentBits } from "discord.js";
import { defineModule } from "#lib/module.js";
import logger from "#lib/logger.js";

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
  onLoad(_client, registry) {
    // Enregistrer les commandes, listeners et interactions
    // registry.register(maCommande);
    // registry.register(monListener);
    // registry.register(monInteraction);

    logger.info("Mon module chargé avec succès");
  },

  // Appelé quand le module est installé sur un serveur
  onInstall(_client, guild) {
    logger.info(`Mon module installé sur ${guild.name}`);
  },

  // Appelé quand le module est désinstallé d'un serveur
  onUninstall(_client, guild) {
    logger.info(`Mon module désinstallé de ${guild.name}`);
  },
});
```

### 2. Cycles de vie

Un module expose trois hooks :

| Hook          | Quand                        | Usage                                              |
| ------------- | ---------------------------- | -------------------------------------------------- |
| `onLoad`      | Au démarrage du bot          | Enregistrer commandes, listeners, interactions     |
| `onInstall`   | Installation sur un serveur  | Créer des rôles, initialiser des données           |
| `onUninstall` | Désinstallation d'un serveur | Nettoyer des données, supprimer des configurations |

### 3. Interface ModuleDeclaration

```typescript
interface ModuleDeclaration {
  id: string; // Identifiant unique (kebab-case)
  name: string; // Nom d'affichage
  description: string; // Description
  version: string; // Version semver (ex: "1.0.0")
  author?: string; // Auteur (optionnel)
  intents?: GatewayIntentBits[]; // Intents Discord requis
  devOnly?: boolean; // Chargé seulement en mode développement
  config?: ConfigSchema; // Schéma de configuration (voir Configuration)

  onLoad: (client, registry) => void;
  onInstall: (client, guild, registry) => void;
  onUninstall: (client, guild, registry) => void;
}
```

## Bonnes pratiques

### Conventions de nommage

- **ID du module** : kebab-case (`mon-super-module`)
- **Nom du fichier** : `{id}.module.ts`
- **Dossier** : même nom que l'ID du module

### Gestion des intents

Déclarez uniquement les intents nécessaires à votre module. Consultez la [documentation Discord](https://discord.com/developers/docs/events/gateway#list-of-intents) pour savoir quels intents sont requis.

### Gestion des erreurs

```typescript
onInstall(_client, guild) {
  try {
    // Logique d'installation
  } catch (error) {
    logger.error(`Erreur lors de l'installation : ${error.message}`);
  }
}
```

### Organisation des fichiers

- Gardez le fichier principal du module léger
- Séparez la logique complexe dans des services
- Utilisez des sous-dossiers pour organiser commandes, listeners et interactions

## Découverte automatique

Les modules sont chargés automatiquement depuis `src/modules/` au démarrage. Le chargeur (`module-loader.ts`) :

1. Parcourt chaque sous-dossier de `src/modules/`
2. Cherche un fichier `*.module.ts` (ou `*.module.js`)
3. Importe le module et vérifie qu'il expose un `default` de type `Module`
4. Ignore les modules marqués `devOnly: true` en production

Aucun enregistrement manuel n'est nécessaire.

## Prochaines étapes

- [Commandes](./commands) — Ajouter des commandes slash à votre module
- [Écouteurs](./listeners) — Réagir aux événements Discord
- [Interactions](./interactions) — Boutons, modales et menus déroulants
- [Configuration](./configuration) — Déclarer un schéma de configuration
- [Services](./services) — Organiser la logique métier
- [Base de données](./database) — Utiliser Prisma avec votre module
