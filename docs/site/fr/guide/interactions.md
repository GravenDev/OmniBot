# Interactions

Les interactions Discord permettent à votre module de réagir aux actions des utilisateurs sur des composants d'interface : boutons, menus déroulants et modales.

## Types d'interactions supportées

OmniBot supporte deux types d'interactions :

- **Message Component Interactions** : boutons, menus déroulants (select menus)
- **Modal Submit Interactions** : soumissions de formulaires modaux

## Structure des fichiers

```
src/modules/mon-module/
├── mon-module.module.ts
├── commands/
│   └── ma-commande.command.ts
└── interactions/
    ├── mon-bouton.button.ts
    ├── mon-menu.select.ts
    └── ma-modale.modal.ts
```

## API

```typescript
interface InteractionHandler<Interaction, ConfigType> {
  customId: string; // Identifiant unique
  requiresAdmin?: boolean; // Réservé aux admins
  check: (
    interaction,
    config // Garde de type
  ) => interaction is Interaction;
  execute: (
    interaction,
    args: string[],
    config // Fonction d'exécution
  ) => Promise<void>;
}
```

Le paramètre `config` est un `ConfigProvider` qui donne accès à la configuration du module (voir [Configuration](./configuration)).

Le paramètre `requiresAdmin` permet de réserver l'interaction aux administrateurs du serveur. La vérification est faite centralement par le système — aucun code supplémentaire n'est nécessaire.

## Création d'une interaction

### Bouton

```typescript
// src/modules/mon-module/interactions/confirm.button.ts

import { MessageFlags } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "confirm-action",
  check: (interaction) => interaction.isButton(),

  async execute(interaction, [actionId, userId]) {
    await interaction.reply({
      content: `Action ${actionId} confirmée pour l'utilisateur ${userId}`,
      flags: MessageFlags.Ephemeral,
    });
  },
});
```

### Menu déroulant

```typescript
// src/modules/mon-module/interactions/role-select.select.ts

import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "role-select",
  check: (interaction) => interaction.isStringSelectMenu(),

  async execute(interaction, [targetUserId]) {
    const selectedRoles = interaction.values;

    await interaction.reply({
      content: `Rôles ${selectedRoles.join(", ")} attribués à <@${targetUserId}>`,
      ephemeral: true,
    });
  },
});
```

### Modal

```typescript
// src/modules/mon-module/interactions/feedback.modal.ts

import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "feedback-modal",
  check: (interaction) => interaction.isModalSubmit(),

  async execute(interaction, [category]) {
    const feedback = interaction.fields.getTextInputValue("feedback-input");

    await interaction.reply({
      content: "Merci pour votre retour !",
      ephemeral: true,
    });
  },
});
```

## Système de Custom ID avec arguments

Le système permet de passer des arguments via le `customId` en utilisant le séparateur `:` :

```
customId:arg1:arg2:arg3
```

### Utilisation dans une commande

```typescript
import { ButtonBuilder, ButtonStyle } from "discord.js";

const button = new ButtonBuilder()
  .setCustomId(`confirm-action:delete:${userId}`)
  .setLabel("Confirmer")
  .setStyle(ButtonStyle.Danger);
```

Les arguments sont automatiquement extraits et passés au handler sous forme de tableau (`args`).

## Enregistrement dans le module

```typescript
// src/modules/mon-module/mon-module.module.ts
import confirmButton from "./interactions/confirm.button.js";
import roleSelect from "./interactions/role-select.select.js";

export default defineModule({
  onLoad(_client, registry) {
    registry.register(confirmButton);
    registry.register(roleSelect);
  },
});
```

## Gestion automatique de l'activation

Le système gère automatiquement l'activation et la désactivation des interactions :

- Les interactions ne fonctionnent que si le module est activé sur le serveur
- Aucun code supplémentaire nécessaire pour vérifier l'état du module
- Messages d'erreur automatiques si le module est désactivé
- Les interactions marquées `requiresAdmin: true` sont protégées automatiquement

## Bonnes pratiques

### Validation des arguments

```typescript
async execute(interaction, [userId, action]) {
  if (!userId || !action) {
    await interaction.reply({
      content: "Données manquantes. Veuillez réessayer.",
      ephemeral: true,
    });
    return;
  }
}
```

### Gestion des erreurs

```typescript
async execute(interaction, [targetId]) {
  try {
    await performRiskyOperation(targetId);
    await interaction.reply({ content: "Opération réussie !", ephemeral: true });
  } catch (error) {
    logger.error("Erreur:", error);
    await interaction.reply({
      content: "Une erreur s'est produite.",
      ephemeral: true,
    });
  }
}
```

### Types de réponses

```typescript
// Action instantanée
await interaction.reply({ content: "Fait !", ephemeral: true });

// Action longue
await interaction.deferReply({ ephemeral: true });
await longOperation();
await interaction.editReply({ content: "Terminé !" });

// Mise à jour du message (boutons)
await interaction.update({ content: "Mis à jour", components: [] });
```

## Prochaines étapes

- [Configuration](./configuration) pour gérer les paramètres du module
- [Commandes](./commands) pour créer des commandes slash
- [Écouteurs](./listeners) pour réagir aux événements Discord
