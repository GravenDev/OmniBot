# Sticky Messages

|                   |                           |
| ----------------- | ------------------------- |
| Identifier        | `sticky`                  |
| Configuration     | `/config sticky`          |
| Privileged intent | none                      |
| Used by           | administrators (settings) |

The bot keeps a message at the bottom of the configured channels: after every new message, it reposts the sticky message then deletes the old one. Each channel has a single sticky message.

## Commands

No commands.

## Settings

| Setting         | Key        | Type                 | Default | Description                                                                                                                                  |
| --------------- | ---------- | -------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Sticky messages | `stickies` | Per-channel settings | none    | For each text or announcement channel: **Message**, the text kept at the bottom (2000 characters at most, Markdown and line breaks allowed). |

When saved, the message is posted at once at the bottom of the channel. The bot refuses a channel where it cannot view the channel or send messages. **Remove** also removes the channel's last post; if the bot cannot delete it, the editor asks you to do it by hand.

## Behaviour

- Every new message in the channel triggers the repost: messages from members, bots, webhooks, system messages and the bot's other messages. Another sticky message bot active in the same channel must be removed, or the two keep reposting after each other.
- During a burst of messages, reposts are grouped, and the sticky message always ends up last.
- The new message is posted before the old one is deleted: if posting fails, the old one stays.
- The sticky message pings nobody, even if it contains `@everyone` or a role mention, and it is posted without a notification.
- If the bot loses access to the channel or can no longer write in it, it stops trying for 10 minutes. Saving the message again in `/config sticky` triggers a new attempt at once.
- Messages in threads are not affected.
- Deleting a channel removes its sticky message.

## Data kept

| Data                                                         | Retention                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| Configured channel, sticky message text, ID of its last post | Until removed in `/config sticky` or the channel is deleted. |
