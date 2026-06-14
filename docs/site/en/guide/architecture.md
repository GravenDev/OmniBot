# Architecture

This page explains how OmniBot works under the hood. Understanding this will help you create better modules and debug issues.

## Boot Sequence

When the bot starts (`src/index.ts`), it follows this sequence:

```
1. Database health check
   └─ prisma.$queryRaw`SELECT 1`
   └─ exits with error if DB is unavailable

2. Module discovery
   └─ loadModules("./modules")
   └─ scans each subdirectory in src/modules/
   └─ imports the *.module.ts file
   └─ skips devOnly modules in production

3. Intent aggregation
   └─ collects GatewayIntentBits from all modules
   └─ creates the Discord Client with the union of all intents

4. ClientReady handler (async)
   ├─ For each module:
   │   ├─ module.onLoad(client, registry)
   │   └─ loadModuleEvents(client, module)
   ├─ coreModule.onLoad(client, coreModule.registry)
   ├─ syncCommands(client, modules)
   │   ├─ Dev mode: bulk PUT on DEV_GUILD_ID
   │   └─ Prod mode: version-gated guild commands + global core commands
   └─ loadGlobalEvents(client)

5. Login
   └─ client.login(token)

6. Shutdown handlers
   └─ SIGTERM / SIGINT → client.destroy() + prisma.$disconnect()
```

## Module Auto-Discovery

Modules are **not registered manually**. The loader (`src/core/loaders/module-loader.ts`) discovers them automatically:

1. Lists all subdirectories in `src/modules/`
2. For each directory, finds a file matching `*.module.ts` (or `*.module.js`)
3. Dynamically imports the module
4. Validates that it has `type: DeclarationType.Module`
5. Returns a `Module` object with its `Registry`

This means adding a new module is as simple as creating a folder with a `*.module.ts` file. No configuration file to edit, no imports to add.

## Registry & Declared Pattern

Each module has its own **Registry** instance (`src/lib/registry.ts`) that collects three kinds of artifacts:

- `commands: Declared<Command>[]`
- `listeners: Declared<EventListener>[]`
- `interactionHandlers: Declared<InteractionHandler>[]`

The `register()` method uses a discriminated union — it checks `handler.type` (from the `DeclarationType` enum) and pushes into the correct array.

Every dynamically imported file (command, listener, interaction) is wrapped with a `declare*()` function that tags it with its `DeclarationType`. This allows the loaders to identify what kind of artifact they're dealing with without naming conventions or configuration.

```typescript
// The declared pattern
export enum DeclarationType {
  Module = "module",
  Command = "command",
  Listener = "listener",
  Interaction = "interaction",
  Service = "service",
}
```

## Centralized Interaction Dispatch

A single `interactionCreate` listener (`src/core/listeners/interaction-create.listener.ts`) handles all user interactions:

```
interactionCreate
├─ isChatInputCommand()
│   ├─ find command by name across all modules
│   ├─ check module activation state (DB)
│   ├─ load config (ConfigProvider)
│   └─ execute(interaction, config)
├─ isAutocomplete()
│   ├─ find command
│   ├─ check activation
│   └─ complete(interaction, config)
├─ isMessageComponent() or isModalSubmit()
│   ├─ split customId on ":" → prefix + args
│   ├─ find handler by prefix
│   ├─ check module activation
│   ├─ if requiresAdmin → check Administrator permission
│   ├─ run type guard (check())
│   └─ execute(interaction, args, config)
```

This centralised approach means:

- **Permissions** are checked in one place (the `requiresAdmin` flag on `InteractionHandler`)
- **Module activation** is verified automatically
- **Config injection** happens transparently

## Command Propagation

### Development Mode

When `NODE_ENV=development`, all commands (core + enabled modules) are registered in a **single PUT** on `DEV_GUILD_ID`. This is **instant** — no propagation delay. Every bot restart re-syncs all commands.

### Production Mode

- **Core commands** (`/modules`, `/config`): registered **globally** (~1 hour propagation).
- **Module commands**: registered **per guild**. To avoid re-registering on every startup, the system uses **version gating**: it compares the module's declared version with the `activatedVersion` stored in the database. Commands are only re-registered on guilds where the version differs.

## Config System Overview

The configuration system has several layers:

1. **Schema declaration** — Modules declare typed schemas in `defineModule({ config: {...} })`
2. **Storage** — All configs are stored as a single JSON blob per guild in the `GuildConfiguration` table
3. **Cache** — `ConfigService` holds an in-memory cache (`configCache`) to avoid DB reads on every interaction
4. **Deserialization** — Entity IDs (user, role, channel) are stored as strings and resolved to Discord objects at read time
5. **Admin UI** — `/config <module>` renders an interactive panel with per-field edit controls

## Service Layer

Unlike modules, **services are not auto-discovered**. They are plain TypeScript classes or objects tagged with `declareService()`. You import them directly where needed:

```typescript
import queue from "../services/thread-creation-queue.js";
```

This keeps the service layer simple and dependency-free.

## Listener Auto-Activation

When a module listener is registered, the loader wraps it with logic that:

1. Extracts the `guildId` from the event arguments
2. Looks up the module's activation state in the database
3. If disabled → silently returns (no-op)
4. If enabled → fetches the config and calls `execute()` with the config as the last argument

For events that can occur outside a guild (e.g., DMs), the listener must handle activation checks manually — there's no guild context to look up.
