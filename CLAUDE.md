# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev                  # run with hot-reload (tsx watch)
pnpm build                # prisma:generate + tsc
pnpm format               # oxfmt + oxlint --fix

pnpm prisma:consolidate   # merge *.prisma module files → src/prisma/schema.prisma
pnpm prisma:generate      # generate Prisma client (required before build)
pnpm prisma:migrate       # create and apply a migration
pnpm prisma:studio        # open Prisma Studio
```

Run the whole stack in one command with [pitchfork](https://github.com/jdx/pitchfork) (pinned in `mise.toml`, so `mise install` provides it):

```bash
pitchfork start bot       # starts the db daemon (docker compose, PostgreSQL 17), waits until it accepts connections, then runs the bot (pnpm dev)
pitchfork logs bot        # tail the bot logs (pitchfork tui for a dashboard)
pitchfork stop bot db     # stop the bot and the database
```

Daemons are defined in `pitchfork.toml` (`bot` depends on `db`). Requires Docker running and a `.env` file (the bot's dev script reads it). To start the database alone instead: `docker compose up -d` (PostgreSQL 17).

## Architecture

OmniBot is a modular Discord bot. The core loads modules dynamically — **no registration needed outside the module directory**, modules are auto-discovered at startup. Each module is a self-contained plugin installed/uninstalled per guild.

See [`docs/`](docs/README.md) for the full developer guide:

| Topic                      | Doc                                          |
| -------------------------- | -------------------------------------------- |
| Creating a module          | [docs/modules.md](docs/modules.md)           |
| Slash commands             | [docs/commands.md](docs/commands.md)         |
| Event listeners            | [docs/listeners.md](docs/listeners.md)       |
| Buttons / modals / selects | [docs/interactions.md](docs/interactions.md) |
| Services                   | [docs/services.md](docs/services.md)         |
| Prisma multi-file schema   | [docs/prisma.md](docs/prisma.md)             |
| Functional behavior        | [docs/functional.md](docs/functional.md)     |

## Key rules

- Never edit `src/prisma/schema.prisma` directly — edit the module's own `*.prisma` file and run `pnpm prisma:consolidate`.
- Run `pnpm prisma:generate` before building after any schema change.

## Environment

Copy `.env.example` to `.env`:

- `DISCORD_TOKEN` — bot token from Discord Developer Portal
- `DATABASE_URL` — PostgreSQL connection string (default matches `compose.yml`)
