# Créer un module

Un module dans OmniBot est une unité fonctionnelle autonome qui peut être installée et désinstallée par serveur Discord. Chaque module peut contenir des commandes, des écouteurs d'événements, des gestionnaires d'interactions, des services, une configuration et des modèles de base de données.

## Structure d'un module

```
src/modules/mon-module/
├── mon-module.module.ts          # Définition principale du module
├── i18n/                         # Fichiers de traduction
│   ├── en.json
│   └── fr.json
├── commands/                     # Commandes slash
│   └── saluer.command.ts
├── listeners/                    # Écouteurs d'événements
│   └── message-create.listener.ts
├── interactions/                 # Gestionnaires de boutons, modales, selects
│   ├── confirmer.button.ts
│   └── retour.modal.ts
├── services/                     # Logique métier
│   └── mon-service.service.ts
└── models/                       # Schémas Prisma (optionnel)
    └── mon-modele.prisma
```

## Guide pas à pas : Créer un module « Salut »

::: tip
Le `name` et `description` du module doivent être en anglais par défaut — ils servent de valeur de repli quand aucun fichier de traduction ne correspond à la locale du serveur. Ajoutez les traductions dans les fichiers `i18n/` pour les autres locales.
:::

### 1. Créer le dossier et le fichier principal

```typescript
// src/modules/salut/salut.module.ts

import { defineModule } from "#lib/module.js";
import logger from "#lib/logger.js";

export default defineModule({
  id: "salut",
  name: "Salut",
  description: "Accueille les nouveaux membres et dit bonjour.",
  version: "1.0.0",
  author: "Vous",

  onLoad(_client, registry) {
    logger.info("Module Salut chargé");
  },

  onInstall(_client, guild) {
    logger.info(`Salut installé sur ${guild.name}`);
  },

  onUninstall(_client, guild) {
    logger.info(`Salut désinstallé de ${guild.name}`);
  },
});
```

### 2. Ajouter une commande slash

```typescript
// src/modules/salut/commands/bonjour.command.ts

import { SlashCommandBuilder } from "discord.js";
import { declareCommand } from "#lib/command.js";

export default declareCommand({
  data: new SlashCommandBuilder()
    .setName("bonjour")
    .setDescription("Dit bonjour !"),

  async execute(interaction) {
    await interaction.reply(`Bonjour, ${interaction.user.username} !`);
  },
});
```

### 3. Enregistrer la commande dans le module

```typescript
// src/modules/salut/salut.module.ts
import bonjourCommand from "./commands/bonjour.command.js";

export default defineModule({
  // ... id, nom, etc.

  onLoad(_client, registry) {
    registry.register(bonjourCommand);
    logger.info("Module Salut chargé");
  },
  // ...
});
```

### 4. Lancer et tester

Démarrez le bot (voir [Pour commencer](./getting-started)), installez le module Salut via `/modules`, puis exécutez `/bonjour`.

## API ModuleDeclaration

```typescript
interface ModuleDeclaration {
  id: string; // Identifiant unique en kebab-case
  name: string; // Nom affiché dans l'interface
  description: string; // Description affichée dans l'interface
  version: Version; // Semver "x.y.z"
  author?: string; // Nom de l'auteur (optionnel)
  intents?: GatewayIntentBits[]; // Intentions Discord Gateway
  devOnly?: boolean; // Chargé seulement en mode dev
  config?: ConfigSchema; // Schéma de configuration

  onLoad: (client: Client, registry: Registry) => void;
  onInstall: (client: Client, guild: Guild, registry: Registry) => void;
  onUninstall: (client: Client, guild: Guild, registry: Registry) => void;
}
```

### Cycles de vie

| Hook          | Quand                           | Utilisation typique                                                         |
| ------------- | ------------------------------- | --------------------------------------------------------------------------- |
| `onLoad`      | Démarrage du bot                | Enregistrer commandes, écouteurs, interactions via `registry.register()`    |
| `onInstall`   | Module activé sur un serveur    | Créer des rôles, envoyer des messages de bienvenue, initialiser des données |
| `onUninstall` | Module désactivé sur un serveur | Nettoyer les données, supprimer les rôles, effacer les configurations       |

### Gestion des intentions

Déclarez uniquement les intentions nécessaires à votre module. Les intentions requises doivent également être activées dans le Discord Developer Portal sous Bot > Privileged Gateway Intents.

```typescript
intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
],
```

## Comment fonctionne l'auto-découverte

Le chargeur de modules (`src/core/loaders/module-loader.ts`) parcourt `src/modules/` au démarrage :

1. Liste chaque sous-dossier
2. Trouve un fichier `*.module.ts` à l'intérieur
3. L'importe dynamiquement
4. Vérifie que l'export a `type: DeclarationType.Module`
5. Retourne l'objet `Module`

**Modules devOnly** (avec `devOnly: true`) sont ignorés quand `NODE_ENV` n'est pas `"development"`. Utilisez ceci pour les modules de test ou de débogage.

## Internationalisation

Les modules peuvent fournir des traductions pour leurs chaînes d'interface (nom, description, champs de configuration et messages du bot) via des fichiers de locale par module.

### Ajouter des traductions

Créez un dossier `i18n/` dans votre module avec un fichier JSON par locale :

```
src/modules/mon-module/
├── mon-module.module.ts
├── i18n/
│   ├── en.json
│   └── fr.json
└── commands/
    └── ...
```

Le chargeur de modules découvre automatiquement ces fichiers au démarrage et les enregistre dans i18next.

### Format des fichiers de traduction

Chaque fichier contient des paires clé-valeur. Le `name`, `description` et les champs de configuration du module sont automatiquement résolus depuis ces fichiers, remplaçant les valeurs par défaut TypeScript quand la locale correspondante est active :

```json
{
  "module.name": "Mon Module",
  "module.description": "Fait des choses géniales.",
  "config.monChamp.name": "Mon Champ",
  "config.monChamp.description": "Description de mon champ.",
  "salutation": "Bonjour {{name}} !"
}
```

### Utiliser les traductions dans le code

Le `ConfigProvider` injecté dans les commandes, écouteurs et interactions expose une méthode `t()` :

```typescript
async execute(interaction, config) {
  const salutation = config.t("salutation", { name: interaction.user.username });
  await interaction.reply(salutation);
}
```

Les clés sont d'abord cherchées dans le namespace du module, puis dans celui du cœur. Les libellés communs (`config.previous`, `config.next`, `modules.enable`, etc.) sont fournis par le namespace cœur — pas besoin de les redéfinir dans chaque module.

### Sélection de la locale

La locale du serveur est configurée via les paramètres du module Cœur (`/config core > locale`). Quand un fichier de locale n'existe pas pour la langue sélectionnée, le système utilise l'anglais par défaut.

## Bonnes pratiques

- **Gardez `onLoad` léger** — enregistrez les artefacts et loggez, déplacez la logique dans les services
- **Utilisez le kebab-case** pour les IDs de module et les noms de dossiers
- **Gérez les erreurs dans les hooks de cycle de vie** — utilisez try/catch dans `onInstall`/`onUninstall`
- **Organisez les fichiers** — un artefact par fichier, utilisez des sous-dossiers
- **Déclarez uniquement les intentions nécessaires** — minimisez l'utilisation des intentions privilégiées

## Prochaines étapes

- [Commandes](./commands) — Ajouter des commandes slash avec options et autocomplétion
- [Écouteurs](./listeners) — Réagir aux événements Discord
- [Interactions](./interactions) — Boutons, menus de sélection et modales
- [Configuration](./configuration) — Déclarer un schéma de configuration typé
- [Services](./services) — Organiser la logique métier
- [Base de données](./database) — Persister les données avec Prisma
