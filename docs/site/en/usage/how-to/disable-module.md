# Disable a module

This guide shows you how to disable a module on your server.

Before you start: you must be an administrator of the server.

1. Run `/modules`.
2. Find the module, marked ✅.
3. Click **Disable**.

Most of the time, the module switches to ❌ at once. Its configuration and data are kept: when you enable it again, your settings are back.

A module marked 🚫 is unavailable: its button is greyed out and it cannot be disabled until the bot's operator gets back the permission it lacks from Discord (see [Unavailable modules](../explanation/modules#unavailable-modules)).

If a "Disable …?" warning shows up instead, disabling this module deletes data you cannot restore. This is the case for **Birthdays** and **Member anniversaries**. The warning says what will be deleted:

- to confirm, click **Disable and delete**;
- to keep the module and its data, click **Cancel**.
