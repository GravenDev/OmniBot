# Privacy Policy

Last updated: June 2026

## Data Controller

OmniBot is an open-source project developed by the Graven - Développement community. The bot is self-hosted by server administrators who deploy it. Each instance operator is the data controller for their instance.

The source code is available at [github.com/GravenDev/OmniBot](https://github.com/GravenDev/OmniBot) under the GNU GPL v3 license.

## Data Collected

OmniBot collects only the data necessary for its operation:

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

## Data Storage

Data is stored in a PostgreSQL database managed by the bot instance operator. The database is not shared with any third party. The operator is responsible for securing their database instance.

## Data Retention

Configuration and activation data is retained for as long as the bot is active on a guild. When a module is uninstalled, its configuration data may be retained in the guild's configuration blob (configurable by instance operators). To request data deletion, contact the instance operator.

## Data Sharing

OmniBot does not share collected data with third parties. The only external service used is the Discord API, which receives data as part of normal bot operation (sending messages, responding to interactions, registering commands).

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

To exercise these rights, contact the operator of the bot instance you interact with.

## Changes to This Policy

This policy may be updated to reflect changes in data handling practices. Continued use of the bot after changes constitutes acceptance of the updated policy.

## Contact

For questions about this privacy policy, open an issue on the [GitHub repository](https://github.com/GravenDev/OmniBot/issues) or join the [Graven - Développement](https://discord.gg/graven) Discord server.
