<h3 align="center">
  <img src="https://avatars.githubusercontent.com/u/78621926?s=200&v=4" width="75"><br/>
  Graven - Développement<br/>
  This project is under the <a href="LICENSE">GNU GPL v3 or later</a> license<br/><br/>
</h3>

# <p align="center">`OmniBot`</p>

The projects of the <code>GravenDev</code> organisation are used by the Discord server <code>discord.gg/graven</code>, by its moderators and members alike.
Most contributors are part of the staff, but members are welcome to contribute too.

<p align="center">
  <img src="https://img.shields.io/badge/State-In_development-orange?style=for-the-badge">
  <img src="https://img.shields.io/github/issues/GravenDev/OmniBot?style=for-the-badge">
  <img src="https://img.shields.io/github/issues-pr/GravenDev/OmniBot?style=for-the-badge">
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

- [mise](https://mise.jdx.dev/) — pins Node.js, pnpm, pitchfork, gh and git-cliff (`mise install`).
  Without mise, install Node.js 24 and pnpm manually (versions are in `.mise.toml`).
- Docker (for the PostgreSQL container).
- A Discord bot token — from the [Discord Developer Portal](https://discord.com/developers/applications).

### Setup

```bash
mise install            # installs the tools pinned in .mise.toml
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
- `DEV_GUILD_ID` — **dev only**: guild where the core commands, and those of the
  modules enabled there, are registered instantly (global commands take ~1h to
  propagate). Required by `pnpm dev`.
- `LOG_LEVEL` — optional: `fatal`, `error`, `warn`, `info`, `debug`, `trace` or
  `silent` (default `debug` in development, `info` otherwise). Logs are
  pretty-printed in development and JSON otherwise.

## Deployment

`compose.prod.yaml` deploys the images published to GHCR on each `v*` tag. It
builds nothing, so a host needs Docker, that file and the environment variables
— no source checkout, no compiler.

Production runs it as a Portainer stack pointing at this repository, so the
compose file in use is always the one on `master` rather than a copy that drifts
from it. Two of its settings matter: **Re-pull image**, without which a redeploy
reuses the image already cached under `latest`, and the stack environment
variables, which take the place of an env file. Cutting a release then deploys
itself — the `deploy` job calls the stack webhook once the images are published.

`latest` only ever moves to a non-prerelease tag, so cutting a `-rc` publishes
it without deploying it, and the `deploy` job skips those tags for the same
reason.

To run the stack by hand instead:

```bash
cp .env.prod.example .env.prod   # then fill in the values
docker compose --env-file .env.prod -f compose.prod.yaml pull
docker compose --env-file .env.prod -f compose.prod.yaml up -d
docker compose --env-file .env.prod -f compose.prod.yaml logs -f bot
```

Updating is then the same two commands: `pull`, then `up -d` — compose recreates
only what changed.

The containers log to the host's journal (`journald` driver), so the logs
survive a deploy, which recreates the bot's container: with Docker's default
`json-file` driver, they would be deleted with it. The host must run
systemd-journald. `docker compose logs` keeps working, and the journal reads
further back, across deploys:

```bash
journalctl CONTAINER_NAME=omnibot-bot-1 --since "2 days ago"   # one container
journalctl -t omnibot-bot-1 -f                                 # follow it
```

`omnibot-bot-1` is the name compose gives the bot's container; a Portainer
stack may name it after the stack instead — `docker ps` shows the real name.
On Ubuntu, the journal is kept on disk (`/var/log/journal`), so the logs also
survive a reboot of the host.

How long they are kept is the journal's setting (`SystemMaxUse`,
`MaxRetentionSec` in `/etc/systemd/journald.conf`), not the stack's.

The images come from the multi-stage `Dockerfile` (Node 24 on Alpine, non-root
user, `tini` as PID 1), built by CI on every pull request and published on tag.

Variables to provide — in the Portainer stack configuration, or in `.env.prod`
when running the stack by hand:

- `DISCORD_TOKEN` — bot token from the Discord Developer Portal.
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — database credentials.
  `DATABASE_URL` is assembled from them by the compose file; PostgreSQL sits on
  an internal network and publishes no port.
- `LOG_LEVEL` — optional, `info` by default.

All but `LOG_LEVEL` are required and have no default.

What the stack does:

- **`migrate`** — a one-shot container that runs `prisma migrate deploy` before
  the bot starts (`depends_on: service_completed_successfully`). The bot image
  itself ships no Prisma CLI, and two bot instances can never race on the
  migration history.
- **`bot`** — read-only root filesystem, all capabilities dropped, restarted by
  Docker (`restart: unless-stopped`). It has **no healthcheck on purpose**: the
  bot exposes no HTTP or TCP endpoint, so any probe would either be a lie about
  the Discord gateway state or a redundant "is PID 1 alive?" check. `tini`
  forwards `SIGTERM`, which the bot handles by closing the Discord client and
  the Prisma pool.

Building the image alone:

```bash
docker build -t omnibot .
```

### Releases

Once the images of a tag are published, CI creates its GitHub Release
(`release-notes` and `release` jobs of `ci.yml`). The notes hold, in order:

1. **Quoi de neuf** — a summary for server admins and members, in French then
   English (folded), written by an AI model from the technical changelog and
   the explaining paragraph of each feature, fix and performance commit (the
   first prose paragraph of its body, trailers left out, cut at 500 characters),
   through any OpenAI-compatible Chat Completions API (OpenAI, Mistral, Groq,
   OpenRouter, Ollama, Anthropic…). It needs the `AI_API_KEY` secret of the
   `release` environment (deployment rule: tags `v*`) and the `AI_MODEL`
   repository variable, which has no default (for instance
   `gpt-5.6-luna`; pick a current, inexpensive model). `AI_BASE_URL` points
   to another provider than OpenAI (default `https://api.openai.com/v1`).
   Without the key or the model, or when the call fails, the answer is not
   valid JSON or names a command the changelog does not, the release goes out
   without it. Each call is capped at 8000 output tokens.
2. **Images Docker** — `ghcr.io/gravendev/omnibot` and `omnibot-migrator` at the
   version's tag, pinned by digest.
3. **Changelog technique** — the commits since the previous release, grouped
   by conventional-commit type by [git-cliff](https://git-cliff.org)
   (`cliff.toml`, version pinned in `.mise.toml`). A release counts from the
   previous release, a prerelease from the previous tag of any kind.

A tag with a `-` gets a prerelease. Re-running the workflow on a tag replaces
the notes of its release; nothing ever creates or moves a tag (`gh release
create --verify-tag`).

To preview the notes of a tag locally (`mise install` provides git-cliff):

```bash
node scripts/release-notes.ts --tag v0.22.0 --no-ai
```

## Project layout

```
src/
├── core/      # framework: module loader, /config & /modules, command/event/interaction loaders
├── modules/   # one folder per feature module (commands/, listeners/, services/, *.config.ts, *.module.ts)
├── lib/       # shared contracts and helpers (module, config, registry, imaging, calendar, …)
├── prisma/    # generator + datasource (dbinfo.prisma) and migrations; models live in each module
└── utils/     # colors
```

Each module is a plugin: drop a folder under `src/modules/` and it is discovered
automatically — **no registration anywhere else**.

## Common commands

```bash
pnpm dev                 # run with tsx
pnpm build               # prisma:generate + tsc → dist/
pnpm test                # run the full test suite (unit + integration)
pnpm test:unit           # unit tests only (also test:integration)
pnpm format              # oxfmt + oxlint --fix
pnpm new-module          # scaffold a module
pnpm render-preview <file.preview.ts> [--before <ref>]   # draw sample images, before and after a change
pnpm prisma:generate     # generate the Prisma client (needed before build)
pnpm prisma:migrate      # create & apply a migration
pnpm prisma:studio       # open Prisma Studio
pnpm --filter omnibot-docs dev   # preview the documentation site
```

## Contributing

Contributions are welcome — staff and members alike.

- **Start with the developer guide in [`docs/site/`](docs/site/README.md)**, in
  English and French: how to create a module, slash commands, listeners,
  interactions, services, images, the Prisma schema. The user-facing behaviour
  is in [`docs/functional.md`](docs/functional.md).
- **Conventional Commits** are enforced (commitlint, via a lefthook `commit-msg`
  hook). A lefthook `pre-commit` hook runs oxfmt + oxlint on staged files —
  `pnpm install` sets the hooks up for you.
- **Before opening a PR**, make sure `pnpm build`, `pnpm test`, `pnpm exec oxlint
  --deny-warnings` and `pnpm exec oxfmt --check` all pass (CI runs the same).
- **Agent instructions** live in [`AGENTS.md`](AGENTS.md), which coding agents
  read on their own — a concise orientation that is handy for humans too.
- **Known tech-debt and follow-ups** are tracked in [`AUDIT.md`](AUDIT.md).

## License

<!-- Logo copied from https://www.gnu.org/graphics/gplv3-or-later.png, so that it shows even when gnu.org does not answer. -->

<a href="LICENSE"><img src=".github/assets/gplv3-or-later.png" alt="GNU GPL v3 or later"></a>

OmniBot is free software: you can redistribute it and/or modify it under the
terms of the [GNU General Public License](https://www.gnu.org/licenses/gpl-3.0.html)
as published by the Free Software Foundation, either version 3 of the License,
or (at your option) any later version (`GPL-3.0-or-later`). The full text is in
[`LICENSE`](LICENSE).
