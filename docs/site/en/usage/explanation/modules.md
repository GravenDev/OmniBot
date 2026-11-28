# Modules, server by server

OmniBot is not an all-in-one bot that you accept as a whole. It is a set of independent modules, and each server picks the ones it wants.

## Why everything starts disabled

When the bot joins a server, no module runs. It posts a welcome message pointing to `/modules` and `/config`, and nothing else.

There are two reasons for this. First, a module acts on the server: it answers messages, posts announcements, creates threads or sanctions accounts. A server that asked for nothing should not see the bot start reacting on its own. Second, many modules keep data: scores, birthdays, statistics. By enabling them only on request, the bot collects nothing an administrator has not chosen.

## Enabled here, not elsewhere

Activation and configuration belong to each server. The same bot can run the 4h Game on one server and only Reports on another. Data follows the same rule: a score, an RNGdle account or a birthday saved on one server is not visible on another.

A module's commands only appear on a server once the module is enabled. The bot's core, on the other hand, is always there: it carries `/modules` and `/config` for administrators, `/pings` and `/privacy` for everyone.

## Disabling does not erase, as a rule

Disabling a module stops it: it no longer answers or posts anything. Its configuration and data are kept, and once enabled again it picks up where it left off. Only the clean-up goes on: data that reaches the end of its retention period is still deleted, and temporary voice channels are still removed once empty. The same logic applies when the bot leaves the server: the configuration is kept, and comes back if it is invited again.

Two modules are the exception: Birthdays and Member anniversaries. Birthdays are data each member entrusted to this server themselves. Recomputed seniorities depend on messages or members that may be gone. Keeping them after disabling would mean holding personal data with no use; deleting them cannot be undone. That is why `/modules` asks for confirmation before disabling them, when there is something to delete.

## Unavailable modules

Some modules need a "privileged intent": a permission Discord grants a bot case by case, to read message content (Message Content) or the member list (Server Members). Without it, the module could not work properly.

When the intent is missing, the module is not loaded, on any server. `/modules` shows it marked 🚫, with the missing intent. If it was already enabled on a server, it stays enabled and keeps its configuration: it resumes once Discord grants the intent and the bot restarts. This does not depend on the server's administrators, but on the bot's operator.
