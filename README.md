<h3 align="center">
  <img src="https://avatars.githubusercontent.com/u/78621926?s=200&v=4" width="75"><br/>
  Async - Community<br/>
  This project is under the <a href="https://choosealicense.com/licenses/gpl-3.0/">GNU GPL v3</a> license<br/><br/>
</h3>

# <p align="center">`OmniBot`</p>

All the projects in the <code>AsyncCommunityDiscord</code> organisation are used by the discord server <code>discord.gg/graven</code> both by the moderators and the members.
Most of the contributors are part of the staff but the members are also allowed to contribute.

<p align="center">
  <img src="https://img.shields.io/badge/State-In_development-orange?style=for-the-badge">
  <img src="https://img.shields.io/github/issues/AsyncCommunityDiscord/OmniBot?style=for-the-badge">
  <img src="https://img.shields.io/github/issues-pr/AsyncCommunityDiscord/OmniBot?style=for-the-badge">
</p>

---

## What is OmniBot?

OmniBot is a **modular** Discord bot: each feature is a self-contained **module**
that is auto-discovered at startup and can be installed/uninstalled **per Discord
server** via `/modules`. Modules declare their own slash commands, event
listeners, interaction handlers and a typed configuration schema (edited live
with `/config <module>`) — the core wires everything together, so adding a
feature never means touching the bootstrap.

## Tech stack

| Area        | Choice                                                                                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language    | TypeScript (ESM, `NodeNext`), Node.js 24                                                                                                                                    |
| Discord     | [discord.js](https://discord.js.org/) v14                                                                                                                                   |
| Database    | PostgreSQL 17 via [Prisma](https://www.prisma.io/) (multi-file schema)                                                                                                      |
| Package mgr | [pnpm](https://pnpm.io/)                                                                                                                                                    |
| Toolchain   | [mise](https://mise.jdx.dev/) (tool versions), [oxlint](https://oxc.rs/) + oxfmt (lint/format), [lefthook](https://lefthook.dev/) (git hooks), commitlint (commit messages) |
| Tests       | [Vitest](https://vitest.dev/)                                                                                                                                               |
| Logging     | [pino](https://getpino.io/)                                                                                                                                                 |
| Dev runner  | [pitchfork](https://github.com/jdx/pitchfork) (one-command stack)                                                                                                           |

## Getting started

### Prerequisites

- [mise](https://mise.jdx.dev/) — pins Node.js, pnpm and pitchfork (`mise install`).
  Without mise, install Node.js 24 and pnpm manually (versions are in `.mise.toml`).
- Docker (for the PostgreSQL container).
- A Discord bot token — from the [Discord Developer Portal](https://discord.com/developers/applications).

### Setup

```bash
mise install            # installs Node, pnpm, pitchfork from .mise.toml
pnpm install            # installs dependencies and git hooks (lefthook)
cp .env.example .env    # then fill in the values (see Environment below)
```

### Run

One command brings up PostgreSQL and the bot (daemons defined in `pitchfork.toml`):

```bash
pitchfork start bot     # starts the db daemon, waits until it is ready, then runs the bot
pitchfork logs bot      # tail logs   ·   pitchfork stop bot db   # stop everything
```

Prefer to run things yourself?

```bash
docker compose up -d    # PostgreSQL 17
pnpm prisma:migrate     # apply migrations (first run)
pnpm dev                # run the bot with tsx
```

### Environment

Copy `.env.example` to `.env`:

- `DISCORD_TOKEN` — bot token from the Discord Developer Portal.
- `DATABASE_URL` — PostgreSQL connection string (default matches `compose.yaml`).
- `DEV_GUILD_ID` — **dev only**: guild where slash commands are registered
  instantly (global commands take ~1h to propagate). Required by `pnpm dev`.

## Project layout

```
src/
├── core/      # framework: module loader, /config & /modules, command/event/interaction loaders
├── modules/   # one folder per feature module (commands/, listeners/, services/, *.config.ts, *.module.ts)
├── lib/       # shared contracts (module, config, registry, listener, …)
└── prisma/    # consolidated schema + migrations (generated — never edit by hand)
```

Each module is a plugin: drop a folder under `src/modules/` and it is discovered
automatically — **no registration anywhere else**.

## Common commands

```bash
pnpm dev                 # run with tsx
pnpm build               # prisma:generate + tsc → dist/
pnpm test                # run the full test suite (unit + integration)
pnpm format              # oxfmt + oxlint --fix
pnpm prisma:migrate      # create & apply a migration
pnpm prisma:studio       # open Prisma Studio
```

## Contributing

Contributions are welcome — staff and members alike.

- **Start with the developer guide in [`docs/`](docs/README.md)**: how to create a
  module, slash commands, listeners, interactions, services, the Prisma schema,
  and the user-facing behaviour.
- **Conventional Commits** are enforced (commitlint, via a lefthook `commit-msg`
  hook). A lefthook `pre-commit` hook runs oxfmt + oxlint on staged files —
  `pnpm install` sets the hooks up for you.
- **Before opening a PR**, make sure `pnpm build`, `pnpm test`, `pnpm exec oxlint
--deny-warnings` and `pnpm exec oxfmt --check` all pass (CI runs the same).
- **Agent instructions** live in [`AGENTS.md`](AGENTS.md) (also symlinked as
  `CLAUDE.md`) — a concise orientation that is handy for humans too.
- **Known tech-debt and follow-ups** are tracked in [`AUDIT.md`](AUDIT.md).

## License

[GNU GPL v3](https://choosealicense.com/licenses/gpl-3.0/).
