# Database

OmniBot uses [Prisma](https://www.prisma.io/) as its ORM with a multi-file schema architecture. Database models are distributed across modules and consolidated at build time.

## Architecture

### File Layout

```
src/
├── prisma/
│   ├── dbinfo.prisma          # Generator + datasource configuration
│   └── schema.prisma          # Consolidated schema (auto-generated, do not edit)
├── core/
│   └── models/
│       ├── config.prisma      # GuildConfiguration model
│       └── modules.prisma     # ModuleActivation model
└── modules/
    └── my-module/
        └── models/
            └── my-model.prisma  # Module-specific models
```

### Base Configuration (`dbinfo.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

## Adding a Model to Your Module

### 1. Create the `.prisma` file

```
src/modules/my-module/models/my-model.prisma
```

### 2. Define your model

```prisma
model MyModel {
  id        String   @id @default(cuid())
  userId    String
  username  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 3. Generate the Prisma client

```bash
pnpm prisma:generate
```

This runs the consolidation script then `prisma generate`.

### 4. Create a migration

```bash
pnpm prisma:migrate
```

This runs consolidation then `prisma migrate dev`. It creates a new migration file in `src/prisma/migrations/`.

## Consolidation System

Instead of maintaining a single monolithic `schema.prisma`, the project distributes models across `*.prisma` files in each module. The consolidation script (`scripts/consolidate-schema.ts`) merges everything:

1. Recursively scans `src/` for `*.prisma` files (excluding `src/prisma/` itself and `src/generated/`)
2. Extracts models from each file
3. Combines them with the `dbinfo.prisma` header into `src/prisma/schema.prisma`
4. Adds comments identifying each model's source file

### Commands

```bash
pnpm prisma:consolidate   # Consolidate only (no client generation)
pnpm prisma:generate      # Consolidate + generate Prisma client
pnpm prisma:migrate       # Consolidate + create and apply migration
pnpm prisma:studio        # Consolidate + open Prisma Studio
```

> **Important**: Never edit `src/prisma/schema.prisma` directly. Always edit the module's own `*.prisma` file and run `pnpm prisma:consolidate` (or `pnpm prisma:generate`).

## Current Models

### ModuleActivation (`src/core/models/modules.prisma`)

```prisma
model ModuleActivation {
  moduleId         String
  guildId          String
  activated        Boolean
  activatedVersion String @default("")
  @@id([moduleId, guildId])
}
```

Tracks which modules are enabled on which guilds and at which version. Used by the version-gating system for command registration.

### GuildConfiguration (`src/core/models/config.prisma`)

```prisma
model GuildConfiguration {
  guildId String @id
  data    Json
}
```

Stores all module configurations as a single JSON blob per guild. The `data` field maps `moduleId → { key: serializedValue }`.

## Using Prisma in Code

```typescript
import prisma from "#lib/database.js";

// Query examples
const activations = await prisma.moduleActivation.findMany({
  where: { guildId: interaction.guildId },
});

const config = await prisma.guildConfiguration.findUnique({
  where: { guildId: "123456789" },
});

// Create
await prisma.moduleActivation.create({
  data: {
    moduleId: "my-module",
    guildId: "123456789",
    activated: true,
    activatedVersion: "1.0.0",
  },
});
```

The Prisma client is a singleton exported from `#lib/database.js`. It's initialized once at startup.

## Best Practices

- **Core models** go in `src/core/models/`
- **Module-specific models** go in `src/modules/<module>/models/`
- Use **PascalCase** for model names and **camelCase** for fields
- Keep models focused — one file per logical entity or small group
- Always run `pnpm prisma:generate` after changing any `.prisma` file
- Run `pnpm prisma:migrate` in development to create and apply migrations

## Next Steps

- [Services](./services) for organizing database operations
- [Configuration](./configuration) for the generic config system
