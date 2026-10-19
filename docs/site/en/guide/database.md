# Database

OmniBot uses [Prisma](https://www.prisma.io/) as its ORM with Prisma's multi-file schema. Database models live in each module, next to its code, and Prisma reads them all from `src/`.

## Architecture

### File Layout

```
src/
├── prisma/
│   ├── dbinfo.prisma          # Generator + datasource configuration
│   └── migrations/            # SQL migration history
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
  provider            = "prisma-client"
  output              = "../generated/prisma"
  runtime             = "nodejs"
  moduleFormat        = "esm"
  importFileExtension = "js"
}

datasource db {
  provider = "postgresql"
}
```

The schema holds no connection URL. The Prisma CLI reads `DATABASE_URL` through `prisma.config.ts` (which loads `.env` when there is one), and the bot connects through the node-postgres driver adapter in `src/lib/database.ts`.

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

This runs `prisma generate`.

### 4. Create a migration

```bash
pnpm prisma:migrate
```

This runs `prisma migrate dev`, which creates a new migration file in `src/prisma/migrations/`, then regenerates the client: since Prisma 7, `migrate dev` no longer does it.

## Multi-file Schema

`prisma.config.ts` points Prisma at `src/`: every `*.prisma` file below it, at any depth, is part of one schema. There is no merge step and no generated schema file — edit the module's own `*.prisma` file and run the commands below.

- Model names are shared by every module: two modules cannot both declare `model Score`. Prisma reports the clash with the file at fault.
- Any `*.prisma` file under `src/` is picked up, test fixtures included: keep such files out of `src/`.
- The migrations stay in `src/prisma/migrations/`, beside `dbinfo.prisma` (`migrations.path` in `prisma.config.ts`).

### Commands

```bash
pnpm prisma:generate      # Generate the Prisma client
pnpm prisma:migrate       # Create and apply a migration, then regenerate the client
pnpm prisma:studio        # Open Prisma Studio
```

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

The Prisma client is a singleton exported from `#lib/database.js`. It's initialized once at startup and goes through `@prisma/adapter-pg`, so the connection pool is node-postgres's (10 connections).

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
