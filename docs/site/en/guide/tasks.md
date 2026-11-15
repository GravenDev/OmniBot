# Scheduled Tasks

A module can run code on a schedule — a nightly report, a periodic sync with an external API — by declaring **tasks**. The core schedules them with [croner](https://github.com/Hexagon/croner) once the Discord client is ready, and stops them on shutdown.

## Declaring a Task

```typescript
// src/modules/my-module/tasks.ts

import moduleService from "#core/services/module.service.js";
import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import type { MyModuleConfigSchema } from "./my-module.config.js";

export function myModuleTasks(module: Module<MyModuleConfigSchema>) {
  return [
    declareTask({
      id: "daily-report",
      schedule: "0 3 * * *", // every day at 03:00 UTC
      runOnStart: false,
      async run(client) {
        // client is the ready Discord client
        const guildIds = await moduleService.getActivatedGuildIds(module.id);
        // ...
      },
    }),
  ];
}
```

| Field        | Description                                                                        |
| ------------ | ---------------------------------------------------------------------------------- |
| `id`         | Identifier, unique within the module. The scheduler names the job `<module>:<id>`. |
| `schedule`   | Cron expression, evaluated in `timezone`. A 6-field expression adds seconds.       |
| `timezone`   | IANA time zone of `schedule` (e.g. `Europe/Paris`). Optional, **UTC** by default.  |
| `runOnStart` | Also run once as soon as the bot starts. Optional, `false` by default.             |
| `run`        | The work to do. Receives the ready Discord client.                                 |

A module keeps its tasks in one `tasks.ts` at its root, exported as a function that returns them: it takes the module when the tasks need it (its id, its configuration), nothing otherwise (`clashOfCodeTasks()`).

Register them in the module's `onLoad`, like commands and listeners:

```typescript
onLoad(_client, registry) {
  for (const task of myModuleTasks(myModule)) {
    registry.register(task);
  }
},
```

Tasks that purge stored data are not registered there: export them from the same `tasks.ts`, by a function of their own when the module also has other tasks (`tempVoiceMaintenanceTasks()`), and return them from the module's `maintenanceTasks`, so that they also run for a module skipped at startup (see [Creating a Module](./creating-a-module#lifecycle-hooks)).

## Behavior

- **Global, not per guild.** A task runs once for the whole bot, whatever the number of guilds. To act on the guilds where the module is enabled, pass `moduleService.getActivatedGuildIds(module.id)` to `forEachGuild` (`#lib/guild-loop.js`) and load each guild's configuration with `configService.getConfigForModuleIn(module, guild.id)`. The module stays enabled in a guild the bot has left, so that its configuration comes back with a new invite: `forEachGuild` skips such a guild, runs a few guilds at once, and logs a guild's failure without stopping the others.

  ```typescript
  run: async (client) =>
    forEachGuild(
      client,
      await moduleService.getActivatedGuildIds(module.id),
      (guild) => announceIn(guild),
      { action: "post the announcement", logger }
    ),
  ```

- **No overlap.** If a run is still in progress when the next one is due, the next one is skipped.
- **Failures are contained.** An error thrown by `run` is logged with the task name; the task keeps its schedule and the bot keeps running.
- **Every run is logged** with its duration.
