# Getting Started

Welcome to OmniBot! This guide will help you set up the bot for development and understand the project.

## What is OmniBot?

OmniBot is a **modular Discord bot** developed for the [Graven - Développement](https://discord.gg/graven) community. Each feature is a self-contained **module** that is auto-discovered at startup and can be installed or uninstalled **per Discord server** via `/modules`. Modules declare their own slash commands, event listeners, interaction handlers, and a typed configuration schema edited live with `/config <module>`.

The core system wires everything together — adding a feature means creating a module, never touching the bootstrap.

### Tech Stack

| Area            | Choice                                                                               |
| --------------- | ------------------------------------------------------------------------------------ |
| Language        | TypeScript (ESM, NodeNext), Node.js 24                                               |
| Discord API     | discord.js v14                                                                       |
| Database        | PostgreSQL 17 via Prisma ORM                                                         |
| Package manager | pnpm (workspaces: bot + docs site)                                                   |
| Toolchain       | mise (tool versions), oxlint + oxfmt (lint/format), lefthook (git hooks), commitlint |
| Tests           | Vitest (unit + integration)                                                          |
| Logging         | pino                                                                                 |
| Dev runner      | pitchfork (one-command stack: DB + bot)                                              |

---

## Quick Start

### Prerequisites

- [mise](https://mise.jdx.dev/) — pins Node.js, pnpm, and pitchfork versions. Without mise, install **Node.js 24** and **pnpm** manually (check `.mise.toml` for exact versions).
- **Docker** — for the PostgreSQL 17 container.
- A **Discord bot token** — create an application in the [Discord Developer Portal](https://discord.com/developers/applications), then go to the Bot section and reset the token. Enable **Message Content Intent** if your module needs it.

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/GravenDev/OmniBot.git
cd OmniBot

# 2. Install toolchain (Node, pnpm, pitchfork)
mise install

# 3. Install dependencies and git hooks
pnpm install

# 4. Create environment file
cp .env.example .env

# 5. Fill in the .env file (see Environment section below)
```

### Run

**One-command stack (recommended):**

```bash
pitchfork start bot    # starts PostgreSQL, waits for it, then runs the bot
pitchfork logs bot     # tail logs
pitchfork stop bot db  # stop everything
```

Daemons are defined in `pitchfork.toml` — the `bot` daemon depends on `db` (Docker PostgreSQL).

**Manual setup:**

```bash
docker compose up -d    # start PostgreSQL 17
pnpm prisma:migrate     # apply database migrations (first run only)
pnpm dev                # run the bot with tsx
```

### Environment

Copy `.env.example` to `.env` and fill in the values:

| Variable        | Description                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN` | Bot token from the Discord Developer Portal                                                                                               |
| `DATABASE_URL`  | PostgreSQL connection string (default matches `compose.yaml`)                                                                             |
| `DEV_GUILD_ID`  | **Development only** — guild ID where slash commands register instantly (global commands take ~1h to propagate). Required for `pnpm dev`. |

---

## Project Structure

```
src/
├── index.ts                    # Entry point — boot sequence
├── core/                       # Framework (always loaded)
│   ├── commands/               #   /modules and /config commands
│   ├── config/                 #   Config type handlers (modal, select, toggle)
│   ├── interactions/           #   Core button handlers
│   ├── listeners/              #   Global event listeners
│   ├── loaders/                #   Module/command/listener discovery
│   ├── models/                 #   Core Prisma schemas
│   ├── services/               #   ModuleService, ConfigService
│   └── utils/                  #   Permission guard, version parser, messages
├── modules/                    # Feature modules (one folder per module)
│   ├── thread-creator/         #   Example module: automatic thread creation
│   └── test-config/            #   Dev-only: exercises every config type
├── lib/                        # Shared contracts exposed to modules
│   ├── module.ts               #   defineModule()
│   ├── command.ts              #   declareCommand()
│   ├── listener.ts             #   declareEventListener()
│   ├── interaction.ts          #   declareInteractionHandler()
│   ├── config.ts               #   ConfigType, ConfigProvider, validators
│   ├── service.ts              #   declareService()
│   ├── database.ts             #   Prisma client singleton
│   ├── logger.ts               #   Pino logger
│   └── registry.ts             #   Registry: collects commands/listeners/handlers
├── prisma/                     # Database
│   ├── dbinfo.prisma           #   Generator + datasource config
│   ├── schema.prisma           #   Consolidated schema (auto-generated)
│   └── migrations/             #   SQL migration files
├── utils/                      # Shared utilities
│   └── colors.ts               #   Embed color constants
└── generated/                  # Prisma client (auto-generated)
```

---

## Naming Conventions

Files use suffixes to identify their role:

| Suffix          | Role                                                       |
| --------------- | ---------------------------------------------------------- |
| `*.module.ts`   | Module definition (e.g. `thread-creator.module.ts`)        |
| `*.command.ts`  | Slash command (e.g. `greet.command.ts`)                    |
| `*.listener.ts` | Event listener (e.g. `message-create.listener.ts`)         |
| `*.button.ts`   | Button interaction handler                                 |
| `*.modal.ts`    | Modal submit handler                                       |
| `*.select.ts`   | Select menu handler                                        |
| `*.service.ts`  | Business service (e.g. `thread-creation-queue.service.ts`) |
| `*.prisma`      | Prisma model definition                                    |

---

## Import Conventions

Cross-directory imports use **subpath imports** with `#` prefix. Always use the `.js` extension (NodeNext resolution):

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

Same-directory imports stay relative:

```typescript
import myCommand from "./commands/my-command.command.js";
```

---

## Common Commands

```bash
pnpm dev                  # Run the bot with tsx (development)
pnpm build                # prisma:generate + tsc → dist/
pnpm test                 # Run full test suite (unit + integration)
pnpm test:unit            # Run unit tests only
pnpm test:integration     # Run integration tests only
pnpm format               # oxfmt + oxlint --fix

# Database
pnpm prisma:generate      # Consolidate schemas + generate Prisma client
pnpm prisma:migrate       # Create and apply a migration
pnpm prisma:studio        # Open Prisma Studio (GUI)

# Docs site (VitePress)
pnpm --filter omnibot-docs dev    # Start docs dev server
pnpm --filter omnibot-docs build  # Build static docs site
```

---

## Next Steps

- [Architecture](./architecture) — Understand how the bot works internally
- [Creating a Module](./creating-a-module) — Build your first module
- [Contributing](./contributing) — Learn how to contribute to the project
