# AGENTS.md

Guidance for AI coding agents working in this repository (also a quick
orientation for humans).

## Commands

```bash
pnpm dev                  # run the bot with tsx
pnpm build                # prisma:generate + tsc
pnpm format               # oxfmt + oxlint --fix
pnpm test:coverage        # tests with coverage (coverage/lcov.info, read by SonarCloud in CI)
pnpm render-preview <file.preview.ts> [--before <ref>]  # draw sample images, before and after a change
pnpm find-similar <file> [<function>...]  # existing functions that look like those of <file>
pnpm copy-check --staged  # code a change copies from another module (pre-commit and CI run it)

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
| Scheduled tasks            | [docs/site/en/guide/tasks.md](docs/site/en/guide/tasks.md)                         |
| Generating images          | [docs/site/en/guide/images.md](docs/site/en/guide/images.md)                       |
| Prisma / database          | [docs/site/en/guide/database.md](docs/site/en/guide/database.md)                   |
| Functional behavior        | [docs/functional.md](docs/functional.md)                                           |

The docs are also published as a VitePress site (sources in `docs/site/`) — run `pnpm --filter omnibot-docs dev` to preview.

## Key rules

- Prisma reads every `*.prisma` file under `src/` (multi-file schema): models live in the module's own `*.prisma` file, and model names must be unique across modules.
- Run `pnpm prisma:generate` before building after any schema change.
- Fetch a whole guild's members with `allMembers(guild)` (or `loadAllMembers(guild)` to only fill the cache) from `#lib/guild-members.js`, never `guild.members.fetch()` or a direct API call: Discord rate limits those requests per guild, and the helper shares one between modules. The `omnibot/no-whole-guild-member-fetch` lint rule (`lint/omnibot.js`) enforces it across `src/`.
- Reach Discord through discord.js's methods. A call to Discord's REST API (`client.rest` with `Routes`) for what discord.js does not implement yet goes in `src/lib/discord-polyfills/`, one file per feature, with a test that fails once discord.js ships it, so the polyfill gets deleted then. The `omnibot/discord-rest-in-polyfills` lint rule (`lint/omnibot.js`) rejects such a call, a route or a Discord API URL anywhere else in `src/`; only the core loaders (command registration, the intent check before login) and tests are exempt.
- Recognise a Discord API error with `isDiscordApiError(err)`, `isApiError(err, …codes)` or `apiErrorCode(err)` from `#lib/discord-errors.js`, and name codes with `RESTJSONErrorCodes`: never `instanceof DiscordAPIError` nor a number written by hand. Silence mentions with `NO_MENTIONS` / `NO_MENTIONS_REPLY` from `#lib/mentions.js`. The `omnibot/discord-error-codes` and `omnibot/shared-no-mentions` lint rules enforce both.
- Before writing a function, look for one that already does the job, or would with a small change (a parameter, a move to `src/lib/`), and extend it rather than writing a second one: a function copied into a module drifts from the original, and the next fix lands in one copy only. Start with the Shared helpers table below, search the other modules by what the function does, and run `pnpm find-similar <file>` on the file you changed. Claude Code runs it after every Write and Edit (`.claude/settings.json`) and asks, for a new function with look-alikes, to reuse one or say why none fits. `pnpm copy-check` refuses lines copied from another module, in the pre-commit hook and in CI; a copy kept on purpose takes a `// copy-check: allow — <reason>` comment.
- Import across directories with `#…` subpath imports (e.g. `#lib/config.js`, `#core/…`), not deep relative paths (`../../…`); keep same-directory imports relative (`./x.js`). Always keep the `.js` extension (NodeNext). Scripts in `scripts/`, which node runs without a build, import their siblings with `.ts`.

## Shared helpers

Shared code lives in `src/lib/` (imported as `#lib/…`), plus `src/core/utils/` for the core's own and `src/utils/colors.ts` for the palette. One line per file, so the right helper is found before a copy is written; `src/lib/agents-index.test.ts` fails when a file of `src/lib/` is missing here.

| Import                     | What it gives                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `#lib/calendar.js`         | guild-local days and times: `localTime`, `dayKey`, `dueDay`, `upcoming`, `formatDate`, `addDays`, `anniversaryYears` |
| `#lib/celebration-card.js` | the festive card of birthday and seniority, confetti included                                                        |
| `#lib/channel-audience.js` | channels and categories a config excludes: `isExcluded`, `excludedIdsOf`, `isNsfw`                                   |
| `#lib/command.js`          | `declareCommand` for slash commands                                                                                  |
| `#lib/confetti-3d.js`      | animated 3D confetti over a card                                                                                     |
| `#lib/config.js`           | config types, emoji resolution, channel records (`ChannelRecord…`), `formatConfigValue`                              |
| `#lib/database.js`         | the Prisma client (default export `prisma`) and the `Prisma` namespace                                               |
| `#lib/deadline.js`         | `withDeadline`: wait for a promise at most so long                                                                   |
| `#lib/declared.js`         | the `Declared` type behind every `declare…`                                                                          |
| `#lib/discord-errors.js`   | `isDiscordApiError`, `isApiError`, `apiErrorCode`, `isGuildSetupError`                                               |
| `#lib/discord-polyfills/`  | REST calls discord.js lacks, one file per feature                                                                    |
| `#lib/duration.js`         | `parseDuration`, `formatDuration`                                                                                    |
| `#lib/emoji-shortcodes.js` | `:name:` shortcodes to emojis                                                                                        |
| `#lib/env.js`              | `isDevMode`, `devGuildId`, `uptimeKumaPushUrl`                                                                       |
| `#lib/format.js`           | numbers and previews: `formatInteger`, `formatPercentage`, `preview`, `describeLines`, `COMPONENTS_TEXT_LIMIT`       |
| `#lib/guild-members.js`    | `allMembers`, `loadAllMembers`: a whole guild's members, shared between modules                                      |
| `#lib/hidden-text.js`      | `stripHiddenText`: drop code and spoilers before reading links                                                       |
| `#lib/i18n.js`             | `createT`, `TFunction`                                                                                               |
| `#lib/imaging.js`          | canvas basics: fonts, palette, avatars, portraits, centred text                                                      |
| `#lib/interaction.js`      | `declareInteractionHandler` for buttons, menus and modals, with who may use them                                     |
| `#lib/keyed-queue.js`      | `KeyedQueue`: run tasks one at a time per key                                                                        |
| `#lib/listener.js`         | `declareEventListener`                                                                                               |
| `#lib/log-throttle.js`     | `LogThrottle`: the same warning once, then at debug level                                                            |
| `#lib/logger.js`           | `loggerMaker(name)`, the shared pino logger                                                                          |
| `#lib/mentions.js`         | `NO_MENTIONS`, `NO_MENTIONS_REPLY`                                                                                   |
| `#lib/message-content.js`  | what a Components V2 message reads and shows: `componentsText`, `componentsMedia`                                    |
| `#lib/moderation.js`       | `fetchMember` (null when gone), `isBanned`                                                                           |
| `#lib/module.js`           | `defineModule`                                                                                                       |
| `#lib/pagination.js`       | `pageRow`: previous / next buttons                                                                                   |
| `#lib/permissions.js`      | `missingBotPermissions`, `canReplyWithFile`                                                                          |
| `#lib/players.js`          | `resolvePlayers`: member names and avatars for leaderboards                                                          |
| `#lib/post-card.js`        | `postCard` (image, text if refused), `celebrationMessage`                                                            |
| `#lib/preview.js`          | sample images for `pnpm render-preview`                                                                              |
| `#lib/registry.js`         | a module's declarations                                                                                              |
| `#lib/revision-cache.js`   | `RevisionCache`, `RevisionCounter`: caches invalidated by key                                                        |
| `#lib/service.js`          | `declareService`                                                                                                     |
| `#lib/stat-card.js`        | stat cards: panels, trends, fitted text                                                                              |
| `#lib/table.js`            | leaderboard tables drawn on a canvas                                                                                 |
| `#lib/task.js`             | `declareTask` for scheduled tasks                                                                                    |
| `#lib/testing.js`          | test fakes: guilds, channels, messages, config, silenced logs                                                        |
| `#lib/text.js`             | `truncate`                                                                                                           |
| `#lib/version.js`          | the `Version` type                                                                                                   |

## Commits

Pull requests are merged by rebase, and every commit subject becomes a line of the release's changelog: `cliff.toml` groups them by type: `feat` → Nouveautés, `fix` → Corrections, `perf` → Performances, `refactor` → Refactorisation, `docs` → Documentation, `test` → Tests, `build`, `ci` and `chore(ci)` → Build et CI, any other `chore` and `style` → Maintenance, `revert:` and the « Revert "…" » title of GitHub's button → Retours en arrière. Two exceptions come first: the `deps` scope goes to Dépendances and a breaking change (`!`, `BREAKING CHANGE`) to Changements incompatibles, whatever the type. Shape the history a branch ends with for that reader; how you get there is up to you.

- One commit per change that can be read or reverted on its own. A behaviour fix gets its own `fix(<scope>)` commit, even inside a refactor branch, so that it shows under Corrections.
- The subject, in French, says what changes, never the work step: no « suites de la revue », « corrections diverses », « wip ». commitlint refuses those (`lint/commit-subject.js`), locally and on every pull request.
- Rework asked in review goes into the commits it changes before the merge, not into commits of its own.
- Each pull request gets a comment previewing its changelog lines, updated on every push (from a fork, the preview is in the CI run's summary instead): read it as the release's reader will.

## Environment

Copy `.env.example` to `.env`:

- `DISCORD_TOKEN` — bot token from Discord Developer Portal
- `DATABASE_URL` — PostgreSQL connection string (default matches `compose.yaml`)
- `LOG_LEVEL` — optional log level (`fatal`/`error`/`warn`/`info`/`debug`/`trace`/`silent`, default `debug` in development, `info` otherwise); invalid values fall back to that default. Logs are pretty-printed in development and JSON otherwise
- `UPTIME_KUMA_PUSH_URL` — optional push URL of an Uptime Kuma monitor (secret); unset, the bot runs without monitoring (see `src/core/monitoring/`)
