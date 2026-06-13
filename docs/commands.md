# Commandes Discord

Ce guide explique comment créer des commandes Discord dans vos modules.
Ces commandes sont des interactions slash qui permettent aux utilisateurs d'interagir avec votre bot. Elles ne seront
disponibles que si le module est activé, et sur le serveur.

## Structure des Commandes

Les commandes Discord sont des interactions slash ("/") que les utilisateurs peuvent exécuter. Chaque commande doit être
définie dans un fichier séparé dans le dossier `commands/` de votre module.

### Structure de fichier

```
src/modules/mon-module/
├── module.ts
└── commands/
    └── ma-commande.command.ts
```

## Création d'une Commande

```typescript
// src/modules/mon-module/commands/test.command.ts
import { SlashCommandBuilder } from "discord.js";
import { declareCommand } from "../../../lib/command.js";

export default declareCommand({
  data: new SlashCommandBuilder()
    .setName("test")
    .setDescription("Commande de test"),

  async execute(interaction) {
    await interaction.reply("Test !");
  },
});
```

## Interface Command

La fonction `declareCommand` accepte un objet qui implémente l'interface `Command` :

- `data` : Configuration de la commande (SlashCommandBuilder)
- `execute` : Fonction d'exécution (obligatoire)
- `complete` : Fonction d'autocomplétion (optionnelle)

## Enregistrement dans le Module

```typescript
// src/modules/mon-module/mon-module.module.ts
import messageListener from "./commands/test.command.js";

export default defineModule({
  onLoad(client, registry) {
    // Le système gère automatiquement l'enregistrement et la désactivation des commandes
    registry.register(testCommand);
  },
});
```

## Enregistrement & propagation

L'enregistrement des commandes auprès de Discord dépend du type de commande et
du mode d'exécution :

| Commandes                        | Production                                                       | Développement (`NODE_ENV=development`)                                                                    |
| -------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **core** (`/config`, `/modules`) | globales (propagation jusqu'à ~1 h)                              | enregistrées sur `DEV_GUILD_ID` → **instantané**                                                          |
| **module**                       | par serveur, (ré)installées au changement de `version` du module | re-synchronisées **à chaque démarrage** sur `DEV_GUILD_ID` pour les modules activés, sans bump de version |

En production, le gate par version évite de re-pousser les commandes d'un module
sur toutes les guildes à chaque démarrage. En développement ce gate est une
friction (une seule guilde, itérations rapides) : `loadDevGuildCommands`
enregistre, en **un seul PUT** sur la dev guild, le core + les commandes de tous
les modules activés. Le PUT unique est nécessaire car il écrase l'ensemble des
commandes de la guilde — mélanger un PUT (core) et des POST (modules) sur le même
scope ferait disparaître les commandes POST.

> `DEV_GUILD_ID` est **requis** en mode dev (validé au démarrage). Voir
> `.env.example`.
