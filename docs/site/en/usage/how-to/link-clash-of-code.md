# Link your Clash of Code account

This guide shows you how to link your Discord account to your CodinGame player, so that `/coc profile` finds you without an option and the leaderboard shows your row.

Before you start: an administrator must have enabled the Clash of Code module on the server, and you must have played at least one game whose link was posted on the server and followed by the bot.

1. On the server, run `/coc link`, then pick your CodinGame nickname from the list of the `player` option.
2. The bot replies, to you only: "Your account is now linked to **&lt;nickname&gt;**".
3. To see your profile, run `/coc profile`.

If the bot replies that no game of that player was recorded, play a game and post its link on the server before it ends, then try again. If it replies that the player is already linked to another member and it really is you, ask an administrator to unlink it.

To change player, run `/coc link` again with the other nickname: it replaces the previous one. To unlink, run `/coc unlink`; your games stay recorded.

All commands and options: [Clash of Code module reference](../reference/modules/clash-of-code).
