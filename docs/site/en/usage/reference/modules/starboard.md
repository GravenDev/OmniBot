# Starboard

|                   |                                                |
| ----------------- | ---------------------------------------------- |
| Identifier        | `starboard`                                    |
| Configuration     | `/config starboard`                            |
| Privileged intent | Message Content                                |
| Used by           | members (reactions), administrators (settings) |

When enough different members react to a message with one of the configured emojis, the bot reposts it in the starboard channel. The repost's count then follows the reactions.

## Commands

No commands.

## Settings

| Setting             | Key                  | Type             | Default | Description                                                                            |
| ------------------- | -------------------- | ---------------- | ------- | -------------------------------------------------------------------------------------- |
| Starboard channel   | `channel`            | Channel          | none    | Channel of the reposts. Until it is set, nothing is reposted.                          |
| Emojis              | `emojis`             | List of Emoji    | ⭐      | Reactions counted, standard or custom.                                                 |
| Threshold           | `threshold`          | Number           | `3`     | Number of different members who must react. A value below 1 counts as 1.               |
| Self-star           | `selfStar`           | Boolean          | off     | Counts the reaction of the message's author.                                           |
| Ignore bots         | `ignoreBots`         | Boolean          | on      | Never reposts messages from bots and webhooks.                                         |
| Watched channels    | `allowedChannels`    | List of Channel  | none    | Only these channels and their threads are watched. Empty: every channel.               |
| Excluded channels   | `excludedChannels`   | List of Channel  | none    | Channels whose messages are never reposted.                                            |
| Excluded categories | `excludedCategories` | List of Category | none    | Categories whose channels' messages are never reposted.                                |
| Below threshold     | `belowThreshold`     | Choice           | `keep`  | When reactions fall below the threshold: `keep` keeps the repost, `remove` deletes it. |

## Behaviour

- Super reactions count like the others. A member who reacts with several of the emojis counts once. Bots never count, the message's author only with **Self-star**.
- The repost shows the author, the channel, the date, the text (1500 characters at most), images and videos, stickers, embeds, the list of other files, the message it replies to and the content of a forwarded message. It has the same layout as Message Quote's quotes, with a yellow accent: the author, the channel and the date in small print above the text, the author's avatar beside it, media in a gallery, then under a divider the counter and a **Go to message** button. A webhook's message is signed with the webhook's name, and a file under a spoiler is listed under a spoiler. Nobody is pinged.
- The count follows every reaction added or removed, and the repost follows edits of the original message. Reactions on the repost itself do not count.
- With `remove`, a repost deleted below the threshold can come back if the threshold is reached again.
- If the original message is deleted, its repost is deleted too. If a moderator deletes the repost, the message is never reposted again.
- Never reposted: messages from the starboard channel and its threads, system messages, the bot's own messages, messages from bots and webhooks (unless **Ignore bots** is off), messages from excluded or unwatched channels, messages from an NSFW channel to a starboard that is not NSFW, and messages from private threads.
- Channels restricted to a role are reposted like the others. For a channel never to show up on the starboard, add it to the excluded channels, or its category to the excluded categories for a forum, media channel or stage. Excluding a channel does not erase reposts already posted.
- If the bot cannot view the starboard channel or write in it, nothing is reposted. Changing the starboard channel leaves the old reposts in place, and their count keeps being updated.
- Deleting a channel, forum or thread deletes the reposts of its messages. Deleting the starboard channel forgets its reposts.
- These deletions are only seen while the module is enabled and the bot is online. Otherwise, the repost stays and can be deleted by hand.

## Data kept

| Data                                                                                                                                                     | Retention                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| For each reposted message: IDs of the original message, its channel and that channel's parent, the repost and its channel, number of reactions per emoji | Deleted with the original message, with its channel or thread, with the starboard channel, or with the repost when it falls below the threshold and **Below threshold** is `remove`. Kept if a moderator deletes the repost, so the message is not reposted again. |

The message text and the list of members who reacted are not stored.
