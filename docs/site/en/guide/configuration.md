# Configuration

OmniBot provides a typed configuration system for modules. Each module can declare a configuration schema that is automatically exposed through an interactive Discord interface, accessible to administrators via `/config <module>`.

## Declaring a Schema

A module declares its schema in `defineModule()` via the `config` property:

::: tip
Config field `name` and `description` must be in English in the TypeScript schema — they serve as the fallback when no translation file matches the guild's locale. No need to duplicate them in `en.json`. Add translations in `i18n/` files for other locales.
:::

```typescript
// src/modules/my-module/my-module.module.ts

import { ConfigType } from "#lib/config.js";
import { defineModule } from "#lib/module.js";

export default defineModule({
  id: "my-module",
  name: "My Module",
  description: "Description of my module.",
  version: "1.0.0",

  config: {
    logChannel: {
      name: "Log channel",
      description: "Channel where to post logs",
      type: ConfigType.CHANNEL,
    },
    maxWarnings: {
      name: "Max warnings",
      description: "Number of warnings before action",
      type: ConfigType.NUMBER,
      defaultValue: 3,
    },
    logLevel: {
      name: "Log level",
      description: "Log verbosity",
      type: ConfigType.ENUM,
      options: ["debug", "info", "warn", "error"] as const,
      defaultValue: "info",
    },
  },

  onLoad(_client, registry) {
    // ...
  },
});
```

## Field Types

### Supported Types

| Type       | Input                       | Storage (JSON)    | Read (deserialized) |
| ---------- | --------------------------- | ----------------- | ------------------- |
| `STRING`   | Modal (text input)          | `string`          | `string`            |
| `NUMBER`   | Modal (text → number)       | `number`          | `number`            |
| `BOOLEAN`  | Toggle button               | `boolean`         | `boolean`           |
| `USER`     | User select menu            | `string` (id)     | `User`              |
| `ROLE`     | Role select menu            | `string` (id)     | `Role`              |
| `CHANNEL`  | Channel select menu         | `string` (id)     | `Channel`           |
| `CATEGORY` | Category select menu        | `string` (id)     | `CategoryChannel`   |
| `ENUM`     | Select menu (fixed choices) | `string` (choice) | Literal union       |

### Lists

Any type can be declared as a **list** using `type: [ConfigType.X]`:

```typescript
config: {
  channels: {
    name: "Monitored channels",
    description: "Channels to monitor",
    type: [ConfigType.CHANNEL],    // List of channels
  },
  scores: {
    name: "Scores",
    description: "High scores list",
    type: [ConfigType.NUMBER],     // List of numbers
  },
}
```

List editing depends on the element type:

- **Entities** (`USER`, `ROLE`, `CHANNEL`, `CATEGORY`): native multi-select menus
- **ENUM**: multi-select menu with the declared options
- **Scalars** (`STRING`, `NUMBER`): dedicated add/remove editor
- **`BOOLEAN`**: add/remove editor with toggle buttons

### ENUM Type (Fixed Choices)

The `ENUM` type restricts a field to a fixed set of values:

```typescript
config: {
  theme: {
    name: "Theme",
    description: "Display theme",
    type: ConfigType.ENUM,
    options: ["light", "dark", "auto"] as const,
    defaultValue: "auto",
  },
  features: {
    name: "Features",
    description: "Enabled features",
    type: [ConfigType.ENUM],
    options: ["welcome", "logs", "automod"] as const,
  },
}
```

- `options` is **required** on `ENUM` entries (enforced by the type system)
- Using `as const` gives precise typing: `config.get("theme")` returns `"light" | "dark" | "auto"`
- Without `as const`, the returned type is `string`

## Default Values

- A field **with** `defaultValue` is always present — the type is `T` (never `undefined`)
- A field **without** `defaultValue` may be `T | undefined` (never set by the admin)
- Entity fields without defaults return `undefined` (not a fake value)

This is an important distinction — always check for `undefined` when accessing fields without defaults.

## Accessing Configuration

The `config` parameter is passed automatically to commands, listeners, and interactions:

```typescript
async function handler(interaction, config) {
  const channel = config.get("logChannel"); // Channel | undefined
  const max = config.get("maxWarnings"); // number (always present)
  const level = config.get("logLevel"); // "debug" | "info" | "warn" | "error"

  // Use with default
  const safe = config.get("logChannel") ?? someDefaultChannel;
}
```

## Admin Interface

### `/config <module>` Command

- **Admin only** (`Administrator` permission required)
- **Public response** — configuration is visible to everyone (transparency)
- **Autocomplete** on module name (core + enabled modules)

The panel displays:

- All configurable fields with their type, description, and current value
- Edit buttons adapted to each type (button toggle, modal, select menu)
- Pagination when there are more than 10 fields (Discord's 40-component limit)

### Editing Flow

| Field Type                            | Editor Type                    | Persistence | UI Update                       |
| ------------------------------------- | ------------------------------ | ----------- | ------------------------------- |
| `STRING`                              | Modal (text input)             | On submit   | Public message updated in place |
| `NUMBER`                              | Modal (number input)           | On submit   | Public message updated in place |
| `BOOLEAN`                             | Toggle button                  | On click    | Public message updated in place |
| `USER`, `ROLE`, `CHANNEL`, `CATEGORY` | Entity select menu (ephemeral) | On select   | Public message refreshed        |
| `ENUM`                                | String select menu (ephemeral) | On select   | Public message refreshed        |
| List of scalars                       | Add/remove editor (ephemeral)  | On action   | Public message refreshed        |

**Ephemeral editors** (select menus, list editors) refresh the public config message after each change using `refreshSourceConfigMessage()`. The source message ID is threaded through the `customId` of the ephemeral components.

## Persistence

Configuration is stored as a single JSON blob per guild in the `GuildConfiguration` table:

```prisma
model GuildConfiguration {
  guildId String @id
  data    Json   // Record<moduleId, { key: value }>
}
```

- Entity IDs (user, role, channel) are stored as strings and **deserialized** to Discord objects at read time
- An in-memory cache (`configCache`) avoids database reads on every interaction
- The cache is invalidated on every write

## Localization

Config field names and descriptions can be translated per guild locale via i18n files. The system resolves localized values automatically based on the guild's configured locale (`/config core > locale`).

### Module-level translations

Create an `i18n/` directory in your module with one JSON file per locale:

```json
// i18n/en.json
{
  "config.myField.name": "My Field",
  "config.myField.description": "Description of my field."
}

// i18n/fr.json
{
  "config.myField.name": "Mon champ",
  "config.myField.description": "Description de mon champ."
}
```

The field's `name` and `description` in the TypeScript schema serve as English defaults — there's no need to duplicate them in `en.json`.

### Using config.t() for messages

The `ConfigProvider` injected into commands, listeners, and interactions exposes a `t()` method for localized strings anywhere in your module:

```typescript
async execute(interaction, config) {
  const message = config.t("welcomeMessage", { user: interaction.user.username });
  await interaction.reply(message);
}
```

### Namespace fallback

Keys are resolved in this order:

1. Your module's namespace (e.g. `thread-creator:welcomeMessage`)
2. The core namespace (`core:welcomeMessage`)

This means common UI strings like `config.previous`, `config.next`, `config.toggle.enable`, and type names (`type.text`, `type.number`, etc.) are provided by the core namespace — you only need to translate module-specific strings.

## Best Practices

- **Use camelCase for keys**, human-readable `name` and clear `description`
- **Provide `defaultValue`** for fields that should always have a value
- **Keep schemas focused** — too many fields makes the admin panel unwieldy
- **Use `as const`** on ENUM options for type-safe literal unions
- **Check for `undefined`** when accessing fields without defaults

## Next Steps

- [Services](./services) for organizing business logic
- [Database](./database) for advanced persistent data
- [Commands](./commands) for creating slash commands
