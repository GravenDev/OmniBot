# Creating a Module

A module in OmniBot is a self-contained functional unit that can be installed and uninstalled per Discord server. Each module can contain commands, event listeners, interaction handlers, services, configuration, and database models.

## Module Structure

```
src/modules/my-module/
├── my-module.module.ts          # Main module definition
├── commands/                    # Slash commands
│   └── greet.command.ts
├── listeners/                   # Event listeners
│   └── message-create.listener.ts
├── interactions/                # Button, modal, select handlers
│   ├── confirm.button.ts
│   └── feedback.modal.ts
├── services/                    # Business logic
│   └── my-service.service.ts
└── models/                      # Prisma schemas (optional)
    └── my-model.prisma
```

## Step-by-Step: Creating a "Greeter" Module

### 1. Create the directory and main file

```typescript
// src/modules/greeter/greeter.module.ts

import { defineModule } from "#lib/module.js";
import logger from "#lib/logger.js";

export default defineModule({
  id: "greeter",
  name: "Greeter",
  description: "Welcomes new members and says hello.",
  version: "1.0.0",
  author: "You",

  onLoad(_client, registry) {
    logger.info("Greeter module loaded");
  },

  onInstall(_client, guild) {
    logger.info(`Greeter installed on ${guild.name}`);
  },

  onUninstall(_client, guild) {
    logger.info(`Greeter uninstalled from ${guild.name}`);
  },
});
```

### 2. Add a slash command

```typescript
// src/modules/greeter/commands/hello.command.ts

import { SlashCommandBuilder } from "discord.js";
import { declareCommand } from "#lib/command.js";

export default declareCommand({
  data: new SlashCommandBuilder()
    .setName("hello")
    .setDescription("Says hello!"),

  async execute(interaction) {
    await interaction.reply(`Hello, ${interaction.user.username}!`);
  },
});
```

### 3. Register the command in the module

```typescript
// src/modules/greeter/greeter.module.ts
import helloCommand from "./commands/hello.command.js";

export default defineModule({
  // ... id, name, etc.

  onLoad(_client, registry) {
    registry.register(helloCommand);
    logger.info("Greeter module loaded");
  },
  // ...
});
```

### 4. Run and test

Start the bot (see [Getting Started](./getting-started)), install the Greeter module via `/modules`, then run `/hello`.

## ModuleDeclaration API

```typescript
interface ModuleDeclaration {
  id: string; // Unique kebab-case identifier
  name: string; // Display name shown in UI
  description: string; // Description shown in UI
  version: Version; // Semver "x.y.z"
  author?: string; // Optional author name
  intents?: GatewayIntentBits[]; // Discord gateway intents
  devOnly?: boolean; // Only loaded in dev mode
  config?: ConfigSchema; // Configuration schema

  onLoad: (client: Client, registry: Registry) => void;
  onInstall: (client: Client, guild: Guild, registry: Registry) => void;
  onUninstall: (client: Client, guild: Guild, registry: Registry) => void;
}
```

### Lifecycle Hooks

| Hook          | When                       | Typical Use                                                          |
| ------------- | -------------------------- | -------------------------------------------------------------------- |
| `onLoad`      | Bot startup                | Register commands, listeners, interactions via `registry.register()` |
| `onInstall`   | Module enabled on a guild  | Create roles, send welcome messages, initialize data                 |
| `onUninstall` | Module disabled on a guild | Clean up data, remove roles, delete configurations                   |

### Intent Management

Only declare the intents your module actually needs. Required intents must also be enabled in the Discord Developer Portal under Bot > Privileged Gateway Intents.

```typescript
intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
],
```

## How Auto-Discovery Works

The module loader (`src/core/loaders/module-loader.ts`) scans `src/modules/` at startup:

1. Lists each subdirectory
2. Finds a `*.module.ts` file inside
3. Imports it dynamically
4. Checks the export has `type: DeclarationType.Module`
5. Returns the `Module` object

**Dev-only modules** (with `devOnly: true`) are skipped when `NODE_ENV` is not `"development"`. Use this for test or debug modules.

## Best Practices

- **Keep `onLoad` lean** — register artifacts and log, move logic to services
- **Use kebab-case** for module IDs and folder names
- **Handle errors in lifecycle hooks** — use try/catch in `onInstall`/`onUninstall`
- **Keep files organized** — one artifact per file, use subdirectories
- **Declare only needed intents** — minimize privileged intent usage

## Next Steps

- [Commands](./commands) — Add slash commands with options and autocomplete
- [Listeners](./listeners) — React to Discord events
- [Interactions](./interactions) — Buttons, select menus, and modals
- [Configuration](./configuration) — Declare a typed configuration schema
- [Services](./services) — Organize business logic
- [Database](./database) — Persist data with Prisma
