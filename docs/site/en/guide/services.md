# Services

Services allow you to encapsulate business logic and reuse it across your module's commands, listeners, and interactions. Unlike modules, services are **not auto-discovered** — you import them directly where needed.

## Creating a Service

```typescript
// src/modules/greeter/services/user.service.ts

import { declareService, type Service } from "#lib/service.js";
import prisma from "#lib/database.js";

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

### ThreadCreationQueue (`services/thread-creation-queue.ts`)

A per-guild FIFO queue with rate limiting for thread creation:

```typescript
class ThreadCreationQueue implements Service {
  // Each guild has its own queue
  private queues = new Map<string, QueuedJob[]>();
  private pumps = new Map<string, boolean>();
  private timestamps = new Map<string, number[]>();

  enqueue(guildId: string, job: QueuedJob): void {
    // Add job to guild's queue and start processing
  }

  private pump(guildId: string): void {
    // Process jobs at max 5 per 10 seconds per guild
    // Uses setTimeout to schedule next batch when rate-limited
  }
}
```

Key characteristics:

- **Per-guild isolation** — rate limits are tracked separately per guild
- **FIFO ordering** — jobs are processed in arrival order
- **In-memory only** — queue is lost on restart (intentional trade-off)
- **Non-blocking** — errors on individual jobs are logged without stopping the queue

### ThreadCreatorService (`services/thread-creator.service.ts`)

Coordinates thread creation:

```typescript
class ThreadCreatorService implements Service {
  async scheduleThreadForMessage(
    message: Message,
    config: ConfigProvider
  ): Promise<void> {
    // Check if message channel is in the configured channels
    // Generate thread name from template
    // Enqueue thread creation
  }

  generateThreadName(template: string, message: Message): string {
    // Replace variables: {messageAuthor}, {messageContent}, {timestamp}
    // Cap at 100 characters (Discord limit)
  }
}
```

The `ThreadCreatorService` is used by the `messageCreate` listener, which calls `scheduleThreadForMessage()` with the message and the module's config. The service handles channel checking, name generation, and queueing in one call.

### Config Schema Integration

```typescript
// thread-creator.config.ts
config: {
  channels: {
    name: "Channels",
    description: "Channels to watch",
    type: [ConfigType.CHANNEL],
  },
  welcomeMessage: {
    name: "Welcome message",
    description: "Message posted in new threads",
    type: ConfigType.STRING,
    defaultValue: "💬 Use this thread to discuss this topic!",
  },
}
```

## Best Practices

- **Single responsibility** — each service should focus on one concern
- **Testable** — export the class so unit tests can import it directly before `declareService`; alternatively keep it in a separate file and import the plain class for testing without Discord API calls
- **No global state** — use class instances with proper encapsulation
- **Import directly** — import the declared instance where needed
- **Use with Prisma** — services are the natural place for database operations

## Next Steps

- [Database](./database) for persistent data
- [Configuration](./configuration) for managing module settings
- [Commands](./commands) for creating slash commands
