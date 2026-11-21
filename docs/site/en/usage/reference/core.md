# Bot commands

|                   |                                                           |
| ----------------- | --------------------------------------------------------- |
| Identifier        | `core`                                                    |
| Configuration     | `/config core` ("Global Configuration")                   |
| Privileged intent | none                                                      |
| Used by           | administrators (modules), everyone (`/pings`, `/privacy`) |

The core of the bot is always on and cannot be disabled. It manages each server's modules and the members' preferences.

## Commands

### `/modules`

Access: administrators. Reply: visible to you only.

No options.

List of modules, 5 per page, with **◀ Previous** and **Next ▶** buttons. Each module is marked ✅ (enabled), ❌ (disabled) or 🚫 (unavailable), with its description and an **Enable**, **Disable** or **Unavailable** (greyed-out) button. A 🚫 module shows the privileged intent Discord has not granted the bot. For the Birthdays and Member anniversaries modules, when birthdays or recomputed seniorities would be deleted, **Disable** first shows a warning with **Disable and delete** and **Cancel**; with nothing to lose, it takes effect right away.

### `/config`

Access: administrators. Reply: public.

| Option   | Required | Values                                         | Description              |
| -------- | -------- | ---------------------------------------------- | ------------------------ |
| `module` | yes      | an enabled module, or **Global Configuration** | The module to configure. |

The module's "Settings" panel: each setting with its type, description and current value, marked _(default)_ until it is changed. On the right of each setting:

- a switch (green/red) for a yes/no setting;
- a blue button for the other settings: text input, choice menu or editor.

At the bottom: **◀ Previous** and **Next ▶** when the panel has several pages, and **Reset…**, which puts the chosen settings (or **All fields**) back to their default. Per-channel settings are not reset.

Setting types:

| Type                          | Input                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Text                          | Text field. Known emoji codes (`:tada:`) are replaced with the emoji.                                                        |
| Number                        | Text field, a number.                                                                                                        |
| Boolean                       | Switch.                                                                                                                      |
| Duration                      | A number followed by `s`, `m`, `h` or `d`: `30s`, `5m`, `4h`, `1h30m`, `3d`.                                                 |
| Emoji                         | An emoji (🚩), its Discord name (`:smile:`) or the name of a server emoji (`:name:`).                                        |
| Channel, Category, Role, User | Discord select menu.                                                                                                         |
| Choice                        | Menu with the possible values.                                                                                               |
| List of …                     | Multi-select menu for channels, roles, categories or users; editor with **Add** and **Remove** for texts, numbers or emojis. |
| Per-channel settings          | Editor, 7 channels per page, with **Add**, **Edit** and **Remove**.                                                          |

### `/pings`

Access: everyone. Reply: visible to you only.

| Option    | Required | Values          | Description                                          |
| --------- | -------- | --------------- | ---------------------------------------------------- |
| `enabled` | yes      | `True`, `False` | Be pinged by the bot's announcements on this server. |

`False`: the bot no longer pings you in its announcements on this server; your name is still shown. `True`: it pings you again. The setting applies to the announcements of every module of the server (birthdays, member anniversaries, RNGdle).

### `/privacy delete`

Access: everyone. Reply: visible to you only.

No options.

Shows what will be deleted and a **Delete my data** button. The button erases, on this server only, whether the modules are enabled or not:

- your Server Stats counters;
- in the 4h Game: your score, your point history, your daily points, and the last message of the game channel if you wrote it;
- your RNGdle account, rolls, reminder and daily cards;
- the link to your Clash of Code player (the player and their results, which come from CodinGame, stay on the leaderboard);
- your birthday (and the birthday role, if you have it today);
- your recomputed seniority;
- your `/pings` preference.

Reports are not deleted: they stay with the moderators until they are purged. If part of the deletion fails, the rest is still deleted and the message asks you to try again.

## Settings

| Setting  | Key      | Type   | Default | Description                                    |
| -------- | -------- | ------ | ------- | ---------------------------------------------- |
| Language | `locale` | Choice | English | Bot language on the server: English or French. |

## Behaviour

- When it joins a server, the bot posts a welcome message in the system channel, in French if the server's language in Discord is French and in English otherwise, or sends it as a direct message to the owner if that channel is unavailable. No module is enabled.
- When the bot leaves a server, the configuration and the enabled modules are kept, and restored if it is invited again. Data with a limited retention period is still deleted when it expires (reports, for example).
- A command of a disabled module replies that it is not enabled on this server.
- Error messages are visible only to the person concerned. If the error comes from a permission the bot lacks, the message says so.
- Module images show each member with their server nickname and server avatar.

## Data kept

| Data                                        | Retention                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| Configuration of the server's modules       | While the bot is on the server, and after it leaves, to be restored if it comes back. |
| Enabled modules and their version           | Same as the configuration.                                                            |
| `/pings` preference (server and member IDs) | Until `/pings enabled:True` or `/privacy delete`.                                     |
