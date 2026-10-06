# Tâches planifiées

Un module peut exécuter du code à heure fixe (un rapport nocturne, une synchronisation périodique avec une API externe) en déclarant des **tâches**. Le cœur les planifie avec [croner](https://github.com/Hexagon/croner) dès que le client Discord est prêt, et les arrête à l'extinction.

## Déclarer une tâche

```typescript
// src/modules/my-module/tasks/cleanup.task.ts

import { declareTask } from "#lib/task.js";

export default declareTask({
  id: "cleanup",
  schedule: "0 3 * * *", // tous les jours à 03:00 UTC
  runOnStart: false,
  async run(client) {
    // client est le client Discord prêt
  },
});
```

| Champ        | Description                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------- |
| `id`         | Identifiant, unique au sein du module. Le planificateur nomme la tâche `<module>:<id>`.      |
| `schedule`   | Expression cron, toujours évaluée en **UTC**. Une expression à 6 champs ajoute les secondes. |
| `runOnStart` | Exécute aussi la tâche une fois au démarrage du bot. Optionnel, `false` par défaut.          |
| `run`        | Le travail à faire. Reçoit le client Discord prêt.                                           |

Enregistrez la tâche dans le `onLoad` du module, comme les commandes et les écouteurs :

```typescript
onLoad(_client, registry) {
  registry.register(cleanupTask);
},
```

## Comportement

- **Globale, pas par serveur.** Une tâche s'exécute une seule fois pour tout le bot, quel que soit le nombre de serveurs. Pour agir sur les serveurs où le module est activé, listez-les avec `moduleService.getActivatedGuildIds(module.id)` et chargez la configuration de chacun avec `configService.getConfigForModuleIn(module, guildId)`.
- **Pas de chevauchement.** Si une exécution est encore en cours à l'échéance suivante, celle-ci est sautée.
- **Les erreurs sont contenues.** Une erreur levée par `run` est journalisée avec le nom de la tâche ; la tâche garde son planning et le bot continue de tourner.
- **Chaque exécution est journalisée** avec sa durée.
