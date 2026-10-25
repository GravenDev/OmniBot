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

- a copy of the reported message: its text, its edited version if the author edits it afterwards, and the links to its attachments;
- the IDs of the author, channel and message, and the date the message was sent;
- the ID of each member who reported it, with the reason they gave, if any;
- the moderators' decisions: moderator ID, sanction, reason and duration.

This copy lets moderators review the message even if its author edits or deletes it. The identity of the reporting members is only shown to moderators.

### Community Games

- **4-hour game**: each player's score, the history of their points (time held and date), the best time of each day, and the last message of the game channel (channel, message and author IDs, time sent).
- **RNGdle**: the RNGdle username a member links to their Discord account, their rolls downloaded from rngdle.com (number, score, badge count and date), their daily reminder subscription, and for each day whether they already got their verified card.

### Automatic Reactions

The Auto React module stores, for each configured channel, the emoji to add. It stores nothing about members.

### Activity Statistics

When the Server Stats module is enabled on a guild, the bot counts every day, per guild, the messages per channel and per member, the reactions per emoji, and the members joining and leaving. Only counters are stored, never message content. These counters are deleted after 90 days. The daily report posted on the guild may list the most active members; administrators can turn this off.

## Message Content Read Without Being Stored

Some modules read message content to work, without saving it to the database:

- **Message Log** keeps recent messages in memory, to post in the staff log channel the text of a deleted message, or the old and new versions of an edited message;
- **Message Quote** reads the message whose link a member posts, to post a quote of it;
- **LaTeX** reads messages to find formulas and render them as images;
- **Thread Creator** can use the first 50 characters of a message in the name of the thread it creates;
- **RNGdle** reads messages in the RNGdle channel only, to recognize a pasted result and reply with a card.

What these modules post stays on the Discord server, under the control of its administrators. The bot ignores messages from other bots, except Auto React, which also adds its reaction to them without reading them.

## Data Storage

Data is stored in a PostgreSQL database managed by the bot instance operator. The database is not shared with any third party. The operator is responsible for securing their database instance.

## Data Retention

- **Module configuration and activation**: kept as long as the bot is on the guild. When the bot leaves a guild (kick or removal), they are deliberately kept so everything is restored automatically if the bot is re-invited. Disabling a module deletes neither its configuration nor its data: they remain subject to the periods below.
- **Reports**: an open report is kept until it is closed. A closed report is deleted, message copy included, after 90 days; each guild's administrators can change this period.
- **Activity statistics**: deleted after 90 days.
- **RNGdle**: rolls, username and reminder subscription are kept until the member unlinks with `/rngdle unlink`, or an administrator unlinks them. The record of a claimed card is deleted the next day.
- **4-hour game**: scores and point history are kept until an administrator deletes the player's score.
- **Mention preference and automatic reactions**: kept until the member, or an administrator, removes them.

To request deletion of your data, contact the instance operator.

## Data Sharing

OmniBot does not sell the collected data or share it with any third party. It does not use it for advertising, marketing analytics or to train artificial intelligence models.

The bot contacts three external services:

- **the Discord API**, which receives data as part of normal bot operation (sending messages, responding to interactions, registering commands);
- **rngdle.com**, for the RNGdle module: the bot sends it the linked RNGdle usernames to download their rolls, and fetches the site's score table;
- **rng.cubityfir.st**, for the RNGdle module: the bot sends it a roll number to get the list of its badges.

No Discord identifier or message content is sent to rngdle.com or rng.cubityfir.st.

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

To exercise these rights, contact the operator of the bot instance you interact with; for the official instance, the Graven - Développement team.

## Changes to This Policy

This policy may be updated to reflect changes in data handling practices. Continued use of the bot after changes constitutes acceptance of the updated policy.

## Contact

For questions about this privacy policy, open an issue on the [GitHub repository](https://github.com/GravenDev/OmniBot/issues) or join the [Graven - Développement](https://discord.gg/graven) Discord server.
