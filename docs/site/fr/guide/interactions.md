# Interactions

Les interactions Discord permettent à votre module de réagir aux actions des utilisateurs sur les composants d'interface : boutons, menus de sélection (chaîne, utilisateur, rôle, salon) et modales.

## Types pris en charge

- **Message Component Interactions** : boutons, menus de sélection
- **Modal Submit Interactions** : soumissions de formulaires

## Structure des fichiers

```
src/modules/mon-module/
├── mon-module.module.ts
├── commands/
│   └── ma-commande.command.ts
└── interactions/
    ├── confirmer.button.ts
    ├── select-role.select.ts
    └── retour.modal.ts
```

## API InteractionHandler

```typescript
interface InteractionHandler {
  customId: string; // Préfixe pour la correspondance custom ID
  requiresAdmin?: boolean; // Restreindre aux administrateurs
  check: (
    interaction: CompatibleInteraction,
    config: ConfigProvider
  ) => interaction is TypeSpecifique;
  execute: (
    interaction: TypeSpecifique,
    args: string[],
    config: ConfigProvider
  ) => Promise<void>;
}
```

| Champ           | Requis | Description                                                                                              |
| --------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `customId`      | Oui    | Préfixe unique — comparé au début du `customId` de l'interaction                                         |
| `requiresAdmin` | Non    | Si `true`, seuls les utilisateurs avec la permission `Administrateur` peuvent utiliser cette interaction |
| `check`         | Oui    | Garde de type — affine le type d'interaction pour `execute`                                              |
| `execute`       | Oui    | Appelé quand l'interaction est déclenchée                                                                |

Le paramètre `config` est un `ConfigProvider` donnant accès à la configuration du module.

## Custom ID avec arguments

Le système supporte le passage d'arguments via le `customId` en utilisant `:` comme séparateur :

```
customId:arg1:arg2:arg3
```

Le dispatcher divise le `customId` de l'interaction sur `:`, utilise le premier segment pour la correspondance du gestionnaire, et passe les segments restants comme tableau `args`.

### Exemple : Bouton avec arguments

```typescript
// Commande qui crée le bouton
const button = new ButtonBuilder()
  .setCustomId(`confirmer-action:supprimer:${userId}`)
  .setLabel("Confirmer")
  .setStyle(ButtonStyle.Danger);
```

```typescript
// Gestionnaire d'interaction
export default declareInteractionHandler({
  customId: "confirmer-action",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),

  async execute(interaction, [action, cibleId]) {
    await interaction.reply({
      content: `Action "${action}" confirmée pour l'utilisateur ${cibleId}`,
      flags: MessageFlags.Ephemeral,
    });
  },
});
```

## Créer des interactions

### Bouton

```typescript
// src/modules/salut/interactions/confirmer.button.ts

import { MessageFlags } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "confirmer-action",
  check: (interaction) => interaction.isButton(),

  async execute(interaction, [actionId, userId]) {
    await interaction.reply({
      content: `Action ${actionId} confirmée pour l'utilisateur ${userId}`,
      flags: MessageFlags.Ephemeral,
    });
  },
});
```

### Menu de sélection

```typescript
// src/modules/salut/interactions/select-role.select.ts

import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "select-role",
  check: (interaction) => interaction.isStringSelectMenu(),

  async execute(interaction, [userIdCible]) {
    const rolesSelectionnes = interaction.values;
    await interaction.reply({
      content: `Rôles ${rolesSelectionnes.join(", ")} attribués à <@${userIdCible}>`,
      flags: MessageFlags.Ephemeral,
    });
  },
});
```

### Modale

```typescript
// src/modules/salut/interactions/retour.modal.ts

import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "retour-modal",
  check: (interaction) => interaction.isModalSubmit(),

  async execute(interaction, [categorie]) {
    const retour = interaction.fields.getTextInputValue("retour-input");
    await interaction.reply({
      content: "Merci pour votre retour !",
      flags: MessageFlags.Ephemeral,
    });
  },
});
```

## Restriction administrateur

Définissez `requiresAdmin: true` pour restreindre une interaction aux administrateurs du serveur :

```typescript
export default declareInteractionHandler({
  customId: "action-dangereuse",
  requiresAdmin: true,
  check: (interaction) => interaction.isButton(),

  async execute(interaction, args) {
    // Seuls les administrateurs peuvent arriver ici
    await interaction.reply({ content: "Action effectuée !", ephemeral: true });
  },
});
```

La vérification est effectuée **centralement** par le dispatcher d'interactions — pas besoin de vérifications de permission en ligne dans votre gestionnaire.

## Enregistrement

```typescript
// src/modules/salut/salut.module.ts
import confirmerBouton from "./interactions/confirmer.button.js";
import selectRole from "./interactions/select-role.select.js";

export default defineModule({
  onLoad(_client, registry) {
    registry.register(confirmerBouton);
    registry.register(selectRole);
  },
});
```

## Gestion de l'activation

Les interactions sont automatiquement liées à l'activation du module. Quand un module est désactivé sur un serveur, ses gestionnaires d'interactions ne font rien — le dispatcher les ignore. Aucun code supplémentaire nécessaire.

## Rafraîchissement du message de configuration

Lors de l'édition de la configuration via des menus de sélection éphémères, le message de configuration source (public) doit être mis à jour. Le système utilise `refreshSourceConfigMessage()` qui transmet l'ID du message source dans les arguments `customId` et réédite le message public après chaque modification.

## Bonnes pratiques

### Types de réponse

```typescript
// Réponse instantanée
await interaction.reply({ content: "Terminé !", ephemeral: true });

// Réponse différée (pour les opérations > 3 secondes)
await interaction.deferReply({ ephemeral: true });
await operationLongue();
await interaction.editReply({ content: "Fini !" });

// Mettre à jour le message source (pour les composants de message)
await interaction.update({ content: "Mis à jour", components: [] });
```

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
  // Continuer avec les arguments validés
}
```

### Gestion des erreurs

```typescript
async execute(interaction, [cibleId]) {
  try {
    await effectuerOperationRisquee(cibleId);
    await interaction.reply({ content: "Succès !", ephemeral: true });
  } catch (error) {
    logger.error("Erreur :", error);
    await interaction.reply({
      content: "Une erreur est survenue. Veuillez réessayer.",
      ephemeral: true,
    });
  }
}
```

## Prochaines étapes

- [Configuration](./configuration) pour gérer les paramètres du module
- [Commandes](./commands) pour créer des commandes slash
- [Écouteurs](./listeners) pour réagir aux événements Discord
