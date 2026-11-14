# Auto React

|                   |                           |
| ----------------- | ------------------------- |
| Identifier        | `autoreact`               |
| Configuration     | `/config autoreact`       |
| Privileged intent | none                      |
| Used by           | administrators (settings) |

The bot adds a reaction to every new message in the configured channels. Each channel has a single emoji.

## Commands

No commands.

## Settings

| Setting             | Key         | Type                 | Default | Description                                                                                                                                                                       |
| ------------------- | ----------- | -------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatic reactions | `reactions` | Per-channel settings | none    | For each text or announcement channel: **Emoji**, the reaction added. A Unicode emoji, an emoji name (`:thumbsup:`), a custom emoji (`<:name:id>`) or the name of a server emoji. |

The bot refuses a custom emoji from a server it is not in, and a channel where it cannot view the channel, read message history or add reactions.

## Behaviour

- The bot reacts to every new message in the channel, including those from other bots and webhooks. It ignores its own messages and system messages.
- Messages in threads are not affected.
- If a custom emoji no longer exists, the channel's automatic reaction is removed.
- If the bot loses access to the channel or a required permission, or if Discord refuses a Unicode emoji, it stops reacting in that channel for 10 minutes, then tries again.
- A member who blocked the bot does not get the reaction.
- Deleting a channel removes its automatic reaction.

## Data kept

| Data                             | Retention                                                       |
| -------------------------------- | --------------------------------------------------------------- |
| Configured channel and its emoji | Until removed in `/config autoreact` or the channel is deleted. |
