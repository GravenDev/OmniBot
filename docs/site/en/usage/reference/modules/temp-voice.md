# Temporary Voice Channels

|                   |                                                     |
| ----------------- | --------------------------------------------------- |
| Identifier        | `temp-voice`                                        |
| Configuration     | `/config temp-voice`                                |
| Privileged intent | none                                                |
| Used by           | members (channels and panel), administrators (hubs) |

Joining a "hub" voice channel creates a temporary voice channel, moves the member into it and makes them its owner. The owner manages it from a control panel. The channel is deleted as soon as no member is left in it (bots do not count).

## Commands

No slash commands. The channel is managed from the control panel posted in its text chat.

### Control panel

Access: the channel's owner and members with the Manage Channels permission on that channel. **Claim the channel** is open to every member in the channel. Reply: visible to you only.

The panel shows the channel's name, its access mode, its limit, the number of invited and blocked members, and the owner. It updates on every change.

The **Who can join?** menu sets the access mode:

| Mode            | Effect                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Open**        | The category's permissions apply: everyone sees the channel and can join it.                                     |
| **Invite only** | The channel stays visible, but only the owner and invited members can join. Moderation roles are left untouched. |
| **Private**     | The channel is hidden: only the owner, invited members and moderators see it and can join.                       |

| Button                | Effect                                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name and limit**    | Prefilled form: channel name (1 to 100 characters) and user limit (0 to 99, 0 for none). Discord allows 2 renames per channel every 10 minutes: beyond that, the bot says when to try again.             |
| **Members**           | Shows who is in the channel, invited and blocked, with the **Invite**, **Block**, **Disconnect** (if someone else is in the channel) and **Remove from a list** (if anyone is invited or blocked) menus. |
| **Transfer**          | Gives the channel to a member in the channel who does not already own one.                                                                                                                               |
| **Delete**            | Asks for confirmation, saying how many members will be disconnected, then deletes the channel.                                                                                                           |
| **Claim the channel** | Only shown when the owner has left the channel. A member in the channel becomes its owner, unless they already own another one. The invited and blocked lists are kept.                                  |

| **Members** menu       | Effect                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Invite**             | Up to 10 members at a time. They can see and join the channel even when invite only or private. The **Let them know by DM** button (15 minutes) sends them the channel link by DM, at most once every 10 minutes per member. |
| **Block**              | Up to 10 members at a time. They can no longer see or join the channel, and are disconnected if inside. Moderators cannot be blocked.                                                                                        |
| **Disconnect**         | Removes members from the channel, without stopping them from coming back. Moderators cannot be disconnected.                                                                                                                 |
| **Remove from a list** | Removes members from the invited or blocked lists: their access follows the channel's mode again.                                                                                                                            |

The invited and blocked lists are limited to 25 members in total per channel.

## Settings

| Setting | Key    | Type                 | Default | Description                                                                                                                                                                                  |
| ------- | ------ | -------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hubs    | `hubs` | Per-channel settings | none    | For each hub voice channel: **Channel name**, the name of the channels created (1 to 100 characters, `{user}` replaced by the member's display name); **User limit (0-99)**, 0 for no limit. |

The bot refuses a hub that is itself a temporary channel, or in whose category it lacks one of these permissions: View Channel, Connect, Manage Channels, Manage Permissions, Move Members, Send Messages. Removing a hub does not delete the channels it already created.

## Behaviour

- The channel is created in the hub's category, with its permissions, bitrate and region. Its name and limit come from the hub, unless the member has remembered settings.
- The owner never gets more rights than they already have on the hub.
- A member who already owns a temporary channel and joins a hub is moved back to their channel. After a creation, they must wait 10 seconds before creating another one.
- If the bot cannot create the channel, the member is told in the hub's chat.
- Remembered settings: when the owner changes the name, the limit, the access mode or their lists, these settings carry over to their next channel. Changes made by a moderator are not remembered.
- Every 10 minutes, and when the bot starts, temporary channels empty for more than a minute are deleted. A channel emptied while the bot was offline therefore disappears when it comes back.
- When the module is disabled, existing channels stay and their panel no longer responds, but they are still deleted once empty.
- Deleting a hub by hand removes it from the configuration.

## Data kept

| Data                                                                                                        | Retention                                                                                           |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Open temporary channel: IDs of the channel, its hub and its owner, access mode, invited and blocked members | Deleted with the channel, when it empties or is deleted; if the bot is offline, when it comes back. |
| A member's remembered settings: name, limit, access mode, invited and blocked members                       | Deleted one year after the member last changed them or last created a channel.                      |

`/privacy delete` does not delete this data.
