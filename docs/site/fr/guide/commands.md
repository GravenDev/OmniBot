# Commandes

Ce guide explique comment créer des commandes slash Discord dans vos modules. Les commandes ne sont disponibles que si le module est activé sur le serveur.

## Création d'une commande

```typescript
// src/modules/mon-module/commands/test.command.ts

import { SlashCommandBuilder } from "discord.js";
import { declareCommand } from "#lib/command.js";

export default declareCommand({
  data: new SlashCommandBuilder()
    .setName("test")
    .setDescription("Une commande de test"),

  async execute(interaction) {
    await interaction.reply("Test !");
  },
});
```

## Interface Command

```typescript
interface Command {
  data: SlashCommandBuilder; // Configuration de la commande
  execute: (
    // Fonction d'exécution (obligatoire)
    interaction,
    config
  ) => Promise<void>;
  complete?: (
    // Autocomplétion (optionnelle)
    interaction,
    config
  ) => Promise<void>;
}
```

Le paramètre `config` est un `ConfigProvider` qui donne accès à la configuration du module (voir [Configuration](./configuration)).

## Enregistrement dans le module

```typescript
// src/modules/mon-module/mon-module.module.ts
import testCommand from "./commands/test.command.js";

export default defineModule({
  onLoad(_client, registry) {
    registry.register(testCommand);
  },
});
```

## Enregistrement et propagation

| Commandes                        | Production                                                       | Développement (`NODE_ENV=development`)                                              |
| -------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **core** (`/config`, `/modules`) | Globales (propagation ~1 h)                                      | Enregistrées sur `DEV_GUILD_ID` — **instantané**                                    |
| **module**                       | Par serveur, (ré)installées au changement de `version` du module | Re-synchronisées **à chaque démarrage** sur `DEV_GUILD_ID` pour les modules activés |

En production, le versionnage évite de re-pousser les commandes d'un module sur toutes les guildes à chaque démarrage. En développement, les commandes sont enregistrées en un seul PUT sur la guild de développement, ce qui est instantané.

> `DEV_GUILD_ID` est **requis** en mode développement. Voir `.env.example`.
