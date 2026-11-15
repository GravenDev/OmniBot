# Tâches planifiées

Un module peut exécuter du code à heure fixe (un rapport nocturne, une synchronisation périodique avec une API externe) en déclarant des **tâches**. Le cœur les planifie avec [croner](https://github.com/Hexagon/croner) dès que le client Discord est prêt, et les arrête à l'extinction.

## Déclarer une tâche

```typescript
// src/modules/my-module/tasks.ts

import moduleService from "#core/services/module.service.js";
import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import type { MyModuleConfigSchema } from "./my-module.config.js";

export function myModuleTasks(module: Module<MyModuleConfigSchema>) {
  return [
    declareTask({
      id: "daily-report",
      schedule: "0 3 * * *", // tous les jours à 03:00 UTC
      runOnStart: false,
      async run(client) {
        // client est le client Discord prêt
        const guildIds = await moduleService.getActivatedGuildIds(module.id);
        // ...
      },
    }),
  ];
}
```

| Champ        | Description                                                                              |
| ------------ | ---------------------------------------------------------------------------------------- |
| `id`         | Identifiant, unique au sein du module. Le planificateur nomme la tâche `<module>:<id>`.  |
| `schedule`   | Expression cron, évaluée dans `timezone`. Une expression à 6 champs ajoute les secondes. |
| `timezone`   | Fuseau IANA de `schedule` (par ex. `Europe/Paris`). Optionnel, **UTC** par défaut.       |
| `runOnStart` | Exécute aussi la tâche une fois au démarrage du bot. Optionnel, `false` par défaut.      |
| `run`        | Le travail à faire. Reçoit le client Discord prêt.                                       |

Un module garde ses tâches dans un seul `tasks.ts`, à sa racine, exportées par une fonction qui les renvoie : elle reçoit le module quand les tâches en ont besoin (son id, sa configuration), rien sinon (`clashOfCodeTasks()`).

Enregistrez-les dans le `onLoad` du module, comme les commandes et les écouteurs :

```typescript
onLoad(_client, registry) {
  for (const task of myModuleTasks(myModule)) {
    registry.register(task);
  }
},
```

Les tâches qui purgent des données stockées ne s'enregistrent pas là : exportez-les du même `tasks.ts`, par une fonction à part quand le module a aussi d'autres tâches (`tempVoiceMaintenanceTasks()`), et renvoyez-les depuis `maintenanceTasks` du module, pour qu'elles tournent aussi pour un module écarté au démarrage (voir [Créer un module](./creating-a-module#cycles-de-vie)).

## Comportement

- **Globale, pas par serveur.** Une tâche s'exécute une seule fois pour tout le bot, quel que soit le nombre de serveurs. Pour agir sur les serveurs où le module est activé, passez `moduleService.getActivatedGuildIds(module.id)` à `forEachGuild` (`#lib/guild-loop.js`) et chargez la configuration de chacun avec `configService.getConfigForModuleIn(module, guild.id)`. Le module reste activé sur un serveur que le bot a quitté, pour que sa configuration revienne avec une nouvelle invitation : `forEachGuild` saute ce serveur, traite quelques serveurs à la fois et journalise l'échec d'un serveur sans arrêter les autres.

  ```typescript
  run: async (client) =>
    forEachGuild(
      client,
      await moduleService.getActivatedGuildIds(module.id),
      (guild) => announceIn(guild),
      { action: "post the announcement", logger }
    ),
  ```

- **Pas de chevauchement.** Si une exécution est encore en cours à l'échéance suivante, celle-ci est sautée.
- **Les erreurs sont contenues.** Une erreur levée par `run` est journalisée avec le nom de la tâche ; la tâche garde son planning et le bot continue de tourner.
- **Chaque exécution est journalisée** avec sa durée.
