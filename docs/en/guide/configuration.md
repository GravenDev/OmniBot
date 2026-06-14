# Configuration

OmniBot provides a typed configuration system for modules. Each module can declare a configuration schema that is automatically exposed through an interactive Discord interface accessible to administrators.

## Declaring a configuration schema

A module declares its schema in `defineModule()` via the `config` property:

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

## Supported field types

| Type       | Input                 | Storage (JSON)    | Read              |
| ---------- | --------------------- | ----------------- | ----------------- |
| `STRING`   | Modal (text)          | `string`          | `string`          |
| `NUMBER`   | Modal (text → number) | `number`          | `number`          |
| `BOOLEAN`  | Toggle button         | `boolean`         | `boolean`         |
| `USER`     | User select menu      | `string` (id)     | `User`            |
| `ROLE`     | Role select menu      | `string` (id)     | `Role`            |
| `CHANNEL`  | Channel select menu   | `string` (id)     | `Channel`         |
| `CATEGORY` | Category select menu  | `string` (id)     | `CategoryChannel` |
| `ENUM`     | Select menu (choices) | `string` (choice) | Literal union     |

## Lists

Any type can be declared as a **list** using `type: [ConfigType.X]`:

```typescript
config: {
  channels: {
    name: "Monitored channels",
    description: "Channels to monitor (one or more)",
    type: [ConfigType.CHANNEL],    // Channel list
  },
  warnings: {
    name: "Warnings",
    description: "List of warnings",
    type: [ConfigType.NUMBER],     // Number list
  },
}
```

The returned type of `config.get("channels")` is `Channel[]`.

## ENUM type (fixed choices)

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
    type: [ConfigType.ENUM],        // Multi-select list
    options: ["welcome", "logs", "automod"] as const,
  },
}
```

- `options` is **required** on an `ENUM` entry
- Using `as const` gives precise typing: `config.get("theme")` returns `"light" | "dark" | "auto"`
- Without `as const`, the returned type is `string`

## Default values

- A field **with** `defaultValue` is always present (`T`)
- A field **without** `defaultValue` may be `undefined` (`T | undefined`)
- Discord entities are automatically deserialized (stored as id, read as Discord objects)

## Accessing configuration

Configuration is accessible via the `config` parameter in commands, listeners, and interactions:

```typescript
// In a command
async execute(interaction, config) {
  const channel = config.get("logChannel");   // Channel | undefined
  const max = config.get("maxWarnings");      // number (has defaultValue)
  const level = config.get("logLevel");       // "debug" | "info" | "warn" | "error"
}
```

## Admin interface

The `/config <module>` command (admin-only) displays an interactive configuration panel featuring:

- All configurable fields with their type and current value
- Edit buttons adapted to each type (modal, toggle, select menu)
- Automatic pagination if the module has more than 10 fields
- Navigation bar when multiple pages

Changes are persisted and take effect immediately.

## Best practices

### Field naming

- **Key**: camelCase (`logChannel`, `maxWarnings`)
- **name**: human-readable, shown in the UI (`Log channel`)
- **description**: explains the field's purpose

### Validation

Validation is automatic based on the declared type. For `ENUM`, only values listed in `options` are accepted.

## Next steps

- [Services](./services) for organizing business logic
- [Database](./database) for advanced persistent data
