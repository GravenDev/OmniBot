# Scheduled Tasks

A module can run code on a schedule — a nightly report, a periodic sync with an external API — by declaring **tasks**. The core schedules them with [croner](https://github.com/Hexagon/croner) once the Discord client is ready, and stops them on shutdown.

## Declaring a Task

```typescript
// src/modules/my-module/tasks/cleanup.task.ts

import { declareTask } from "#lib/task.js";

export default declareTask({
  id: "cleanup",
  schedule: "0 3 * * *", // every day at 03:00 UTC
  runOnStart: false,
  async run(client) {
    // client is the ready Discord client
  },
});
```

| Field        | Description                                                                        |
| ------------ | ---------------------------------------------------------------------------------- |
| `id`         | Identifier, unique within the module. The scheduler names the job `<module>:<id>`. |
| `schedule`   | Cron expression, always evaluated in **UTC**. A 6-field expression adds seconds.   |
| `runOnStart` | Also run once as soon as the bot starts. Optional, `false` by default.             |
| `run`        | The work to do. Receives the ready Discord client.                                 |

Register the task in the module's `onLoad`, like commands and listeners:

```typescript
onLoad(_client, registry) {
  registry.register(cleanupTask);
},
```

## Behavior

- **Global, not per guild.** A task runs once for the whole bot, whatever the number of guilds. To act on the guilds where the module is enabled, list them with `moduleService.getActivatedGuildIds(module.id)` and load each guild's configuration with `configService.getConfigForModuleIn(module, guildId)`.
- **No overlap.** If a run is still in progress when the next one is due, the next one is skipped.
- **Failures are contained.** An error thrown by `run` is logged with the task name; the task keeps its schedule and the bot keeps running.
- **Every run is logged** with its duration.
