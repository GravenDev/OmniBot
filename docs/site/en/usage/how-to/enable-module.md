# Enable and configure a module

This guide shows you how to enable a module on your server, then set its options.

Before you start: you must be an administrator of the server.

## Enable the module

1. Run `/modules`. The list of modules appears, visible to you only.
2. Find the module. Use **Next ▶** and **◀ Previous** to change page.
3. Click **Enable**. The module switches to ✅.

If the module is marked 🚫 with a greyed-out **Unavailable** button, it cannot be enabled on this bot: the bot's operator must first get the intent shown under the module from Discord.

## Set its options

1. Run `/config` and pick the module in the `module` option. Only enabled modules are offered.
2. For each setting to change:
   - for a yes/no setting, click the switch on the right: green for yes, red for no;
   - for any other setting, click the blue button on the right, then type or pick the value.
3. If the panel has several pages, use **Next ▶** to see the other settings.

The panel shows the current value of each setting. The _(default)_ mark shows a setting nobody has changed yet.

For a duration, type a number followed by `s`, `m`, `h` or `d`: `30s`, `4h`, `1h30m`, `3d`.

For per-channel settings, see [Configure a module channel by channel](./channel-settings). For the list of a module's settings, see its page in the [module reference](../reference/modules/).
