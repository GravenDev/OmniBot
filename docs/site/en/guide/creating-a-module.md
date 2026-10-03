# Creating a Module

A module in OmniBot is a self-contained functional unit that can be installed and uninstalled per Discord server. Each module can contain commands, event listeners, interaction handlers, services, configuration, and database models.

## Scaffolding a Module

Don't start from scratch. Generate a working module skeleton (definition, config schema, one command, one listener, `i18n/en+fr.json`, a commented Prisma model, and a test):

```bash
pnpm new-module my-module "My Module"
```

The generated module compiles and its test passes unmodified. Fill the `TODO` description, then enable it via `/modules` on your dev guild. No registration step exists: modules are auto-discovered from `src/modules/` at startup.

For tests, use the shared helpers from `#lib/testing.js` (`makeTestConfig`, `fakeGuild`, `fakeMessage`, `initTestI18n`) instead of hand-rolled mocks. Note that `vi.mock("#core/runtime.js")` and `vi.mock("#lib/database.js")` must still be declared per test file — Vitest hoists them, so no helper can hide them.

## Module Structure

```
src/modules/my-module/
├── my-module.module.ts          # Main module definition
├── i18n/                        # Translation files
│   ├── en.json
│   └── fr.json
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

::: tip
The module's `name` and `description` should be in English by default. They serve as the fallback when no translation file matches the guild's locale. Add translations in `i18n/` files for other locales.
:::

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
  partials?: Partials[]; // discord.js partials, e.g. events on uncached messages
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

## Internationalization

Modules can provide translations for their interface strings (name, description, config fields, and bot messages) using per-module locale files.

### Adding translations

Create an `i18n/` directory in your module with one JSON file per locale:

```
src/modules/my-module/
├── my-module.module.ts
├── i18n/
│   ├── en.json
│   └── fr.json
└── commands/
    └── ...
```

The module loader auto-discovers these files at startup and registers them with i18next.

### Translation file format

Each file contains key-value pairs. Config field `name`/`description` are automatically resolved from these files, overriding the TypeScript defaults when a matching locale is active. The module's own `name` and `description` are translated in the core files instead, under `modules.<id>.name` and `modules.<id>.description` (see the localization guide):

```json
{
  "config.myField.name": "My Field",
  "config.myField.description": "Description of my field.",
  "greeting": "Hello {{name}}!"
}
```

### Using translations in code

The `ConfigProvider` exposed to commands, listeners, and interactions provides a `t()` method:

```typescript
async execute(interaction, config) {
  const greeting = config.t("greeting", { name: interaction.user.username });
  await interaction.reply(greeting);
}
```

Keys are looked up in the module's own namespace first, then fall back to core translations. Common UI labels (`config.previous`, `config.next`, `modules.enable`, etc.) are provided by the core namespace — no need to redefine them in every module.

### Locale selection

The guild's locale is configured via the core module's settings (`/config core > locale`). When a locale file doesn't exist for the selected language, the system falls back to English.

## Publishing Checklist

Before your module reaches production guilds:

- **Bump `version`** when you add, rename, or change a command — production re-registers guild commands only on a version change (dev re-syncs every boot, so this is easy to miss locally)
- **Set `DEV_GUILD_ID`** in `.env` — without it, dev mode registers no commands at all
- **Prefix command names and `customId`s** with your module id — both are matched first-come-first-served across all modules, and a `:` inside an argument shifts `customId` parsing
- **Guard listeners with `if (!config) return`** — listeners run with `undefined` config outside guilds (DMs)
- **Put `requiresAdmin: true`** on every sensitive command and interaction handler — fail-open otherwise
- **Never put an object in an entity `defaultValue`** (`USER`/`ROLE`/`CHANNEL`/`CATEGORY` defaults must stay unset; ids are stored, objects are hydrated)
- **Declare `ENUM` `options` `as const`** for literal-union typing of `config.get()`
- **Prisma order**: write `models/*.prisma`, then `pnpm prisma:generate`, then `pnpm prisma:migrate` — and keep model names unique across all modules
- **No top-level side effects** — `devOnly` modules are still imported in production; only their registration is skipped

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
