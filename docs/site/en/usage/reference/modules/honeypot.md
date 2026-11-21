# Honeypot

|                   |                           |
| ----------------- | ------------------------- |
| Identifier        | `honeypot`                |
| Configuration     | `/config honeypot`        |
| Privileged intent | Message Content           |
| Used by           | administrators (settings) |

When a member writes in a trap channel, the bot softbans them: it bans them, deleting their recent messages across the server, then lifts the ban right away. The trap targets spam bots and hacked accounts, which post everywhere without reading. The member can come back with an invite.

## Commands

No commands.

## Settings

| Setting         | Key              | Type            | Default | Description                                                                                                |
| --------------- | ---------------- | --------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| Trap channels   | `trapChannels`   | List of Channel | none    | Channels nobody should write in. A member who posts there is softbanned. Nothing happens until one is set. |
| Log channel     | `logChannel`     | Channel         | none    | Channel where each triggered trap is logged.                                                               |
| Counter channel | `counterChannel` | Channel         | none    | Channel where the bot keeps a message counting the members caught by the trap, updated after each catch.   |
| Exempt roles    | `exemptRoles`    | List of Role    | none    | Members with one of these roles are never sanctioned.                                                      |
| Purge window    | `purgeWindow`    | Duration        | `1h`    | How far back the softban deletes the member's messages across the server (7 days at most).                 |

## Behaviour

- Never sanctioned: the server owner, members who can manage messages in the trap channel (administrators included) and those with an exempt role. Messages from bots, webhooks and the system are ignored.
- If the bot cannot ban the member (role too high, missing Ban Members permission), it only deletes the trap message and says so in the log.
- The reason written to the audit log is "Honeypot: message in #channel".
- If a log channel is set, each trigger is logged there: the author, the trap channel, the message quoted and the outcome of the sanction. Nobody is pinged. Keep this channel for staff: the message is quoted there whatever channel it came from.
- If a counter channel is set, the bot posts the "🍯 The honey pot" message there, edited on every catch, which counts the members caught and gives the date of the last catch. It appears at the first catch after the channel is chosen. If the bot loses its permissions in that channel, the message stays as it was and catches up at the first catch after they come back.
- The bot needs the Ban Members permission, and Manage Messages in the trap channels.

## Data kept

| Data                                                                              | Retention                                                                     |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Number of members caught, date of the last catch, counter message and channel IDs | No time limit, even when the module is disabled or the bot leaves the server. |
| Who was caught                                                                    | Not recorded.                                                                 |
