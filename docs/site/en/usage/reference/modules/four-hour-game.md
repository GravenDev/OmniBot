# 4h Game

|                   |                                         |
| ----------------- | --------------------------------------- |
| Identifier        | `four-hour-game`                        |
| Configuration     | `/config four-hour-game`                |
| Privileged intent | none                                    |
| Used by           | members (game), administrators (scores) |

In the game channel, the last message posted "holds": if no other member writes during the configured delay, its author scores a point. Each day, the message that stayed unanswered the longest earns a daily point, counted separately.

## Commands

### `/jd4h score`

Access: everyone. Reply: public.

| Option   | Required | Values | Description                      |
| -------- | -------- | ------ | -------------------------------- |
| `member` | no       | member | Member to look up. Default: you. |

Image of the player: points, points this month (UTC), longest hold, current streak and record, date of the last point, daily points and rank on the daily points leaderboard, rank on the server leaderboard. A member without any point gets a text message.

### `/jd4h leaderboard`

Access: everyone. Reply: public.

| Option | Required | Values                                    | Description        |
| ------ | -------- | ----------------------------------------- | ------------------ |
| `type` | no       | **4h points** (default), **Daily points** | Leaderboard shown. |

Image of the leaderboard, 10 players per page, with **◀ Previous** and **Next ▶** buttons. The row of the member who runs the command is highlighted, or added below the table. Members with 0 points are not listed.

### `/jd4h-admin set`

Access: administrators. Reply: visible to you only.

| Option   | Required | Values             | Description                |
| -------- | -------- | ------------------ | -------------------------- |
| `member` | yes      | member             | Member whose score to set. |
| `score`  | yes      | 1 to 1,000,000,000 | New score.                 |

Sets the score. The member's point history is kept.

### `/jd4h-admin unset`

Access: administrators. Reply: visible to you only.

| Option   | Required | Values | Description                   |
| -------- | -------- | ------ | ----------------------------- |
| `member` | yes      | member | Member whose score to remove. |

Removes the member's score, point history and daily points.

## Settings

| Setting      | Key       | Type     | Default | Description                                                                 |
| ------------ | --------- | -------- | ------- | --------------------------------------------------------------------------- |
| Game channel | `channel` | Channel  | none    | Channel where the game is played. Until it is set, the module does nothing. |
| Delay        | `delay`   | Duration | `4h`    | Time a message must stay the last one for its author to score a point.      |

## Behaviour

- A message from the author of the last message is ignored: you cannot restart your own delay.
- Once the delay has passed, the next message scores a point for the author of the previous one. The bot announces it in the channel: time held, new total, rank. Nobody is pinged.
- A deleted message no longer counts: the previous player message still in the channel takes its place.
- Ignored: messages from bots, system messages, messages in the channel's threads.
- Daily point: days follow Paris time. At midnight, the author of the message that stayed in place the longest that day wins the daily point, announced in the channel. The configured delay plays no part in the daily point.
- On restart, the bot rereads the channel to catch up on points scored while it was down.

## Data kept

| Data                                                                     | Retention                                                                     |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Score, point history (time held, date), daily points                     | Until `/jd4h-admin unset` or [`/privacy delete`](../core#privacy-delete).     |
| Best hold of each day                                                    | Same as above.                                                                |
| Last message of the game channel (channel, message and author IDs, time) | Replaced on every message. Erased by `/privacy delete` if you are its author. |
