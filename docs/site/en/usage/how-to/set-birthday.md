# Save your birthday

This guide shows you how to save your birthday so that the bot wishes it on the server.

Before you start: an administrator must have enabled the Birthdays module and set its announcement channel.

1. On the server, run `/birthday set` with the day in `day` and the month in `month`. For example, for 14 March: `day` set to **14**, `month` set to **March**.
2. To be counted in the statistics without being announced, add the `announce` option set to **False**.
3. The bot replies, to you only, with a "Birthday saved" sheet: the date, the channel where it will be announced and the members who share your date.

To change your mind about the announcement, click **Stop announcing my birthday** (or **Announce my birthday**) under the sheet. To see the sheet again later, run `/birthday show`. To delete your birthday, run `/birthday remove`.

Only the day and month are kept, never the year. Every command is in the [Birthdays module reference](../reference/modules/birthday).
