# Database

OmniBot uses Prisma as its ORM with a multi-file architecture that distributes database models across different modules.

## Architecture

### Prisma file structure

```
src/
├── prisma/
│   ├── dbinfo.prisma          # Generator and datasource configuration
│   └── schema.prisma          # Consolidated schema (generated)
├── core/
│   └── models/
│       └── modules.prisma     # Core module system models
└── modules/
    └── [module-name]/
        └── models/
            └── *.prisma       # Module-specific models
```

### Configuration

The `dbinfo.prisma` file contains the base configuration:

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

## Adding a model to your module

1. Create a `.prisma` file in your module's `models/` directory:

```
src/modules/my-module/models/my-model.prisma
```

2. Define your model:

```prisma
model MyModel {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
}
```

3. Generate the Prisma client:

```bash
pnpm prisma:generate
```

4. Create a migration:

```bash
pnpm prisma:migrate
```

## Consolidation system

Instead of keeping all models in a single `schema.prisma` file, the project distributes models across `.prisma` files in different modules. A consolidation script (`scripts/consolidate-schema.ts`) automatically merges all these files with the `dbinfo.prisma` header into the main schema.

The script:

1. Recursively scans all directories in `src/` for `.prisma` files (except `src/prisma/`)
2. Combines the header and all models into a single `schema.prisma`
3. Adds comments identifying each model's source

### npm scripts

```bash
pnpm prisma:consolidate   # Consolidate models only
pnpm prisma:generate      # Consolidate + generate Prisma client
pnpm prisma:migrate       # Consolidate + create/apply migration
pnpm prisma:studio        # Consolidate + open Prisma Studio
```

## Usage in code

```typescript
import prisma from "#lib/database.js";

// In a service or command
const users = await prisma.user.findMany();
const newUser = await prisma.user.create({
  data: { userId: "123", username: "test" },
});
```

## Best practices

- **Core models**: `src/core/models/`
- **Module-specific models**: `src/modules/[module-name]/models/`
- **File naming**: `descriptive-name.prisma`
- **Model naming**: PascalCase (`ModuleActivation`)
- **Field naming**: camelCase (`moduleId`)
- Keep few models per file for easier maintenance

## Environment variables

```ini
DATABASE_URL="postgresql://username:password@localhost:5432/omnibot"
```

## Useful resources

- [Prisma Documentation](https://www.prisma.io/docs/)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
