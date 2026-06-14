# Listeners

Event listeners allow your module to react to Discord events in real time. The module system automatically activates or deactivates listeners based on whether the module is enabled on the relevant guild.

## Creating a Listener

```typescript
// src/modules/greeter/listeners/message-create.listener.ts

import { declareEventListener } from "#lib/listener.js";

export default declareEventListener({
  eventType: "messageCreate",

  async execute(message, config) {
    if (message.author.bot) return;

    await message.reply("Hello!");
  },
});
```

### Listener Interface

```typescript
interface EventListener {
  eventType: keyof ClientEvents; // Discord.js event name
  execute: (...args) => Promise<void>;
}
```

The `execute` function receives the standard Discord.js event arguments plus a `ConfigProvider | undefined` as the last parameter. The config is available when the event originates from a guild context; it's `undefined` for DM events.

## Registering in the Module

```typescript
// src/modules/greeter/greeter.module.ts
import messageListener from "./listeners/message-create.listener.js";

export default defineModule({
  onLoad(_client, registry) {
    registry.register(messageListener);
  },
});
```

## Auto-Activation System

When you register a listener, the loader (`listener-loader.ts`) wraps it with automatic activation logic:

1. The wrapper extracts `guildId` from the event arguments
2. It looks up the module's activation state in the database for that guild
3. If the module is **disabled**, the listener returns immediately (no-op)
4. If the module is **enabled**, it fetches the module's config and calls `execute()` with the config as the last argument

This means you don't need to check module state or fetch config manually in most cases.

### DM Edge Case

For events that can occur outside a guild context (e.g., `messageCreate` in DMs), there is no `guildId` to look up. In this case, the wrapper cannot determine activation state, so the listener is executed with `config: undefined`. Your listener should handle this:

```typescript
async execute(message, config) {
  // In DMs, config is undefined — handle gracefully
  if (!config) {
    if (!message.guild) return; // Ignore DMs
    // Or handle DM case separately
  }
}
```

## Discord Intents

Your module must declare the required gateway intents in `defineModule()`. These are aggregated at startup and passed to the Discord client.

```typescript
export default defineModule({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
```

Additionally, **privileged intents** (`GuildMembers`, `GuildPresences`, `MessageContent`) must be enabled in the Discord Developer Portal under Bot > Privileged Gateway Intents.

## Best Practices

- **Filter early** — check for bots, DMs, or irrelevant channels at the top of `execute()`
- **Use services** for complex event handling logic
- **Be mindful of performance** — high-volume events like `messageCreate` run on every message
- **Handle errors** — uncaught errors in listeners are caught and logged by the loader
- **Don't assume config is available** — handle the `undefined` case for DM events

## Next Steps

- [Configuration](./configuration) for managing module settings
- [Database](./database) for persistent data storage
- [Services](./services) for organizing business logic
