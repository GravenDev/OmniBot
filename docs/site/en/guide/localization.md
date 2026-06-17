# Localization

OmniBot supports translating module interfaces per guild via an i18n system built on i18next. Each module can provide its own translation files, with automatic fallback to the core namespace.

## How it works

- The guild's locale is configured via `/config core > locale` (currently `en` or `fr`).
- Each module can bundle an `i18n/` directory with one JSON file per locale.
- Translation keys are resolved in order: module namespace → core namespace.
- When a locale file is missing, English is used as the fallback.

## Module structure

```
src/modules/my-module/
├── my-module.module.ts
├── i18n/
│   ├── en.json
│   └── fr.json
└── commands/
    └── ...
```

Translation files are auto-discovered at startup by the module loader — no registration needed.

## Translation file format

```json
{
  "module.name": "My Module",
  "module.description": "Does awesome things.",
  "config.myField.name": "My Field",
  "config.myField.description": "Description of my field.",
  "greeting": "Hello {{name}}!"
}
```

Use <code v-pre>{{param}}</code> syntax for dynamic values — never concatenate strings with `${}` or `+` inside translated text.

### Module metadata

| Key                  | Overrides                                |
| -------------------- | ---------------------------------------- |
| `module.name`        | Module `name` in `defineModule()`        |
| `module.description` | Module `description` in `defineModule()` |

### Config field labels

| Key pattern                     | Overrides                                |
| ------------------------------- | ---------------------------------------- |
| `config.<fieldKey>.name`        | Field `name` in the config schema        |
| `config.<fieldKey>.description` | Field `description` in the config schema |

### Default values

A free-text (`STRING`) field's default can be localized so an unconfigured value renders in the guild's language:

| Key pattern                 | Overrides                                          |
| --------------------------- | -------------------------------------------------- |
| `config.<fieldKey>.default` | The field's `defaultValue` (free-text fields only) |

The schema's `defaultValue` stays the English fallback. Defaults are **not persisted**: `ConfigProvider.get()` resolves them lazily, so the value tracks the guild locale and changes live when the locale changes — until an admin sets the field explicitly, after which the stored value wins and no longer follows the locale.

Only `STRING` fields are localized this way. Enum defaults are stored identifiers (not display text) and are returned verbatim, as are numbers, booleans and lists.

In the `/config` panel, any field the admin hasn't set — showing a default, or nothing for a field without one — is flagged with a `config.defaultSuffix` marker (`_(default)_`), so they can tell at a glance what has actually been changed. `ConfigProvider.isSet(key)` exposes the same distinction in code.

> [!NOTE]
> Guilds whose config predates this mechanism keep whatever default was already
> stored until a `/config` reset — there is no automatic migration.

### Localized enum option labels

An enum field can render its option values as localized names instead of raw codes with a `display` hint:

```typescript
locale: {
  type: ConfigType.ENUM,
  options: ["en", "fr"] as const,
  display: "language",
}
```

With `display: "language"`, each option is shown via `Intl.DisplayNames` in the viewer's locale — `fr` renders as "Français" (FR) or "French" (EN), in both the `/config` readout and the select menu. No translation keys are needed; the names come from the runtime.

## Using translations in code

The `ConfigProvider` injected into commands, listeners, and interactions exposes a `t()` method:

```typescript
async execute(interaction, config) {
  const greeting = config.t("greeting", { name: interaction.user.username });
  await interaction.reply(greeting);
}
```

### Type name localization

The `getConfigTypeName()` helper accepts an optional `TFunction` for localized type names:

```typescript
import { getConfigTypeName } from "#lib/config.js";

const label = getConfigTypeName(ConfigType.STRING, config.t);
// → "Text" (EN) or "Texte" (FR)
```

### In commands

```typescript
data: new SlashCommandBuilder()
  .setName("hello")
  .setDescription("Says hello!")
  .setDescriptionLocalizations({ fr: "Dit bonjour !" }),
```

Only descriptions are localized in this bot — command names stay in English.

## Core namespace fallback

Common UI strings are provided by the core namespace and are available in every module without redefining them:

| Key               | English value                                                      | French value                                                       |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `config.previous` | ◀ Previous                                                         | ◀ Précédent                                                        |
| `config.next`     | Next ▶                                                             | Suivant ▶                                                          |
| `config.page`     | Page &#123;&#123;current&#125;&#125;/&#123;&#123;total&#125;&#125; | Page &#123;&#123;current&#125;&#125;/&#123;&#123;total&#125;&#125; |
| `modules.enable`  | Enable                                                             | Activer                                                            |
| `modules.disable` | Disable                                                            | Désactiver                                                         |
| `type.text`       | Text                                                               | Texte                                                              |
| `type.number`     | Number                                                             | Nombre                                                             |
| `type.boolean`    | Boolean                                                            | Booléen                                                            |
| `type.user`       | User                                                               | Utilisateur                                                        |
| `type.role`       | Role                                                               | Rôle                                                               |
| `type.channel`    | Channel                                                            | Salon                                                              |
| `type.category`   | Category                                                           | Catégorie                                                          |
| `type.choice`     | Choice                                                             | Choix                                                              |
| `type.listOf`     | List of &#123;&#123;type&#125;&#125;                               | Liste de &#123;&#123;type&#125;&#125;                              |

## Adding a new locale

1. Add the locale code to the `locale` ENUM in `src/core/core.config.ts`.
2. Create `i18n/<locale>.json` in the core module with translations for all core keys.
3. Create `i18n/<locale>.json` in each module you want to translate.
4. Guild admins can then select the new locale via `/config core > locale`.

## Best practices

- **Write TypeScript values in English** — they serve as the fallback when no translation matches.
- **Always use named parameters** (<code v-pre>{{param}}</code>) in i18n values, never `${}` template literals.
- **Only translate module-specific strings** — common UI labels come from the core namespace.
- **Keep translation files complete** — missing keys fall back to English, but this may produce mixed-language output.
