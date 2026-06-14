# Getting Started

Welcome to the OmniBot development guide! This documentation explains how to create modules, commands, and listeners to extend the Discord bot's functionality.

OmniBot is a modular Discord bot where each feature is encapsulated in its own module. Modules are auto-discovered at startup — **no manual registration is needed** outside the module directory.

## Project structure

```
src/
├── modules/                 # All bot modules
│   ├── my-module/           # Module
│   │   ├── commands/        # Module commands
│   │   ├── listeners/       # Module listeners
│   │   ├── models/          # Prisma models (optional)
│   │   ├── services/        # Module services
│   │   ├── interactions/    # Interaction handlers (buttons, etc.)
│   │   └── my-module.module.ts  # Main module file
├── lib/                     # Library exposed to modules
│   ├── module.ts            # defineModule()
│   ├── command.ts           # declareCommand()
│   ├── listener.ts          # declareEventListener()
│   ├── interaction.ts       # declareInteractionHandler()
│   ├── service.ts           # declareService()
│   ├── config.ts            # ConfigType, ConfigProvider
│   ├── database.ts          # Prisma client
│   └── logger.ts            # Structured logger
├── core/                    # Bot core system
│   ├── commands/            # System commands (/modules, /config)
│   ├── loaders/             # Module/command loaders
│   └── services/            # Internal services
└── prisma/                  # Prisma configuration
    ├── dbinfo.prisma        # Generator + datasource config
    └── schema.prisma        # Consolidated schema (auto-generated)
```

## Naming conventions

The project uses suffixes to identify each file's role:

- `*.module.ts` — Module definition (e.g. `my-module.module.ts`)
- `*.command.ts` — Slash command (e.g. `test.command.ts`)
- `*.listener.ts` — Event listener (e.g. `message-create.listener.ts`)
- `*.button.ts` / `*.modal.ts` / `*.select.ts` — Interaction handlers
- `*.service.ts` — Business service (e.g. `user.service.ts`)
- `*.prisma` — Database model (e.g. `users.prisma`)

## Imports

Cross-directory imports use **subpath imports** with `#lib/...`:

```typescript
import { defineModule } from "#lib/module.js";
import { declareCommand } from "#lib/command.js";
import { declareEventListener } from "#lib/listener.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { declareService } from "#lib/service.js";
import { ConfigType } from "#lib/config.js";
import logger from "#lib/logger.js";
import prisma from "#lib/database.js";
```

Same-directory imports stay relative (`./file.js`). The `.js` extension is always required (NodeNext).

## Next steps

- [Creating a Module](./creating-a-module) — Module structure and lifecycle
- [Commands](./commands) — Creating slash commands
- [Listeners](./listeners) — Reacting to Discord events
- [Interactions](./interactions) — Buttons, select menus, and modals
- [Configuration](./configuration) — Typed configuration schema
- [Services](./services) — Business logic
- [Database](./database) — Prisma ORM
