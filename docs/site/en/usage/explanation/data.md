# The data the bot keeps

A bot that counts messages, keeps scores or quotes messages necessarily handles data about members. OmniBot tries to keep as little as possible, and to let everyone take theirs back.

## Nothing without an enabled module

The bot's core only keeps the server's configuration, the list of enabled modules and, for members who asked for it, their `/pings` preference. Everything else depends on the modules. Since they all start disabled, a server that enables nothing has no module data collected. Each module's details are in the "Data kept" section of its [reference](../reference/modules/) page.

## Reading is not keeping

Several modules read message content without storing it. Message Log keeps recent messages in memory, to post the text of a deleted message in a staff channel. Message Quote reads the message whose link is posted, to quote it. LaTeX reads messages to spot formulas. What they post stays on the server, under the control of its administrators.

When a module keeps something, it is often a counter rather than content. Server Stats counts messages per channel and per member, never their text, and does not record who joins or leaves. The Honeypot counts the accounts caught in the trap, without keeping which ones.

## Limited durations where possible

Some data disappears on its own: reports at most 30 days after the message's last report, activity counters after one year, a temporary voice channel's remembered settings one year after they were last used. Other data stays as long as it is useful: a game score or a leaderboard only makes sense if it lasts.

## Every member stays in control

A member does not need an administrator to erase what the bot knows about them. `/privacy delete` deletes, on the server where it is run, their statistics, game data, birthday (and today's birthday role), recomputed seniority and mention preference, whether the modules are enabled or not.

Some data is left out. Reports first: a report lets moderators judge a message, even if its author edited or deleted it. Letting the author, or the reporter, erase it would defeat the module's purpose. So they are deleted by the automatic purge, not on request. A temporary voice channel's remembered settings are not deleted either: they go on their own one year after they were last used. Finally, Clash of Code players and their results, which come from CodinGame, stay on the leaderboard: only their link to the member is removed.

The [privacy policy](../../legal/privacy) gives the full list, with the legal bases and the external services contacted.
