# Interactions

Discord interactions allow your module to react to user actions on UI components: buttons, select menus (string, user, role, channel), and modals.

## Supported Types

- **Message Component Interactions**: buttons, select menus
- **Modal Submit Interactions**: form submissions

## File Structure

```
src/modules/my-module/
├── my-module.module.ts
├── commands/
│   └── my-command.command.ts
└── interactions/
    ├── confirm.button.ts
    ├── role-select.select.ts
    └── feedback.modal.ts
```

## InteractionHandler API

```typescript
interface InteractionHandler {
  customId: string; // Prefix for custom ID matching
  requiresAdmin?: boolean; // Restrict to administrators
  check: (
    interaction: CompatibleInteraction,
    config: ConfigProvider
  ) => interaction is SpecificType;
  execute: (
    interaction: SpecificType,
    args: string[],
    config: ConfigProvider
  ) => Promise<void>;
}
```

| Field           | Required | Description                                                                    |
| --------------- | -------- | ------------------------------------------------------------------------------ |
| `customId`      | Yes      | Unique prefix — matched against the start of the interaction's `customId`      |
| `requiresAdmin` | No       | If `true`, only users with `Administrator` permission can use this interaction |
| `check`         | Yes      | Type guard — narrows the interaction type for `execute`                        |
| `execute`       | Yes      | Called when the interaction is triggered                                       |

The `config` parameter is a `ConfigProvider` giving access to the module's configuration.

## Custom ID with Arguments

The system supports passing arguments through the `customId` using `:` as a separator:

```
customId:arg1:arg2:arg3
```

The dispatcher splits the interaction's `customId` on `:`, uses the first segment for handler matching, and passes the remaining segments as the `args` array.

### Example: Button with Args

```typescript
// Command that creates the button
import { ButtonBuilder, ButtonStyle } from "discord.js";

const button = new ButtonBuilder()
  .setCustomId(`confirm-action:delete:${userId}`)
  .setLabel("Confirm")
  .setStyle(ButtonStyle.Danger);
```

```typescript
// Interaction handler
import { ButtonInteraction, MessageFlags } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "confirm-action",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),

  async execute(interaction, [action, targetId]) {
    await interaction.reply({
      content: `Action "${action}" confirmed for user ${targetId}`,
      flags: MessageFlags.Ephemeral,
    });
  },
});
```

## Creating Interactions

### Button

```typescript
// src/modules/greeter/interactions/confirm.button.ts

import { MessageFlags } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "confirm-action",
  check: (interaction) => interaction.isButton(),

  async execute(interaction, [actionId, userId]) {
    await interaction.reply({
      content: `Action ${actionId} confirmed for user ${userId}`,
      flags: MessageFlags.Ephemeral,
    });
  },
});
```

### Select Menu

```typescript
// src/modules/greeter/interactions/role-select.select.ts

import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "role-select",
  check: (interaction) => interaction.isStringSelectMenu(),

  async execute(interaction, [targetUserId]) {
    const selectedRoles = interaction.values;
    await interaction.reply({
      content: `Roles ${selectedRoles.join(", ")} assigned to <@${targetUserId}>`,
      flags: MessageFlags.Ephemeral,
    });
  },
});
```

### Modal

```typescript
// src/modules/greeter/interactions/feedback.modal.ts

import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "feedback-modal",
  check: (interaction) => interaction.isModalSubmit(),

  async execute(interaction, [category]) {
    const feedback = interaction.fields.getTextInputValue("feedback-input");
    await interaction.reply({
      content: "Thank you for your feedback!",
      flags: MessageFlags.Ephemeral,
    });
  },
});
```

## Admin Gating

Set `requiresAdmin: true` to restrict an interaction to server administrators:

```typescript
export default declareInteractionHandler({
  customId: "dangerous-action",
  requiresAdmin: true,
  check: (interaction) => interaction.isButton(),

  async execute(interaction, args) {
    // Only admins can reach this point
    await interaction.reply({ content: "Action performed!", ephemeral: true });
  },
});
```

The check is enforced **centrally** by the interaction dispatcher — no need for inline permission checks in your handler.

## Registration

```typescript
// src/modules/greeter/greeter.module.ts
import confirmButton from "./interactions/confirm.button.js";
import roleSelect from "./interactions/role-select.select.js";

export default defineModule({
  onLoad(_client, registry) {
    registry.register(confirmButton);
    registry.register(roleSelect);
  },
});
```

## Activation Management

Interactions are automatically tied to module activation. When a module is disabled on a guild, its interaction handlers are no-op — the dispatcher skips them. No extra code needed.

## Config Message Refresh

When editing configuration via ephemeral select menus, the source config message (public) needs to be updated. The system uses `refreshSourceConfigMessage()` which threads the source message ID through `customId` arguments and re-edits the public message after each change.

## Best Practices

### Response Types

```typescript
// Instant reply
await interaction.reply({ content: "Done!", ephemeral: true });

// Deferred reply (for operations > 3 seconds)
await interaction.deferReply({ ephemeral: true });
await longOperation();
await interaction.editReply({ content: "Finished!" });

// Update the source message (for message components)
await interaction.update({ content: "Updated", components: [] });
```

### Argument Validation

```typescript
async execute(interaction, [userId, action]) {
  if (!userId || !action) {
    await interaction.reply({
      content: "Missing data. Please try again.",
      ephemeral: true,
    });
    return;
  }
  // Proceed with validated args
}
```

### Error Handling

```typescript
async execute(interaction, [targetId]) {
  try {
    await performRiskyOperation(targetId);
    await interaction.reply({ content: "Success!", ephemeral: true });
  } catch (error) {
    logger.error("Error:", error);
    await interaction.reply({
      content: "An error occurred. Please try again.",
      ephemeral: true,
    });
  }
}
```

## Next Steps

- [Configuration](./configuration) for managing module settings
- [Commands](./commands) for creating slash commands
- [Listeners](./listeners) for reacting to Discord events
