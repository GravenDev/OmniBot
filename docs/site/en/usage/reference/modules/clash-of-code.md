# Clash of Code

|                   |                                           |
| ----------------- | ----------------------------------------- |
| Identifier        | `clash-of-code`                           |
| Configuration     | `/config clash-of-code`                   |
| Privileged intent | Message Content                           |
| Used by           | members (games), administrators (imports) |

Follows the [Clash of Code](https://www.codingame.com/multiplayer/clashofcode) games whose link a member posts, posts their results and keeps a wins leaderboard. Data is kept separately for each server. It comes from a public but undocumented CodinGame API: if CodinGame changes it, tracking stops.

## Commands

### `/coc leaderboard`

Access: everyone. Reply: public.

| Option | Required | Values                                                          | Description                    |
| ------ | -------- | --------------------------------------------------------------- | ------------------------------ |
| `mode` | no       | **All modes** (default), **Fastest**, **Shortest**, **Reverse** | Only count games of this mode. |
| `page` | no       | 1 or more                                                       | Page number. Default: 1.       |

Image of the leaderboard, 10 players per page, with **◀ Previous** and **Next ▶** buttons. Players are ranked by number of wins (1st place in a game), then by number of games (fewest first). A linked member who is not on the page sees their row below the table.

### `/coc profile`

Access: everyone. Reply: public.

| Option   | Required | Values                                        | Description                      |
| -------- | -------- | --------------------------------------------- | -------------------------------- |
| `member` | no       | member                                        | Member to look up. Default: you. |
| `player` | no       | CodinGame nickname already seen on the server | CodinGame nickname to look up.   |

Profile card: games, wins, win rate, average rank, average score, average time and rank on the wins leaderboard. `member` and `player` cannot be combined. Without an option, the card shows your linked account.

### `/coc link`

Access: everyone. Reply: visible to you only.

| Option   | Required | Values                                        | Description                                 |
| -------- | -------- | --------------------------------------------- | ------------------------------------------- |
| `player` | yes      | CodinGame nickname already seen on the server | Your CodinGame nickname, as seen in a game. |

Links your Discord account to a CodinGame player already seen in a game on the server. A player is linked to one member only, and a member to one player only: linking another player replaces the previous one. CodinGame offers no way to check that an account is yours.

### `/coc unlink`

Access: everyone. Reply: visible to you only.

No options.

Unlinks your CodinGame account. Your games stay recorded.

### `/coc-admin import`

Access: administrators. Reply: public.

| Option | Required | Values                   | Description             |
| ------ | -------- | ------------------------ | ----------------------- |
| `game` | yes      | text, 200 characters max | Link or id of the game. |

Imports a finished game and posts its result. This is the way to add a game whose link was not posted before it ended. A game already recorded on the server is refused.

### `/coc-admin import-channel`

Access: administrators. Reply: visible to you only.

| Option    | Required | Values                                       | Description        |
| --------- | -------- | -------------------------------------------- | ------------------ |
| `channel` | yes      | text channel, announcement channel or thread | Channel to search. |

Imports every finished game whose link was posted in the channel, without posting anything there. The reply shows the progress, then a summary: imported, already recorded, not finished, unknown to CodinGame, failed. One channel import at a time per server. The import stops after 13 minutes, or if CodinGame asks to wait more than 5 minutes: running the command again on the same channel picks up where it stopped, as long as the bot has not restarted.

### `/coc-admin unlink`

Access: administrators. Reply: visible to you only.

| Option   | Required | Values | Description       |
| -------- | -------- | ------ | ----------------- |
| `member` | yes      | member | Member to unlink. |

Unlinks a member's CodinGame account, for instance one claimed by mistake. No game is deleted.

## Settings

| Setting          | Key        | Type            | Default | Description                                                                       |
| ---------------- | ---------- | --------------- | ------- | --------------------------------------------------------------------------------- |
| Watched channels | `channels` | List of Channel | none    | Channels (and their threads) where game links are followed. Empty: every channel. |

## Behaviour

- When a member posts a game link (`https://www.codingame.com/clashofcode/clash/<id>`, result page included), the bot adds the ⏳ reaction and follows the game until it ends.
- When it ends, the bot removes the reaction and replies to the message with an image of the result (rank, player, score, time, and character count in Shortest mode) and the name of the winner or winners. The author of the link is mentioned without a notification, and nobody else.
- At most 3 games are followed per message. Ignored: links in code or under a spoiler, messages from bots.
- A link to a game already finished when it is posted is ignored. To add it, an administrator uses `/coc-admin import`.
- A game already recorded or already followed on the server is not followed a second time.
- A game that ended without starting, is unknown to CodinGame, is still running after 2 hours or is unreachable 10 times in a row is dropped: the reaction is removed and nothing is posted.
- A game being followed is picked up again after the bot restarts.

## Data kept

| Data                                                                                                      | Retention                                                                                |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Games (CodinGame id, mode, start date, IDs of the link's channel and message)                             | No time limit.                                                                           |
| Players (CodinGame ID, nickname and avatar ID) and results (rank, score, time, character count, language) | No time limit.                                                                           |
| Link between a player and your Discord account                                                            | Until `/coc unlink`, `/coc-admin unlink` or [`/privacy delete`](../core#privacy-delete). |
