# Interactions

Discord interactions allow your module to react to user actions on UI components: buttons, select menus, and modals.

## Supported interaction types

OmniBot supports two types of interactions:

- **Message Component Interactions**: buttons, select menus
- **Modal Submit Interactions**: form submissions

## File structure

```
src/modules/my-module/
├── my-module.module.ts
├── commands/
│   └── my-command.command.ts
└── interactions/
    ├── my-button.button.ts
    ├── my-menu.select.ts
    └── my-modal.modal.ts
```

## API

```typescript
interface InteractionHandler<Interaction, ConfigType> {
  customId: string; // Unique identifier
  requiresAdmin?: boolean; // Admin-only
  check: (
    interaction,
    config // Type guard
  ) => interaction is Interaction;
  execute: (
    interaction,
    args: string[],
    config // Execution function
  ) => Promise<void>;
}
```

The `config` parameter is a `ConfigProvider` giving access to the module's configuration (see [Configuration](./configuration)).

The `requiresAdmin` flag restricts the interaction to guild administrators. The check is enforced centrally by the system — no additional code needed.

## Creating an interaction

### Button

```typescript
// src/modules/my-module/interactions/confirm.button.ts

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

### Select menu

```typescript
// src/modules/my-module/interactions/role-select.select.ts

import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "role-select",
  check: (interaction) => interaction.isStringSelectMenu(),

  async execute(interaction, [targetUserId]) {
    const selectedRoles = interaction.values;

    await interaction.reply({
      content: `Roles ${selectedRoles.join(", ")} assigned to <@${targetUserId}>`,
      ephemeral: true,
    });
  },
});
```

### Modal

```typescript
// src/modules/my-module/interactions/feedback.modal.ts

import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "feedback-modal",
  check: (interaction) => interaction.isModalSubmit(),

  async execute(interaction, [category]) {
    const feedback = interaction.fields.getTextInputValue("feedback-input");

    await interaction.reply({
      content: "Thank you for your feedback!",
      ephemeral: true,
    });
  },
});
```

## Custom ID with arguments

The system supports passing arguments through the `customId` using `:` as separator:

```
customId:arg1:arg2:arg3
```

### Usage in a command

```typescript
import { ButtonBuilder, ButtonStyle } from "discord.js";

const button = new ButtonBuilder()
  .setCustomId(`confirm-action:delete:${userId}`)
  .setLabel("Confirm")
  .setStyle(ButtonStyle.Danger);
```

Arguments are automatically extracted and passed to the handler as an array (`args`).

## Registering in the module

```typescript
// src/modules/my-module/my-module.module.ts
import confirmButton from "./interactions/confirm.button.js";
import roleSelect from "./interactions/role-select.select.js";

export default defineModule({
  onLoad(_client, registry) {
    registry.register(confirmButton);
    registry.register(roleSelect);
  },
});
```

## Automatic activation management

The system handles interaction activation/deactivation automatically:

- Interactions only work when the module is enabled on the guild
- No extra code needed to check module state
- Automatic error messages if the module is disabled
- Interactions marked `requiresAdmin: true` are auto-protected

## Best practices

### Argument validation

```typescript
async execute(interaction, [userId, action]) {
  if (!userId || !action) {
    await interaction.reply({
      content: "Missing data. Please try again.",
      ephemeral: true,
    });
    return;
  }
}
```

### Error handling

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

### Response types

```typescript
// Instant action
await interaction.reply({ content: "Done!", ephemeral: true });

// Long running action
await interaction.deferReply({ ephemeral: true });
await longOperation();
await interaction.editReply({ content: "Finished!" });

// Update message (buttons)
await interaction.update({ content: "Updated", components: [] });
```

## Next steps

- [Configuration](./configuration) for managing module settings
- [Commands](./commands) for creating slash commands
- [Listeners](./listeners) for reacting to Discord events
