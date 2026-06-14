# AGENTS.md

Guidance for AI coding agents working in this repository (also a quick
orientation for humans).

## Commands

```bash
pnpm dev                  # run the bot with tsx
pnpm build                # prisma:generate + tsc
pnpm format               # oxfmt + oxlint --fix

pnpm prisma:consolidate   # merge *.prisma module files → src/prisma/schema.prisma
pnpm prisma:generate      # generate Prisma client (required before build)
pnpm prisma:migrate       # create and apply a migration
pnpm prisma:studio        # open Prisma Studio

# Documentation (in docs/)
pnpm --filter omnibot-docs dev    # start VitePress dev server
pnpm --filter omnibot-docs build  # build static site
```

Run the whole stack in one command with [pitchfork](https://github.com/jdx/pitchfork) (pinned in `.mise.toml`, so `mise install` provides it):

```bash
pitchfork start bot       # starts the db daemon (docker compose, PostgreSQL 17), waits until it accepts connections, then runs the bot (pnpm dev)
pitchfork logs bot        # tail the bot logs (pitchfork tui for a dashboard)
pitchfork stop bot db     # stop the bot and the database
```

Daemons are defined in `pitchfork.toml` (`bot` depends on `db`). Requires Docker running and a `.env` file (the bot's dev script reads it). To start the database alone instead: `docker compose up -d` (PostgreSQL 17).

## Architecture

OmniBot is a modular Discord bot. The core loads modules dynamically — **no registration needed outside the module directory**, modules are auto-discovered at startup. Each module is a self-contained plugin installed/uninstalled per guild.

See [`docs/site/`](docs/site/README.md) for the full developer guide:

| Topic                      | Doc                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Creating a module          | [docs/site/en/guide/creating-a-module.md](docs/site/en/guide/creating-a-module.md) |
| Slash commands             | [docs/site/en/guide/commands.md](docs/site/en/guide/commands.md)                   |
| Event listeners            | [docs/site/en/guide/listeners.md](docs/site/en/guide/listeners.md)                 |
| Buttons / modals / selects | [docs/site/en/guide/interactions.md](docs/site/en/guide/interactions.md)           |
| Services                   | [docs/site/en/guide/services.md](docs/site/en/guide/services.md)                   |
| Prisma / database          | [docs/site/en/guide/database.md](docs/site/en/guide/database.md)                   |
| Functional behavior        | [docs/functional.md](docs/functional.md)                                           |

The docs are also published as a VitePress site (sources in `docs/site/`) — run `pnpm --filter omnibot-docs dev` to preview.

## Key rules

- Never edit `src/prisma/schema.prisma` directly — edit the module's own `*.prisma` file and run `pnpm prisma:consolidate`.
- Run `pnpm prisma:generate` before building after any schema change.
- Import across directories with `#…` subpath imports (e.g. `#lib/config.js`, `#core/…`), not deep relative paths (`../../…`); keep same-directory imports relative (`./x.js`). Always keep the `.js` extension (NodeNext).

## Environment

Copy `.env.example` to `.env`:

- `DISCORD_TOKEN` — bot token from Discord Developer Portal
- `DATABASE_URL` — PostgreSQL connection string (default matches `compose.yaml`)
