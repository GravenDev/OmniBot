# Message Quote

|                   |                         |
| ----------------- | ----------------------- |
| Identifier        | `message-quote`         |
| Configuration     | `/config message-quote` |
| Privileged intent | Message Content         |
| Used by           | members (posted links)  |

When a member posts the link of a message from the server, the bot replies with a quote of that message, if the member can read it.

## Commands

No commands.

## Settings

| Setting             | Key                  | Type             | Default | Description                                                                      |
| ------------------- | -------------------- | ---------------- | ------- | -------------------------------------------------------------------------------- |
| Excluded channels   | `excludedChannels`   | List of Channel  | none    | Channels whose messages are never quoted, and where posted links are not quoted. |
| Excluded categories | `excludedCategories` | List of Category | none    | Categories whose channels are treated as excluded channels.                      |

## Behaviour

- Recognised links: `https://discord.com/channels/…`, including `ptb.`, `canary.` and `discordapp.com`.
- Each quote has its own frame, in the author's role colour (a light lavender without one): the author, the channel and the date in small print above the text, the author's avatar beside it, images and videos in a gallery, then embeds, stickers and the other files. Under a divider come the member who quotes and a **Go to message** button that opens the original. It looks like the starboard's reposts.
- A forwarded message is quoted with its forwarded content. A message without text shows its embeds, files or media; the quote says it has no text only when it has none of these. A forwarded message is marked "↪ Forwarded message".
- Only the first 3 distinct links of a message are taken into account.
- The quote pings nobody: neither the mentions in the quoted message nor the author of the link.
- Not quoted:
  - links to another server;
  - messages in a channel the member who posts the link cannot read (for a private thread: being a member of it or being able to manage threads);
  - messages in an NSFW channel, unless the link is posted in an NSFW channel;
  - quotes posted by the bot itself;
  - links between angle brackets (`<https://…>`), in code or under a spoiler;
  - messages in excluded channels, and links posted in an excluded channel;
  - links posted by bots.
- Images and videos under a spoiler stay blurred in the gallery, and a file under a spoiler is listed under a spoiler. If Discord refuses one of the media, the quote is posted without a gallery, its images and videos listed as links.
- The bot needs, in the channel of the link, View Channel, Send Messages (Send Messages in Threads for a thread) and Read Message History; without them, it does not reply.
- The **Delete** button, shown under the last quote, removes the quote. It is reserved for the member who posted the link, the authors of the quoted messages and members who can manage messages; others get a reply visible to them only.

## Data kept

| Data | Retention                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------ |
| None | The module stores nothing. Posted quotes stay on Discord until they are removed with **Delete** or by a moderator. |
