# Commandes

Ce guide explique comment créer des commandes slash Discord dans vos modules. Les commandes ne sont disponibles que si le module est activé sur le serveur où elles sont utilisées.

## Créer une commande

```typescript
// src/modules/salut/commands/bonjour.command.ts

import { SlashCommandBuilder } from "discord.js";
import { declareCommand } from "#lib/command.js";

export default declareCommand({
  data: new SlashCommandBuilder()
    .setName("bonjour")
    .setDescription("Dit bonjour !"),

  async execute(interaction) {
    await interaction.reply(`Bonjour, ${interaction.user.username} !`);
  },
});
```

### Interface Command

```typescript
interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandSubcommandBuilder
    | SlashCommandSubcommandGroupBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder;
  execute: (
    interaction: ChatInputCommandInteraction,
    config: ConfigProvider
  ) => Promise<void>;
  complete?: (
    interaction: AutocompleteInteraction,
    config: ConfigProvider
  ) => Promise<void>;
}
```

| Champ      | Requis | Description                                                       |
| ---------- | ------ | ----------------------------------------------------------------- |
| `data`     | Oui    | Définition de la commande slash (nom, description, options)       |
| `execute`  | Oui    | Appelé quand un utilisateur exécute la commande                   |
| `complete` | Non    | Appelé quand un utilisateur tape dans une option à autocomplétion |

### Accès à la configuration

Le paramètre `config` est un `ConfigProvider` qui donne accès à la configuration du module (voir [Configuration](./configuration)). Il est toujours injecté — même pour les modules sans schéma de configuration.

> [!NOTE]
> Dans les handlers `complete()` (autocomplétion), le `config` injecté provient actuellement du module **Cœur** plutôt que du module de la commande. Les valeurs de configuration spécifiques au module ne sont donc pas disponibles pendant l'autocomplétion — seule la configuration du module Cœur est accessible.

```typescript
async execute(interaction, config) {
  const salon = config.get("canalLog");
  const max = config.get("avertissementsMax");
  // ...
}
```

## Options et sous-commandes

### Options de base

```typescript
data: new SlashCommandBuilder()
  .setName("saluer")
  .setDescription("Saluer quelqu'un")
  .addUserOption((option) =>
    option.setName("cible").setDescription("Qui saluer").setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("message")
      .setDescription("Message personnalisé")
      .setMaxLength(200)
  );
```

### Autocomplétion

```typescript
export default declareCommand({
  data: new SlashCommandBuilder()
    .setName("couleur")
    .setDescription("Choisir une couleur")
    .addStringOption((option) =>
      option
        .setName("couleur")
        .setDescription("Choisissez une couleur")
        .setAutocomplete(true)
        .setRequired(true)
    ),

  async execute(interaction, config) {
    const couleur = interaction.options.getString("couleur", true);
    await interaction.reply(`Vous avez choisi ${couleur} !`);
  },

  async complete(interaction, config) {
    const couleurs = ["rouge", "vert", "bleu", "jaune", "violet"];
    const saisie = interaction.options.getFocused().toLowerCase();
    const filtrees = couleurs.filter((c) => c.startsWith(saisie));
    await interaction.respond(filtrees.map((c) => ({ name: c, value: c })));
  },
});
```

### Sous-commandes

```typescript
const builder = new SlashCommandBuilder()
  .setName("config")
  .setDescription("Commandes de configuration")
  .addSubcommand((sub) =>
    sub.setName("voir").setDescription("Voir la configuration")
  )
  .addSubcommand((sub) =>
    sub
      .setName("definir")
      .setDescription("Définir une valeur")
      .addStringOption((opt) =>
        opt.setName("cle").setDescription("Clé de config").setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("valeur")
          .setDescription("Valeur de config")
          .setRequired(true)
      )
  );
```

## Enregistrement et propagation

### Dans le module

```typescript
// src/modules/salut/salut.module.ts
import bonjourCommand from "./commands/bonjour.command.js";

export default defineModule({
  onLoad(_client, registry) {
    registry.register(bonjourCommand);
  },
});
```

### Développement vs Production

| Aspect                    | Développement (`NODE_ENV=development`)                                         | Production                                                           |
| ------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **Commandes du cœur**     | Enregistrées sur `DEV_GUILD_ID` (instantané)                                   | Globales (~1h de propagation)                                        |
| **Commandes des modules** | Resynchronisées à chaque démarrage sur `DEV_GUILD_ID` pour les modules activés | Enregistrées par serveur, uniquement en cas de changement de version |
| **Propagation**           | Instantanée (PUT unique)                                                       | Différée (globale) ou à la demande (par serveur)                     |

Le système de versionnage en production utilise le champ `activatedVersion` dans l'enregistrement `ModuleActivation` en base de données. Les commandes sont ré-enregistrées sur un serveur uniquement lorsque la version déclarée du module diffère de la version stockée. Cela évite des appels API inutiles à chaque redémarrage.

> `DEV_GUILD_ID` est **requis** en mode développement. Voir `.env.example`.

## Commandes du cœur

OmniBot fournit deux commandes intégrées dans le module **Cœur** (toujours actif, non désinstallable) :

| Commande           | Permission     | Description                                                    |
| ------------------ | -------------- | -------------------------------------------------------------- |
| `/modules`         | Administrateur | Liste tous les modules avec boutons d'activation/désactivation |
| `/config <module>` | Administrateur | Ouvre le panneau de configuration interactif d'un module       |

## Bonnes pratiques

- **Utilisez reply, deferReply ou editReply** de manière appropriée — différée pour les opérations de plus de 3 secondes
- **Utilisez les réponses éphémères** pour les réponses propres à un utilisateur (`flags: MessageFlags.Ephemeral`)
- **Gérez les erreurs** — enveloppez les opérations risquées dans try/catch et répondez avec un message convivial
- **Validez les valeurs des options** — utilisez la validation intégrée du builder (min/max length, min/max value, etc.)
