# Contributing

Contributions are welcome from everyone — Graven - Développement community staff and members alike. This project is developed for and by the [Graven - Développement](https://discord.gg/graven) Discord community.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork
3. Set up the development environment (see [Getting Started](./getting-started))
4. Create a branch for your work

```bash
git checkout -b feat/my-feature
```

## Conventional Commits

Commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) format. This is enforced by **commitlint** via a lefthook pre-commit hook.

```
type(scope): description

feat(thread-creator): add paced creation queue
fix(config): handle undefined values in number handler
docs(commands): explain autocomplete flow
chore(deps): update pnpm to v11
```

### Allowed Types

| Type       | Usage                                      |
| ---------- | ------------------------------------------ |
| `feat`     | A new feature                              |
| `fix`      | A bug fix                                  |
| `chore`    | Maintenance, dependencies, tooling         |
| `docs`     | Documentation changes                      |
| `refactor` | Code restructuring without feature changes |
| `test`     | Adding or updating tests                   |
| `ci`       | CI/CD configuration changes                |

## Before Opening a PR

Run these checks locally — the same checks run in CI:

```bash
pnpm build                  # Must succeed
pnpm test                   # All tests must pass (unit + integration)
pnpm exec oxlint --deny-warnings  # No lint warnings
pnpm exec oxfmt --check     # Code formatting must be correct
```

To auto-fix formatting and lint issues:

```bash
pnpm format                 # oxfmt --write + oxlint --fix --fix-suggestions
```

## PR Workflow

1. **Branch from `master`** — keep your branch up to date
2. **Make focused commits** — each commit should represent one logical change
3. **Keep PRs small** — easier to review, faster to merge
4. **Open a draft PR early** — get feedback while you work
5. **Ensure CI is green** — fix any failing checks
6. **Request review** — at least one approval required

### PR Title Convention

Follow the same Conventional Commits format for PR titles:

```
feat(module): add message logging functionality
fix(core): resolve permission check race condition
```

## Code Style

### Formatting

- **oxfmt** handles all formatting (replaces Prettier)
- Run `pnpm format` before committing
- The `pre-commit` lefthook hook runs oxfmt + oxlint on staged files

### Linting

- **oxlint** enforces code quality rules
- Run `pnpm exec oxlint --deny-warnings` to check
- Some warnings can be auto-fixed with `pnpm format`

### Imports

- Cross-directory: use `#` subpath imports (`#lib/config.js`, `#core/...`)
- Same-directory: use relative imports (`./file.js`)
- Always include the `.js` extension (NodeNext)

### Naming

- Files use role suffixes: `*.command.ts`, `*.listener.ts`, `*.button.ts`, `*.service.ts`
- Module IDs are kebab-case: `thread-creator`, `my-module`
- Types and interfaces are PascalCase

## Testing

We use **Vitest** for testing. Tests are co-located with source files:

```
src/lib/config.ts            # Source
src/lib/config.test.ts       # Tests
src/core/services/module.service.ts
src/core/services/module.service.test.ts
```

### Running Tests

```bash
pnpm test                    # All tests
pnpm test:unit               # Unit tests only
pnpm test:integration        # Integration tests only
pnpm test -- --watch         # Watch mode
```

### Writing Tests

- **Unit tests** test isolated logic (parsers, utilities, algorithms)
- **Integration tests** test interactions with Discord API (mocked) and database
- Tests use `vi.mock()` to isolate dependencies
- Check existing tests for patterns and conventions

## Finding Tasks

- **[AUDIT.md](../../../AUDIT.md)** — tracks tech debt, known issues, and follow-ups
- **[GitHub Issues](https://github.com/GravenDev/OmniBot/issues)** — feature requests and bug reports
- **[Review docs](../../../docs/review/)** — code review findings with actionable items

## Need Help?

- Join the [Graven - Développement](https://discord.gg/graven) Discord server
- Open a [GitHub Discussion](https://github.com/GravenDev/OmniBot/discussions)
- Check the [documentation](/) for guides and reference
