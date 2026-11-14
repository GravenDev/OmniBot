# Link your RNGdle account

This guide shows you how to link your Discord account to your [rngdle.com](https://www.rngdle.com) username, so that your rolls count in the server's leaderboards.

Before you start: an administrator must have enabled the RNGdle module on the server, and you need your rngdle.com username.

1. On the server, run `/rngdle link` with your RNGdle username in the `username` option.
2. The bot replies, to you only: "You are now linked to the RNGdle account `<username>`", with the number of rolls imported.
3. To see your profile, run `/rngdle profile`.

To get pinged in the evening when you have not rolled yet, run `/rngdle remind` with `enabled` set to **True**.

If the bot replies that no account has that name, check how your username is spelled on rngdle.com. If it replies that the username is already linked to another member and it really is yours, contact an administrator.

To change username, first run `/rngdle unlink`, then click **Unlink**: your rolls stored on this server are deleted. Then run `/rngdle link` with the new username.

All commands and options: [RNGdle module reference](../reference/modules/rngdle).
