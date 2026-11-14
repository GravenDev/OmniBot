# Modules

Every module is disabled by default. An administrator enables them with `/modules` and configures them with `/config <identifier>`.

| Module                                   | Identifier       | Privileged intent | What it does                                                                                                  |
| ---------------------------------------- | ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| [4h Game](./four-hour-game)              | `four-hour-game` | none              | A point when your message stays the last one in the game channel for the configured delay, and a daily point. |
| [Auto React](./autoreact)                | `autoreact`      | none              | Automatically adds a reaction to every new message in the configured channels.                                |
| [Birthdays](./birthday)                  | `birthday`       | Server Members    | Wishes the members' birthdays, and puts the birthday paradox to the test.                                     |
| [Clash of Code](./clash-of-code)         | `clash-of-code`  | Message Content   | Follows the Clash of Code games whose link is posted, posts their results and keeps a wins leaderboard.       |
| [Honeypot](./honeypot)                   | `honeypot`       | Message Content   | Softbans whoever posts in a trap channel, to catch spam bots and hacked accounts.                             |
| [LaTeX](./latex)                         | `latex`          | Message Content   | Renders LaTeX formulas as images.                                                                             |
| [Member anniversaries](./seniority)      | `seniority`      | Server Members    | Celebrates the members' anniversaries on the server, and the server's own.                                    |
| [Message Log](./message-log)             | `message-log`    | Message Content   | Logs deleted and edited messages in a staff channel.                                                          |
| [Message Quote](./message-quote)         | `message-quote`  | Message Content   | Quotes the Discord messages whose link is posted, for members allowed to read them.                           |
| [Reports](./reports)                     | `reports`        | Message Content   | Members report a message; moderators get an alert with actions.                                               |
| [RNGdle](./rngdle)                       | `rngdle`         | Message Content   | Tracks the members' rngdle.com rolls: leaderboards, profiles, server statistics.                              |
| [Server Stats](./server-stats)           | `server-stats`   | Server Members    | Counts the server's daily activity, posts a report every night and shows it on demand.                        |
| [Starboard](./starboard)                 | `starboard`      | Message Content   | Reposts the messages that get enough reactions in a dedicated channel.                                        |
| [Sticky Messages](./sticky)              | `sticky`         | none              | Keeps a message at the bottom of the configured channels by reposting it after every new message.             |
| [Temporary Voice Channels](./temp-voice) | `temp-voice`     | none              | Creates a voice channel for whoever joins a hub, managed by its owner from a panel, deleted once empty.       |
| [Thread Creator](./thread-creator)       | `thread-creator` | Message Content   | Automatically creates discussion threads under each new message in the configured channels.                   |

The commands of the bot's core (`/modules`, `/config`, `/pings`, `/privacy`) are in [Bot commands](../core).
