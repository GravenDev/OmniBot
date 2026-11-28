# Thread Creator

|                   |                                     |
| ----------------- | ----------------------------------- |
| Identifier        | `thread-creator`                    |
| Configuration     | `/config thread-creator`            |
| Privileged intent | Message Content                     |
| Used by           | automatic, set up by administrators |

In the monitored channels, the bot opens a discussion thread under each new message and can post a welcome message in it.

## Commands

No commands.

## Settings

| Setting            | Key                  | Type            | Default                                     | Description                                                                                                                                                                                                                                             |
| ------------------ | -------------------- | --------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monitored channels | `channels`           | List of Channel | none                                        | Channels where a thread is created under each message. Empty list: nothing is monitored.                                                                                                                                                                |
| Welcome message    | `welcomeMessage`     | Text            | `💬 Use this thread to discuss this topic!` | Message posted in each created thread. The default follows the server language until it is changed.                                                                                                                                                     |
| Name template      | `threadNameTemplate` | Text            | `Discussion - {messageAuthor}`              | Thread name. Variables: `{messageAuthor}` (author's display name), `{messageContent}` (first 50 characters of the message), `{timestamp}` (date and time, `DD/MM HH:MM`, on the clock of the machine running the bot, which may not be your time zone). |

## Behaviour

- Only text channels are supported: not threads, voice channels, forums or announcement channels.
- Messages from bots are ignored.
- The thread name is cut at 100 characters, Discord's limit.
- At most 5 threads are created every 10 seconds per server. Beyond that, messages wait their turn, in order. This queue is lost when the bot restarts.
- No thread is created if the message was deleted in the meantime, if the message already has a thread, if the channel has reached its active thread limit or if the bot lacks the required permissions.
- If the bot can create the thread but not post in it, the thread is created without its welcome message.
- Disabling the module with `/modules` stops the monitoring without erasing the settings.

## Data kept

| Data | Retention                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------- |
| None | The module stores nothing. The created threads stay on Discord, under the control of the server's administrators. |
