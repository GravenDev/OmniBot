# Commands

This guide explains how to create Discord slash commands in your modules. Commands are only available when the module is enabled on the server where they're used.

## Creating a Command

::: tip
Set command names and descriptions in English by default — they act as the fallback when no translation is available for the guild's locale. In this bot, only descriptions are localized via `setDescriptionLocalizations()`; command names stay in English.
:::

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

### Command Interface

```typescript
interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandSubcommandBuilder
    | SlashCommandSubcommandGroupBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder;
  execute: (
    interaction: ChatInputCommandInteraction,
    config: ConfigProvider
  ) => Promise<void>;
  complete?: (
    interaction: AutocompleteInteraction,
    config: ConfigProvider
  ) => Promise<void>;
}
```

| Field      | Required | Description                                               |
| ---------- | -------- | --------------------------------------------------------- |
| `data`     | Yes      | The slash command definition (name, description, options) |
| `execute`  | Yes      | Called when a user runs the command                       |
| `complete` | No       | Called when a user types in an autocomplete option        |

### Config Access

The `config` parameter is a `ConfigProvider` that gives access to the module's configuration (see [Configuration](./configuration)). It's always injected — even for modules without a config schema.

> [!NOTE]
> In `complete()` (autocomplete) handlers, the injected `config` currently comes from the **Core** module rather than the command's module. This means module-specific config values are not available during autocomplete — only the Core module's config is accessible.

```typescript
async execute(interaction, config) {
  const channel = config.get("logChannel");
  const max = config.get("maxWarnings");
  // ...
}
```

## Options & Subcommands

### Basic Options

```typescript
data: new SlashCommandBuilder()
  .setName("greet")
  .setDescription("Greet someone")
  .addUserOption((option) =>
    option.setName("target").setDescription("Who to greet").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("message").setDescription("Custom message").setMaxLength(200)
  );
```

### Autocomplete

```typescript
export default declareCommand({
  data: new SlashCommandBuilder()
    .setName("color")
    .setDescription("Pick a color")
    .addStringOption((option) =>
      option
        .setName("color")
        .setDescription("Choose a color")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  async execute(interaction, config) {
    const color = interaction.options.getString("color", true);
    await interaction.reply(`You picked ${color}!`);
  },

  async complete(interaction, config) {
    const colors = ["red", "green", "blue", "yellow", "purple"];
    const input = interaction.options.getFocused().toLowerCase();
    const filtered = colors.filter((c) => c.startsWith(input));
    await interaction.respond(filtered.map((c) => ({ name: c, value: c })));
  },
});
```

### Subcommands

```typescript
const builder = new SlashCommandBuilder()
  .setName("config")
  .setDescription("Configuration commands")
  .addSubcommand((sub) =>
    sub.setName("view").setDescription("View configuration")
  )
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Set a value")
      .addStringOption((opt) =>
        opt.setName("key").setDescription("Config key").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("value").setDescription("Config value").setRequired(true)
      )
  );
```

## Registration & Propagation

### In the Module

```typescript
// src/modules/greeter/greeter.module.ts
import helloCommand from "./commands/hello.command.js";

export default defineModule({
  onLoad(_client, registry) {
    registry.register(helloCommand);
  },
});
```

### Dev vs Production

| Aspect              | Development (`NODE_ENV=development`)                          | Production                                   |
| ------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| **Core commands**   | Registered on `DEV_GUILD_ID` (instant)                        | Global (~1h propagation)                     |
| **Module commands** | Re-synced every startup on `DEV_GUILD_ID` for enabled modules | Registered per guild, only on version change |
| **Propagation**     | Instant (single PUT)                                          | Delayed (global) or on-demand (per guild)    |

The version gating system in production uses the `activatedVersion` field in the `ModuleActivation` database record. Commands are re-registered on a guild only when the module's declared version differs from the stored version. This avoids unnecessary API calls on every restart.

> `DEV_GUILD_ID` is **required** in development mode. See `.env.example`.

## Core Commands

OmniBot provides two built-in commands in the **Core** module (always active, non-uninstallable):

| Command            | Permission    | Description                                            |
| ------------------ | ------------- | ------------------------------------------------------ |
| `/modules`         | Administrator | Lists all modules with enable/disable buttons          |
| `/config <module>` | Administrator | Opens the interactive configuration panel for a module |

## Localization

Slash command descriptions can be translated per locale using Discord's built-in localization methods:

```typescript
data: new SlashCommandBuilder()
  .setName("hello")
  .setDescription("Says hello!")
  .setDescriptionLocalizations({ fr: "Dit bonjour !" }),
```

> In this bot, only descriptions are localized. Command names stay in English.

For module-specific strings in command responses, use `config.t()` to look up translations from your module's i18n files:

```typescript
async execute(interaction, config) {
  await interaction.reply(config.t("greeting", { user: interaction.user.username }));
}
```

The guild's locale is configured via the core module's `/config core > locale` setting. See [Configuration → Localization](./configuration#localization) for details on setting up translation files.

## Best Practices

- **Use reply, deferReply, or editReply** appropriately — defer for operations that take longer than 3 seconds
- **Use ephemeral replies** for user-specific responses (`flags: MessageFlags.Ephemeral`)
- **Handle errors** — wrap risky operations in try/catch and reply with a user-friendly message
- **Validate option values** — use the builder's built-in validation (min/max length, min/max value, etc.)
