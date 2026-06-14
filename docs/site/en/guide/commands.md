# Commands

This guide explains how to create Discord slash commands in your modules. Commands are only available when the module is enabled on the guild.

## Creating a command

```typescript
// src/modules/my-module/commands/test.command.ts

import { SlashCommandBuilder } from "discord.js";
import { declareCommand } from "#lib/command.js";

export default declareCommand({
  data: new SlashCommandBuilder()
    .setName("test")
    .setDescription("A test command"),

  async execute(interaction) {
    await interaction.reply("Test!");
  },
});
```

## Command interface

```typescript
interface Command {
  data: SlashCommandBuilder; // Command configuration
  execute: (
    // Execution function (required)
    interaction,
    config
  ) => Promise<void>;
  complete?: (
    // Autocomplete (optional)
    interaction,
    config
  ) => Promise<void>;
}
```

The `config` parameter is a `ConfigProvider` giving access to the module's configuration (see [Configuration](./configuration)).

## Registering in the module

```typescript
// src/modules/my-module/my-module.module.ts
import testCommand from "./commands/test.command.js";

export default defineModule({
  onLoad(_client, registry) {
    registry.register(testCommand);
  },
});
```

## Registration & propagation

| Commands                         | Production                                        | Development (`NODE_ENV=development`)                                 |
| -------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| **core** (`/config`, `/modules`) | Global (~1 h propagation)                         | Registered on `DEV_GUILD_ID` — **instant**                           |
| **module**                       | Per guild, (re)installed on module `version` bump | Re-synced **at every startup** on `DEV_GUILD_ID` for enabled modules |

In production, version gating prevents re-pushing module commands to all guilds on every startup. In development, all commands are registered in a single PUT on the dev guild for instant updates.

> `DEV_GUILD_ID` is **required** in development mode. See `.env.example`.
