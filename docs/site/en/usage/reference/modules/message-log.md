# Message Log

|                   |                       |
| ----------------- | --------------------- |
| Identifier        | `message-log`         |
| Configuration     | `/config message-log` |
| Privileged intent | Message Content       |
| Used by           | staff (log channel)   |

The bot logs deleted messages and, if the option is on, edited messages in a staff-only channel.

## Commands

No commands.

## Settings

| Setting             | Key                  | Type             | Default | Description                                                            |
| ------------------- | -------------------- | ---------------- | ------- | ---------------------------------------------------------------------- |
| Log channel         | `logChannel`         | Channel          | none    | Channel where messages are logged. Until it is set, nothing is logged. |
| Excluded channels   | `excludedChannels`   | List of Channel  | none    | Channels whose messages are not logged.                                |
| Excluded categories | `excludedCategories` | List of Category | none    | Categories whose channels' messages are not logged.                    |
| Log edits           | `logEdits`           | Boolean          | on      | Also logs edited messages, with their text before and after.           |

## Behaviour

- Deleted message: the log gives the author, the channel, the date it was sent, the text and the names of the attachments, with the author ID and the message ID. A text too long for the log is attached as a file.
- A message the bot no longer has in memory cannot be logged: Discord then sends neither its author nor its text.
- The "Deleted by" line only appears when the server's audit log confirms that a moderator deleted another member's message. The bot needs the _View Audit Log_ permission. When in doubt, no name is shown.
- Bulk deletion: one log per channel, with the number of deleted messages and, as an attached file, the text of those that were in the cache.
- Edited message: the log gives the text before and after, and a link to the message. If either one is longer than 1,024 characters, both full versions are attached as a file. An update that does not change the text (link preview, pin) is ignored.
- Not logged: messages from bots and webhooks, system messages, messages in excluded channels and categories and in the log channel itself.
- A forum or a thread cannot be picked in the excluded channels: exclude its category.
- Mentions in the logs ping nobody.
- In the log channel, the bot needs _View Channel_, _Send Messages_ and _Embed Links_, otherwise nothing is logged. Without _Attach Files_, logs are sent without their attached file.
- The log channel must be staff-only: it receives the text of messages from every channel that is not excluded, private threads included.

## Data kept

| Data                                                   | Retention                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Recent messages (author, text, attachments), in memory | For a limited time, in memory only. Nothing is stored in the database. |
| Logs posted in the log channel                         | On Discord, under the control of the server's administrators.          |
