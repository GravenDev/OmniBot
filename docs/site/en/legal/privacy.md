# Privacy Policy

Last updated: October 2026

## Data Controller

OmniBot is an open-source project developed by the Graven - Développement community. Anyone can host their own instance of the bot, and each instance operator is the data controller for their instance.

The official instance, the OmniBot application provided by Graven - Développement, is operated by the Graven - Développement team. To reach it, join the [Graven - Développement](https://discord.gg/graven) Discord server or open an issue on the [GitHub repository](https://github.com/GravenDev/OmniBot/issues).

The source code is available at [github.com/GravenDev/OmniBot](https://github.com/GravenDev/OmniBot) under the GNU GPL v3 license.

## Data Collected

OmniBot collects only the data necessary for its operation. Every module is disabled by default: the data specific to a module is only collected on the guilds where an administrator enabled it.

### Discord Identifiers

- **User IDs** — to associate configurations, actions, and permissions with users
- **Role IDs** — to store role references in module configurations
- **Channel IDs** — to store channel references in module configurations
- **Category IDs** — to store category references in module configurations
- **Guild (Server) IDs** — to store per-guild configurations and module activation states

### Configuration Data

- Module configuration values (strings, numbers, boolean toggles, enum selections) as defined by each module's schema
- Configuration is stored as JSON in the database

### Module Activation State

- Which modules are enabled or disabled on each guild
- The version at which each module was last installed

### Mention Preference

When a member turns off their mentions with `/pings`, the bot stores the guild ID and the member's ID, so it no longer notifies them in its announcements on that guild. The entry is deleted when the member turns their mentions back on.

### Reports

When a member reports a message with the Reports module, the bot stores:

- a copy of the reported message: its text, its edited version if the author edits it afterwards, and the name and link of its attachments and stickers;
- the IDs of the author, channel and message, and the date the message was sent;
- the ID of each member who reported it, with the reason they gave, if any;
- the moderators' decisions: moderator ID, sanction, reason and duration.

This copy lets moderators review the message even if its author edits or deletes it. The identity of the reporting members is only shown to moderators.

### Community Games

- **4-hour game**: each player's score, the history of their points (time held and date), the best time of each day, and the last message of the game channel (channel, message and author IDs, time sent).
- **RNGdle**: the RNGdle username a member links to their Discord account, their rolls downloaded from rngdle.com (number, score, badge count and date), their daily reminder subscription, and for each day whether they already got their verified card.
- **Clash of Code**: for each game whose link is posted, its CodinGame identifier, its mode, its start date and the channel and message IDs of the link; for each player, their CodinGame ID, nickname and avatar ID, and the Discord ID of the member who linked their account to it; for each participation, the rank, score, time, character count and language.

### Automatic Reactions

The Auto React module stores, for each configured channel, the emoji to add. It stores nothing about members.

### Honeypot

The Honeypot module stores, for each guild, the number of members caught by the trap, the date of the latest catch and the ID of the counter message and of its channel. It does not store who was caught.

### Sticky Messages

The Sticky Messages module stores, for each configured channel, the text of the sticky message written by an administrator and the ID of its last post. It stores nothing about members and does not read their messages: a new message only triggers the repost.

### Starboard

The Starboard module stores, for each reposted message, the IDs of the guild, of the original message, its channel and that channel's parent, and of the repost and its channel, along with the number of reactions per emoji. It does not store the text of the message nor who reacted to it: the repost, posted on the guild, holds the text, and the reactions are only read to count the members who reacted.

### Temporary Voice Channels

The Temporary Voice Channels module stores, for each open temporary channel, the IDs of the channel, its hub and its owner, its state (locked, hidden) and the IDs of the trusted and blocked members. For each member who customised their channel, it also stores the name, the limit, the state and these lists, to apply them again to their next channel.

### Activity Statistics

When the Server Stats module is enabled on a guild, the bot counts every day, per guild, the messages per channel, per member and per hour, the reactions per emoji, the members joining and leaving, and how many of the day's newcomers posted a message. Only counters are stored, along with the date tracking started on the guild, never message content nor who joined or left. These counters, totals and per-member message counts, never the identity of who joins or leaves, are deleted after a year. The daily report posted on the guild, and the report administrators, and the roles they allow, can display with `/server-stats`, may list the most active members; administrators can turn this off.

## Message Content Read Without Being Stored

Some modules read message content to work, without saving it to the database:

- **Message Log** keeps recent messages in memory, to post in the staff log channel the text of a deleted message, or the old and new versions of an edited message;
- **Honeypot** reads messages in the trap channels only, to post their text in the staff log channel when it sanctions their author;
- **Message Quote** reads the message whose link a member posts, to post a quote of it;
- **LaTeX** reads messages to find formulas and render them as images;
- **Thread Creator** can use the first 50 characters of a message in the name of the thread it creates;
- **RNGdle** reads messages in the RNGdle channel only, to recognize a pasted result and reply with a card;
- **Clash of Code** reads messages in the channels chosen by the administrators (every channel when none is chosen), to spot game links; at an administrator's request (`/coc-admin import-channel`), it also goes through a channel's history, using Discord's message search. Only the game identifier and the ID of the message that held it are kept;
- **Starboard** reads a message that gets reactions, to repost its author, text, images, embeds and the message it replies to in the starboard channel, never in a channel visible to people who cannot read the original one.

What these modules post stays on the Discord server, under the control of its administrators. The bot ignores messages from other bots, with four exceptions: Auto React also adds its reaction to them, Sticky Messages also reposts its message after them, both without reading them, Message Quote quotes a bot's message when a member posts its link, and Starboard reposts a bot's message when the administrators allow it.

## Data Storage

Data is stored in a PostgreSQL database managed by the bot instance operator. The database is not shared with any third party. The operator is responsible for securing their database instance.

## Data Retention

- **Module configuration and activation**: kept as long as the bot is on the guild. When the bot leaves a guild (kick or removal), they are deliberately kept so everything is restored automatically if the bot is re-invited. Disabling a module deletes neither its configuration nor its data: they remain subject to the periods below.
- **Reports**: a report is deleted, message copy included, 30 days after the message was last reported at the latest, whether it is closed or not. Each guild's administrators can shorten this period for closed reports. The deletion happens even when the module is disabled or the bot has left the guild.
- **Activity statistics**: counters are deleted after a year, a period that cannot be changed. The date tracking started is kept with no time limit.
- **RNGdle**: rolls, username and reminder subscription are kept until the member unlinks with `/rngdle unlink`, or an administrator unlinks them. The record of a claimed card is deleted two days later.
- **4-hour game**: scores and point history are kept until an administrator deletes the player's score.
- **Clash of Code**: games, players and their results are kept with no time limit, for the leaderboard's history. The link to a Discord account is removed when the member unlinks with `/coc unlink`, or an administrator unlinks them.
- **Mention preference and automatic reactions**: kept until the member, or an administrator, removes them.
- **Honeypot counter**: kept with no time limit, even when the module is disabled or the bot leaves the guild, like the configuration.
- **Sticky messages**: kept until an administrator removes them in `/config`, or the channel is deleted.
- **Starboard**: an entry is deleted with the original message, with its repost when it falls below the threshold and the administrators chose to remove it, when the original channel or thread is deleted (the repost is deleted too), or when the starboard channel is deleted. When a moderator deletes a repost, the entry is kept so that the message is never reposted. The bot only sees these deletions while the module is enabled and the bot is online: a message or channel deleted while the module is disabled, or while the bot is offline, leaves its entry and its repost in place. The guild's administrators can then delete the repost by hand.
- **Temporary voice channels**: a channel's entry is deleted with the channel, when it empties or is deleted; if the bot is offline at that moment, it is deleted when the bot comes back, even if the module was disabled in the meantime. A member's remembered settings are deleted one year after they last changed them or created a channel, even if the module is disabled.

Any member can delete the data the bot keeps about them on a guild themselves, at any time, with the `/privacy delete` command: their activity statistics, their game data (4-hour game, RNGdle, Clash of Code link) and their mention preference. Reports are not part of it: they stay with the moderators until they are deleted automatically. For any other deletion request, contact the instance operator.

## Data Sharing

OmniBot does not sell the collected data or share it with any third party. It does not use it for advertising, marketing analytics or to train artificial intelligence models.

The bot contacts four external services:

- **the Discord API**, which receives data as part of normal bot operation (sending messages, responding to interactions, registering commands);
- **rngdle.com**, for the RNGdle module: the bot sends it the linked RNGdle usernames to download their rolls, and fetches the site's score table;
- **rng.cubityfir.st**, for the RNGdle module: the bot sends it a roll number to get the list of its badges; for an unlinked member, that number is the one of the result they pasted;
- **codingame.com**, for the Clash of Code module: the bot sends it a game identifier, taken from the posted link, to get its result, and fetches the players' avatars from static.codingame.com.

No Discord identifier or message text is sent to rngdle.com, rng.cubityfir.st or codingame.com: only a game identifier and a roll number can come from a message.

## Open Source

As an open-source project, the complete source code is publicly available for audit. Users can:

- Review exactly what data is collected and how it is processed
- Self-host their own instance with full control over their data
- Modify the code to change data handling practices

## Your Rights

Depending on your jurisdiction, you may have the right to:

- Access your personal data
- Request deletion of your personal data
- Restrict or object to processing

To delete your data from a guild, use `/privacy delete`. To exercise the other rights, contact the operator of the bot instance you interact with; for the official instance, the Graven - Développement team.

## Changes to This Policy

This policy may be updated to reflect changes in data handling practices. Continued use of the bot after changes constitutes acceptance of the updated policy.

## Contact

For questions about this privacy policy, open an issue on the [GitHub repository](https://github.com/GravenDev/OmniBot/issues) or join the [Graven - Développement](https://discord.gg/graven) Discord server.
