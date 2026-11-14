# Your first steps with OmniBot

In this tutorial, we will enable a first module on your server, configure it, then watch it work. We use the **Sticky Messages** module: it keeps a message at the bottom of a channel.

You need:

- to be an administrator of the server;
- to have invited OmniBot to the server;
- a text channel where the bot can view the channel and send messages. A test channel is perfect.

## 1. Find the welcome message

When it arrives, the bot posts a message in the server's system channel: "Thanks for inviting me!". It tells you to start with `/modules`. That is what we will do.

If you cannot find it, never mind: it may have been sent as a direct message to the server owner. Go on to the next step.

If your server's language in Discord is French, this welcome message is in French. The bot's other messages stay in English, as in this tutorial, until you [change its language](../how-to/change-language).

## 2. Enable the module

In any channel, type `/modules` and send it.

The bot replies with the list of modules, visible to you only. A module that is not enabled is marked ❌. On a server where the bot has just arrived for the first time, no module is enabled yet.

Look for **Sticky Messages**. The list shows 5 modules per page: use **Next ▶** to move on. Click the module's green **Enable** button.

Notice that the module switches to ✅ and that its button turns red, **Disable**. The module is enabled on your server.

## 3. Open its configuration

Type `/config` and, in the `module` option, pick **Sticky Messages**.

The bot shows the "Settings · `Sticky Messages`" panel. It has a single setting, **Sticky messages**, with a blue button on the right. Click it.

An editor opens, visible to you only. It says "No channel configured yet".

## 4. Add a sticky message

Click **Add**. A form opens:

1. In **Channel**, pick your test channel.
2. In **Message**, write for example: `Welcome! Read the rules before posting.`
3. Submit.

The editor shows "The message now stays at the bottom of #your-channel". Your channel appears in the list.

## 5. Watch the module work

Go to your test channel. Your sticky message is already there, posted by the bot.

Now write any message in this channel, for example `Hello`.

The bot reposts the sticky message right below yours and deletes the old one. The sticky message is always the last one in the channel. Write a second message: it comes back to the bottom again.

## What you have done

You enabled a module with `/modules`, set it up with `/config` and checked that it works. Every other module is enabled and configured the same way.

To go further:

- [Enable and configure a module](../how-to/enable-module), for the other modules;
- [Disable a module](../how-to/disable-module), if you want to remove Sticky Messages from your test server;
- the [list of modules](../reference/modules/), to choose the next ones.
