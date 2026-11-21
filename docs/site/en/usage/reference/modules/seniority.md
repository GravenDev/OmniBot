# Member anniversaries

|                   |                                      |
| ----------------- | ------------------------------------ |
| Identifier        | `seniority`                          |
| Configuration     | `/config seniority`                  |
| Privileged intent | Server Members                       |
| Used by           | administrators (settings, recompute) |

Every day, the bot celebrates the members who joined the server on a day like today one full year ago or more, and the anniversary of the server's creation. The members' join dates and the server's creation date come from Discord.

## Commands

### `/seniority-admin recompute`

Access: administrators. Reply: visible to you only.

| Option   | Required | Values | Description                          |
| -------- | -------- | ------ | ------------------------------------ |
| `member` | yes      | member | Member whose seniority to recompute. |

Counts a member's seniority from their first message on the server when it predates their current arrival: that is the case of a member who left and came back, whose join date Discord reset. The reply gives the date kept and the current arrival. The bot looks for that first message with Discord's message search, which is only open to applications with Message Content access; only the message's date is used. Only a member still on the server can be recomputed, never a bot. If Discord is still indexing the server's messages, the reply asks you to try again later.

## Settings

| Setting                    | Key                   | Type    | Default        | Description                                                                                                                                          |
| -------------------------- | --------------------- | ------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Announcement channel       | `channel`             | Channel | none           | Channel where member anniversaries are announced, and the server's anniversary unless it has its own. Unset: member anniversaries are not announced. |
| Server anniversary channel | `serverChannel`       | Channel | none           | Channel where the server's anniversary is announced. Unset: the announcement channel.                                                                |
| Time zone                  | `timeZone`            | Choice  | `Europe/Paris` | Time zone the server's days follow.                                                                                                                  |
| Announcement hour          | `hour`                | Number  | `9`            | Hour of the day (0 to 23) when the announcements are posted.                                                                                         |
| Member anniversaries       | `memberAnniversaries` | Boolean | on             | Announce the members who have been on the server for another full year.                                                                              |
| Server anniversary         | `serverAnniversary`   | Boolean | on             | Announce the anniversary of the server's creation.                                                                                                   |
| Loop the cards             | `loopCard`            | Boolean | on             | Replay the animated cards forever. Off: they play once.                                                                                              |

## Behaviour

- Every day, at the configured hour and time zone, the bot posts an animated card of the members celebrated, longest-standing first, then mentions them, one line per number of years ("**5 years** · @A @B"). Bots are left out.
- The mentions send no push notification. Members who turned their mentions off with [`/pings`](../core#pings) are not notified at all.
- On the anniversary of its creation, the bot posts the server's card: icon, creation date, member count and longest presence among the members.
- If a card cannot be posted (missing permission to attach files, for example), the announcement goes out as text only, with the same information.
- Discord resets the join date when a member leaves and comes back; `/seniority-admin recompute` corrects it. A recomputed seniority also counts for the longest presence on the server's card.
- A member who joined on 29 February is celebrated on the 28th in common years.
- A day's announcements are posted once. If the bot is down at the set hour, they are posted when the bot restarts the same day; a day missed entirely is not caught up.

## Data kept

| Data                                                                               | Retention                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Last day announced on the server                                                   | No time limit, replaced on every announcement day. No personal data.                                                                                                                                                           |
| Recomputed seniority: date it starts from, day the bot noticed the member had left | One year after the member's departure was noticed, cancelled if they come back. Deleted by [`/privacy delete`](../core#privacy-delete) or when the module is disabled. Kept if the bot leaves the server, until it comes back. |
