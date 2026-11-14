# RNGdle

|                   |                                           |
| ----------------- | ----------------------------------------- |
| Identifier        | `rngdle`                                  |
| Configuration     | `/config rngdle`                          |
| Privileged intent | Message Content                           |
| Used by           | members (game), administrators (accounts) |

Tracks the members' daily rolls on [rngdle.com](https://www.rngdle.com). Each member links their RNGdle username, then the bot downloads their rolls and builds leaderboards, profiles and statistics from them. Data is kept separately for each server.

## Commands

### `/rngdle leaderboard`

Access: everyone. Reply: public.

No options.

Image of today's rolls leaderboard (UTC), 25 players at most: number rolled, score, change since the day before and placement as a percentile. Three boxes sum up the day: average score, number of players and worst roll.

### `/rngdle profile`

Access: everyone. Reply: public.

| Option     | Required | Values                               | Description                      |
| ---------- | -------- | ------------------------------------ | -------------------------------- |
| `member`   | no       | member                               | Member to look up. Default: you. |
| `username` | no       | RNGdle username linked on the server | RNGdle username to look up.      |

Image of the profile: best and worst roll, average score, total score, current streak and record, badge record, rank on the overall leaderboard and breakdown by tier. `member` and `username` cannot be combined.

### `/rngdle history`

Access: everyone. Reply: public.

| Option     | Required | Values                               | Description                            |
| ---------- | -------- | ------------------------------------ | -------------------------------------- |
| `member`   | no       | member                               | Member to look up. Default: you.       |
| `username` | no       | RNGdle username linked on the server | RNGdle username to look up.            |
| `count`    | no       | 5 to 15                              | Number of rolls per page. Default: 10. |

Image of the player's latest rolls, newest first: date, number, score and placement. The **◀ Previous** and **Next ▶** buttons go back to older rolls.

### `/rngdle timeline`

Access: everyone. Reply: public.

| Option     | Required | Values                               | Description                      |
| ---------- | -------- | ------------------------------------ | -------------------------------- |
| `member`   | no       | member                               | Member to look up. Default: you. |
| `username` | no       | RNGdle username linked on the server | RNGdle username to look up.      |

Image of the player's timeline, from the month of their first roll: their MYTHIC, ANOMALY and TRASH rolls, compared with the expected number.

### `/rngdle trend`

Access: everyone. Reply: public.

| Option     | Required | Values                                           | Description                      |
| ---------- | -------- | ------------------------------------------------ | -------------------------------- |
| `member`   | no       | member                                           | Member to look up. Default: you. |
| `username` | no       | RNGdle username linked on the server             | RNGdle username to look up.      |
| `days`     | no       | **30 days**, **90 days** (default), **365 days** | Number of days covered.          |

Image of the player's recent form: best and worst roll, average score compared with the previous period, average placement, breakdown by tier and a chart of each roll's placement.

### `/rngdle server-stats`

Access: everyone. Reply: public.

No options.

Image of the server's statistics: best and worst roll of all time, number of rolls, average score, total score and breakdown by tier.

### `/rngdle leaderboard-all`

Access: everyone. Reply: public.

| Option   | Required | Values                                                | Description              |
| -------- | -------- | ----------------------------------------------------- | ------------------------ |
| `period` | no       | **All time** (default), **This month**, **This week** | Period ranked (UTC).     |
| `page`   | no       | 1 or more                                             | Page number. Default: 1. |

Image of the overall leaderboard, 10 players per page, with **◀ Previous** and **Next ▶** buttons. Players are ranked by index: total score ÷ (number of rolls + 20). A second table ranks players by their best roll. The row of the member who runs the command is added below the table if they are not on the page.

### `/rngdle versus`

Access: everyone. Reply: public.

| Option    | Required | Values | Description                  |
| --------- | -------- | ------ | ---------------------------- |
| `player1` | yes      | member | First player.                |
| `player2` | no       | member | Second player. Default: you. |

Image comparing the two players: total score, number of rolls, average score, best roll, badge record and head-to-head on the days both rolled. Both players must have linked their account.

### `/rngdle link`

Access: everyone. Reply: visible to you only.

| Option     | Required | Values                  | Description           |
| ---------- | -------- | ----------------------- | --------------------- |
| `username` | yes      | text, 64 characters max | Your RNGdle username. |

Links your Discord account to an RNGdle username and imports all its rolls. The username must exist on rngdle.com and not be linked to another member of the server. To change username, unlink first with `/rngdle unlink`. Run again with the same username, the command imports the new rolls.

### `/rngdle unlink`

Access: everyone. Reply: visible to you only.

No options.

Unlinks your account and deletes your rolls on this server, once you confirm with the **Unlink** button (or **Cancel**).

### `/rngdle remind`

Access: everyone. Reply: visible to you only.

| Option    | Required | Values              | Description                         |
| --------- | -------- | ------------------- | ----------------------------------- |
| `enabled` | yes      | **True**, **False** | Turns the daily reminder on or off. |

Signs you up for the daily reminder, or off it. You need a linked RNGdle account to sign up.

### `/rngdle-admin register`

Access: administrators. Reply: visible to you only.

| Option     | Required | Values                  | Description      |
| ---------- | -------- | ----------------------- | ---------------- |
| `member`   | yes      | member                  | Member to link.  |
| `username` | yes      | text, 64 characters max | RNGdle username. |

Links a member to an RNGdle username and imports all its rolls. A username is linked to one member only per server. Linking the member to another username deletes the old one's rolls.

### `/rngdle-admin delete`

Access: administrators. Reply: visible to you only.

| Option   | Required | Values | Description       |
| -------- | -------- | ------ | ----------------- |
| `member` | yes      | member | Member to unlink. |

Unlinks the member, deletes their rolls on this server and cancels their reminder.

### `/rngdle-admin show`

Access: administrators. Reply: visible to you only.

No options.

Lists the linked accounts on the server.

### `/rngdle-admin refresh`

Access: administrators. Reply: visible to you only.

| Option | Required | Values              | Description                                   |
| ------ | -------- | ------------------- | --------------------------------------------- |
| `full` | no       | **True**, **False** | Download every roll again, not only new ones. |

Downloads the server's new rolls right away. With `full`, downloads the whole history again, at most once every quarter of an hour.

### `/rngdle-admin clear`

Access: administrators. Reply: visible to you only.

No options.

Deletes the rolls stored on this server. They are downloaded again at the next sync.

## Settings

| Setting                 | Key                  | Type    | Default | Description                                                                                                            |
| ----------------------- | -------------------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| RNGdle channel          | `leaderboardChannel` | Channel | none    | Channel for the daily leaderboard and reminder, where members paste their results. Until it is set, nothing is posted. |
| Cards on shared results | `shareCards`         | Boolean | on      | Replies with a card when a member pastes their RNGdle result in the RNGdle channel.                                    |

## Behaviour

- Tiers: each roll is ranked by the percentile of its score among all rngdle.com rolls: TRASH (under 1%), COMMON (under 50%), UNCOMMON (under 75%), RARE (under 90%), EPIC (under 95%), ANOMALY (under 99%), MYTHIC.
- Rolls are downloaded at 06:00, 18:00 and 01:00 UTC, and at most every 5 minutes per server when an `/rngdle` command is run. If rngdle.com is slow, the command shows the data already stored after 10 seconds.
- Daily leaderboard: every day at 01:00 UTC, the bot posts the previous day's leaderboard in the RNGdle channel. The message names the best player or players, the number of players, the rarest roll, the worst roll and notable streaks. If downloading one server's rolls fails, the leaderboard and the reminder still go out, from the rolls already stored.
- Daily reminder: every day at 18:00 UTC, the bot pings in the RNGdle channel the members signed up for the reminder who have not rolled since midnight UTC. If nobody needs a reminder, nothing is posted.
- Members who turned off their pings with [`/pings`](../core#pings) are named without being pinged.
- Pasted result: when a member pastes the result shared by rngdle.com in the RNGdle channel, the bot replies with a card of the roll (score, tier, badges), without notifying. This also works for a member who has not linked an account; their card then says "Not connected". The bot reads message content in that channel only.
- A member gets at most one verified card per day (UTC). Later cards are drawn from the pasted text only.
- Messages from bots are ignored.

## Data kept

| Data                                                             | Retention                                                                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Linked RNGdle username, rolls (number, score, badge count, date) | Until `/rngdle unlink`, `/rngdle-admin delete` or [`/privacy delete`](../core#privacy-delete). `/rngdle-admin clear` deletes the rolls, which are then downloaded again. |
| Daily reminder sign-up                                           | Until `/rngdle remind` set to **False**, `/rngdle unlink`, `/rngdle-admin delete` or `/privacy delete`.                                                                  |
| Verified card received that day                                  | Deleted two days later, or by `/privacy delete`.                                                                                                                         |
