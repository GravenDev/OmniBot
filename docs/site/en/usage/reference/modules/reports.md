# Reports

|                   |                                          |
| ----------------- | ---------------------------------------- |
| Identifier        | `reports`                                |
| Configuration     | `/config reports`                        |
| Privileged intent | Message Content                          |
| Used by           | members (reporting), moderators (alerts) |

Members report a message with a reaction or the context menu. Moderators get an alert in the alert channel, with a copy of the message and action buttons. Nothing is reported until the alert channel is set.

## Commands

### Report message

Access: everyone. Reply: visible to you only.

Context menu command of a message: right-click the message (long press on mobile), **Apps**, **Report message**. No options.

A window asks for an optional reason (500 characters at most), then a confirmation is shown. You cannot report your own messages, messages from bots and the system, or those of the alert channel and its threads.

## Settings

| Setting        | Key             | Type     | Default | Description                                                                                  |
| -------------- | --------------- | -------- | ------- | -------------------------------------------------------------------------------------------- |
| Alert channel  | `alertChannel`  | Channel  | none    | Channel where moderators receive the reports. Nothing is reported until it is set.           |
| Report emoji   | `emoji`         | Emoji    | 🚩      | Reacting with this emoji reports the message. The reaction is removed right away.            |
| Moderator role | `moderatorRole` | Role     | none    | Role mentioned when a new report arrives.                                                    |
| Retention      | `retention`     | Duration | `30d`   | How long a closed report keeps its copy of the message before it is purged. 30 days at most. |

## Behaviour

- By reaction: the bot removes the reaction right away, so that nobody sees who reported. The reporter gets no confirmation. If the bot cannot view or write to the alert channel, the reaction stays and nothing is reported. If it cannot remove the reaction (Manage Messages missing in the channel), the report still goes through but the reaction stays visible, and the alert says so. The messages that cannot be reported with the command are not reported by reaction either, even though the reaction is removed.
- A reported message gives a single alert, however many reports it gets. The first one mentions the moderator role; the next ones update the alert without mentioning. A member counts only once per message.
- The alert shows the author, the channel and a link to the message, its date, a copy of the message (text and attachment links), the members who reported it with their reasons, and the author's report history. If the author edits or deletes the message, the alert says so and keeps the copy.
- Alert buttons, with the permission they need in the alert channel:
  - **Delete message** (Manage Messages, also in the message's channel): the alert stays open.
  - **Warn** (Timeout Members): sends the author a direct message with the text entered and the message link.
  - **Timeout…** (Timeout Members): timeout, `1h` by default, 28 days at most.
  - **Kick** (Kick Members).
  - **Ban** (Ban Members): optional deletion of their recent messages, 7 days at most.
  - **Softban** (Ban Members): bans then unbans right away to delete their recent messages, `1d` by default, 7 days at most.
  - **Dismiss** (Manage Messages).
  - **Abusive report** (Manage Messages): the report does not count in the author's history.
  - **Reopen** (Manage Messages): reopens a closed alert.
- Every action except **Delete message** and **Reopen** closes the alert. A new report on a closed alert reopens it and mentions the moderator role.
- A sanction's reason is optional, except for a warning; it is copied to the server's audit log. A sanction is refused if the author is the server owner, if your highest role is not above theirs, or if the bot cannot reach them. An author who left the server can only be banned or softbanned.
- Every day at 04:00 UTC, expired reports are deleted and their alert says they were purged.

## Data kept

| Data                                                                                                        | Retention                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Report: copy of the message (text, edited version, attachments), author, channel and message IDs, date sent | Closed: deleted after the `retention` duration. In any case, deleted 30 days after the message was last reported at the latest. Not erased by `/privacy delete`. |
| Members who reported and their reasons                                                                      | Same as above.                                                                                                                                                   |
| Moderator decisions: moderator, sanction, reason, duration                                                  | Same as above.                                                                                                                                                   |
