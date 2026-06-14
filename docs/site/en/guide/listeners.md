# Listeners

Event listeners allow your module to react to Discord events. The module system automatically activates/deactivates listeners based on the module's installation state.

> **Important**: For events that can occur in DMs (direct messages), you must manually check if the module is active, since the system cannot automatically detect module state outside of a guild.

> **Discord Intents**: Make sure to add the required intents in `defineModule()` and in your Discord Developer Portal configuration.

## Declaring a listener

```typescript
// src/modules/my-module/listeners/message-create.listener.ts

import { declareEventListener } from "#lib/listener.js";

export default declareEventListener({
  eventType: "messageCreate",

  async execute(message, config) {
    // config is a ConfigProvider | undefined
    // Your logic here
  },
});
```

## Registering in the module

```typescript
// src/modules/my-module/my-module.module.ts
import messageListener from "./listeners/message-create.listener.js";

export default defineModule({
  onLoad(_client, registry) {
    registry.register(messageListener);
  },
});
```

The system automatically enables or disables the listener based on whether the module is installed on the relevant guild.

## Next steps

- [Configuration](./configuration) for managing module settings
- [Database](./database) for persistent data
