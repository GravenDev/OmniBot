# Creating a Module

A module in OmniBot is a self-contained functional unit that can be installed and uninstalled per Discord guild. Each module can contain commands, event listeners, interactions, and its own data.

## Module structure

```
src/modules/my-module/
├── my-module.module.ts          # Main module definition
├── commands/                    # Module commands
│   └── my-command.command.ts
├── listeners/                   # Event listeners
│   └── my-listener.listener.ts
├── interactions/                # Interaction handlers (buttons, etc.)
│   └── my-button.button.ts
├── services/                    # Business services
│   └── my-service.service.ts
└── models/                      # Prisma models (optional)
    └── my-model.prisma
```

## Creating a module

### 1. Define the main module file

```typescript
// src/modules/my-module/my-module.module.ts

import { GatewayIntentBits } from "discord.js";
import { defineModule } from "#lib/module.js";
import logger from "#lib/logger.js";

export default defineModule({
  id: "my-module",
  name: "My Module",
  description: "Description of my custom module.",
  version: "1.0.0",
  author: "Your Name", // Optional

  // Discord intents required by the module
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],

  // Called at bot startup
  onLoad(_client, registry) {
    // Register commands, listeners, and interactions
    // registry.register(myCommand);
    // registry.register(myListener);
    // registry.register(myInteraction);

    logger.info("My module loaded successfully");
  },

  // Called when the module is installed on a guild
  onInstall(_client, guild) {
    logger.info(`My module installed on ${guild.name}`);
  },

  // Called when the module is uninstalled from a guild
  onUninstall(_client, guild) {
    logger.info(`My module uninstalled from ${guild.name}`);
  },
});
```

### 2. Lifecycle hooks

A module exposes three hooks:

| Hook          | When                 | Usage                                      |
| ------------- | -------------------- | ------------------------------------------ |
| `onLoad`      | Bot startup          | Register commands, listeners, interactions |
| `onInstall`   | Guild installation   | Create roles, initialize data              |
| `onUninstall` | Guild uninstallation | Clean up data, remove configurations       |

### 3. ModuleDeclaration interface

```typescript
interface ModuleDeclaration {
  id: string; // Unique identifier (kebab-case)
  name: string; // Display name
  description: string; // Description
  version: string; // Semver version (e.g. "1.0.0")
  author?: string; // Author (optional)
  intents?: GatewayIntentBits[]; // Required Discord intents
  devOnly?: boolean; // Only loaded in dev mode
  config?: ConfigSchema; // Configuration schema (see Configuration)

  onLoad: (client, registry) => void;
  onInstall: (client, guild, registry) => void;
  onUninstall: (client, guild, registry) => void;
}
```

## Best practices

### Naming conventions

- **Module ID**: kebab-case (`my-super-module`)
- **File name**: `{id}.module.ts`
- **Directory**: same as module ID

### Intent management

Only declare the intents your module actually needs. See the [Discord documentation](https://discord.com/developers/docs/events/gateway#list-of-intents) for which intents are required.

### Error handling

```typescript
onInstall(_client, guild) {
  try {
    // Installation logic
  } catch (error) {
    logger.error(`Installation error: ${error.message}`);
  }
}
```

### File organization

- Keep the main module file lightweight
- Move complex logic to services
- Use subdirectories to organize commands, listeners, and interactions

## Auto-discovery

Modules are automatically loaded from `src/modules/` at startup. The loader (`module-loader.ts`):

1. Iterates over each subdirectory in `src/modules/`
2. Looks for a `*.module.ts` (or `*.module.js`) file
3. Imports the module and validates it exposes a `Module`-typed default export
4. Skips modules marked `devOnly: true` in production

No manual registration is needed.

## Next steps

- [Commands](./commands) — Add slash commands to your module
- [Listeners](./listeners) — React to Discord events
- [Interactions](./interactions) — Buttons, modals, and select menus
- [Configuration](./configuration) — Declare a configuration schema
- [Services](./services) — Organize business logic
- [Database](./database) — Use Prisma with your module
