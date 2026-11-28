# Server Stats

|                   |                                  |
| ----------------- | -------------------------------- |
| Identifier        | `server-stats`                   |
| Configuration     | `/config server-stats`           |
| Privileged intent | Server Members                   |
| Used by           | administrators and allowed roles |

Counts the server's daily activity, posts a report every night and shows it on demand. Only counters are stored, never the content of messages nor who joins or leaves.

## Commands

### `/server-stats today`

Access: administrators and allowed roles (`allowedRoles` setting). Reply: public.

No options.

Image of the report for the current day, counted live up to the time shown below the date (Paris time).

### `/server-stats day`

Access: administrators and allowed roles (`allowedRoles` setting). Reply: public.

| Option | Required | Values                                                                                                      | Description |
| ------ | -------- | ----------------------------------------------------------------------------------------------------------- | ----------- |
| `date` | yes      | today or one of the 365 previous days, picked in the list or typed as `2026-10-29`, `29/10/2026` or `29/10` | The day.    |

Image of the report for the chosen day. Without a year, `29/10` means the last time that day came round. A past day is compared with the previous days still kept.

### `/server-stats period`

Access: administrators and allowed roles (`allowedRoles` setting). Reply: public.

| Option | Required | Values                                                                                             | Description                              |
| ------ | -------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `days` | no       | **Last 7 days** (default), **Last 14 days**, **Last 30 days**, **Last 90 days**, **Last 365 days** | The last whole days, today excluded.     |
| `from` | no       | a date, as for `/server-stats day`                                                                 | First day. Default: the oldest day kept. |
| `to`   | no       | a date, as for `/server-stats day`                                                                 | Last day. Default: today.                |

Image of the report for several days added up. `days` cannot be combined with `from` or `to`. Active members and active channels count once over the period. A period shows no change and no record.

## Settings

| Setting                  | Key                      | Type             | Default | Description                                                                                                                                                                          |
| ------------------------ | ------------------------ | ---------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Report channel           | `reportChannel`          | Channel          | none    | Channel where the previous day's report is posted every night. Until it is set, nothing is posted.                                                                                   |
| Excluded channels        | `excludedChannels`       | List of Channel  | none    | Channels whose activity is not counted.                                                                                                                                              |
| Excluded categories      | `excludedCategories`     | List of Category | none    | Categories whose channels' activity is not counted.                                                                                                                                  |
| Include private channels | `includePrivateChannels` | Boolean          | off     | Also counts the channels that `@everyone` cannot see. Turn it on when `@everyone` sees no channel (access through a member role). Staff channels are then counted too: exclude them. |
| Allowed roles            | `allowedRoles`           | List of Role     | none    | Roles that can use `/server-stats`, besides administrators. Empty: administrators only.                                                                                              |
| Show most active members | `showTopMembers`         | Boolean          | on      | Lists the most active members in the report.                                                                                                                                         |

## Behaviour

- As soon as the module is enabled, the bot counts, per day (Paris time): messages per channel, per member and per hour, reactions added per emoji, members joining and leaving. Messages in a thread count for its parent channel.
- Not counted: bots, system messages, excluded channels and categories and, by default, channels that `@everyone` cannot see (private threads included). What happens while the bot is down is not counted.
- Daily report: every day at midnight (Paris time), the bot posts the previous day's image in the report channel: member count, new members and departures, messages, active members, reactions, the 5 most active channels and reactions, messages per hour and the 5 most active members.
- Once 7 days have been counted, messages, active members and reactions are compared with the average of the last 7 counted days. These three values and new members are flagged as a record when they beat every day kept, from 7 days of comparison and a value of at least 5.
- Nobody is pinged, neither in the daily report nor in `/server-stats` replies.
- `/server-stats` is visible to every member. A member without access gets a message visible to them only.
- Without the Server Members privileged intent, the module is unavailable on every server.

## Data kept

| Data                                                                                                              | Retention                                                                  |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Daily counters: messages per channel and per hour, reactions per emoji, joins, departures, new members who posted | Deleted after one year, even if the module is disabled.                    |
| Number of messages of each member per day                                                                         | Deleted after one year, or by [`/privacy delete`](../core#privacy-delete). |
| Date counting started on the server                                                                               | No time limit.                                                             |
