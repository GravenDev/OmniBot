# Services

Services hold the state and the dependencies (database, Discord, external APIs) shared across your module's commands, listeners, and interactions. Unlike modules, services are **not auto-discovered** — you import them directly where needed.

## What Is a Service

A service is code that holds **state** (a cache, a queue, a timer) or **dependencies** (the database, Discord, an external API) and that several parts of the module share. Make it a class declared with `declareService`, in `services/<name>.service.ts`.

Pure functions (parsing, formatting, scoring rules, building a message from data) are not services: keep them as plain exported functions, with no class and no `declareService`, in a file at the root of the module named after their job (`rules.ts`, `formatting.ts`). They are easier to read and to test that way. A file that mixes both is split: the pure part on one side, the part that reads or writes on the other.

There is no `domain/` or `business/` folder, and no layers on top: a module stays small, and what several modules share goes to `src/lib/`. When a module gathers many pure files (six or seven), group them in a folder named after their role, as `rendering/` does for images.

The starboard follows it: `eligibility.ts` (which messages may reach the board), `tally.ts` (counting the members who reacted) and `view.ts` (the message posted on the board) are pure and sit at the root of `src/modules/starboard/`; `services/` holds `reactions.service.ts`, which fetches the reactors from Discord for `tally.ts` to count, `store.service.ts`, which reads and writes the database, and `starboard.service.ts`, which ties them together behind a queue per message. Most other modules predate this rule: apply it to new code, and when a change reworks a module.

## Creating a Service

```typescript
// src/modules/greeter/services/user.service.ts

import prisma from "#lib/database.js";
import { declareService, type Service } from "#lib/service.js";

class UserService implements Service {
  async createUser(userId: string, username: string) {
    return await prisma.user.create({
      data: { userId, username },
    });
  }

  async getUser(userId: string) {
    return await prisma.user.findUnique({
      where: { userId },
    });
  }
}

export default declareService(new UserService());
```

The `Service` interface is currently empty, allowing maximum flexibility. `declareService()` tags the instance with `DeclarationType.Service` for consistency with the declared pattern.

## Using a Service

Services are imported and used in commands, listeners, or other services:

```typescript
// In a command
import userService from "../services/user.service.js";

async execute(interaction) {
  const user = await userService.getUser(interaction.user.id);
  // ...
}
```

## Real Example: Thread Creation Queue

The `thread-creator` module demonstrates a practical service pattern. Here's how it works:

### ThreadCreationQueue (`services/thread-creation-queue.service.ts`)

A per-guild FIFO queue with rate limiting for thread creation:

```typescript
export class ThreadCreationQueue implements Service {
  // Each guild has its own queue
  private readonly queues = new Map<string, ThreadJob[]>();
  private readonly recentCreations = new Map<string, number[]>();
  private readonly draining = new Set<string>();

  enqueue(guildId: string, job: ThreadJob): void {
    // Add job to guild's queue and start draining
  }

  private async pump(guildId: string): Promise<void> {
    // Process jobs at max 5 per 10 seconds per guild
    // Uses setTimeout to resume when the window frees up
  }
}

export default declareService(new ThreadCreationQueue());
```

The class is exported too, so that each test builds a fresh queue.

Key characteristics:

- **Per-guild isolation** — rate limits are tracked separately per guild
- **FIFO ordering** — jobs are processed in arrival order
- **In-memory only** — queue is lost on restart (intentional trade-off)
- **Non-blocking** — errors on individual jobs are logged without stopping the queue

### ThreadCreatorService (`services/thread-creator.service.ts`)

Coordinates thread creation:

```typescript
class ThreadCreatorService implements Service {
  scheduleThreadForMessage(
    message: Message,
    config: ConfigProvider<ThreadCreatorConfigSchema>
  ): void {
    // Check if message channel is in the configured channels
    // Generate thread name from template (generateThreadName)
    // Enqueue thread creation on the queue service
  }
}
```

The `ThreadCreatorService` is used by the `messageCreate` listener, which calls `scheduleThreadForMessage()` with the message and the module's config. The service handles channel checking, name generation, and queueing in one call.

The pure parts sit at the module root, as plain functions: `thread-name.ts` (`generateThreadName`, which replaces the variables `{messageAuthor}`, `{messageContent}` and `{timestamp}` and caps the name at Discord's 100 characters) and `creation-failures.ts` (`creationFailure`, which tells an expected refusal from Discord from a bug).

### Config Schema Integration

```typescript
// thread-creator.config.ts
export const threadCreatorConfigSchema = {
  channels: {
    name: "Monitored channels",
    description: "Channels where new messages are monitored (…)",
    type: [ConfigType.CHANNEL],
  },
  welcomeMessage: {
    name: "Welcome message",
    description: "Message automatically posted in each created thread.",
    type: ConfigType.STRING,
    defaultValue: "💬 Use this thread to discuss this topic!",
  },
  threadNameTemplate: {
    name: "Name template",
    description:
      "Thread name — variables: {messageAuthor}, {messageContent}, {timestamp}.",
    type: ConfigType.STRING,
    defaultValue: "Discussion - {messageAuthor}",
  },
} satisfies ConfigSchema;
```

## Best Practices

- **Single responsibility** — each service should focus on one concern
- **Testable** — export the class so unit tests can import it directly before `declareService`; alternatively keep it in a separate file and import the plain class for testing without Discord API calls
- **State inside the service** — keep it in the instance's private fields, not in module-level variables beside it
- **Import directly** — import the declared instance where needed
- **Use with Prisma** — services are the natural place for database operations

## Next Steps

- [Database](./database) for persistent data
- [Configuration](./configuration) for managing module settings
- [Commands](./commands) for creating slash commands
