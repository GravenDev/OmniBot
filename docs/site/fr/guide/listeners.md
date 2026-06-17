# Écouteurs

Les écouteurs d'événements (listeners) permettent à votre module de réagir aux événements Discord en temps réel. Le système de modules active ou désactive automatiquement les écouteurs selon que le module est activé sur le serveur concerné.

## Créer un écouteur

```typescript
// src/modules/salut/listeners/message-create.listener.ts

import { declareEventListener } from "#lib/listener.js";

export default declareEventListener({
  eventType: "messageCreate",

  async execute(message, config) {
    if (message.author.bot) return;

    await message.reply("Bonjour !");
  },
});
```

### Interface EventListener

```typescript
interface EventListener {
  eventType: keyof ClientEvents; // Nom de l'événement Discord.js
  execute: (...args) => Promise<void>;
}
```

La fonction `execute` reçoit les arguments standards de l'événement Discord.js plus un `ConfigProvider | undefined` comme dernier paramètre. La configuration est disponible quand l'événement provient d'un contexte de serveur ; elle est `undefined` pour les événements en messages privés.

## Enregistrement dans le module

```typescript
// src/modules/salut/salut.module.ts
import messageListener from "./listeners/message-create.listener.js";

export default defineModule({
  onLoad(_client, registry) {
    registry.register(messageListener);
  },
});
```

## Système d'auto-activation

Quand vous enregistrez un écouteur, le chargeur (`listener-loader.ts`) l'enveloppe avec une logique d'activation automatique :

1. L'enveloppe extrait le `guildId` des arguments de l'événement
2. Elle recherche l'état d'activation du module dans la base de données pour ce serveur
3. Si le module est **désactivé**, l'écouteur retourne immédiatement (no-op)
4. Si le module est **activé**, elle récupère la configuration du module et appelle `execute()` avec la config comme dernier argument

Cela signifie que vous n'avez pas besoin de vérifier l'état du module ni de récupérer la configuration manuellement dans la plupart des cas.

### Cas particulier des messages privés

Pour les événements qui peuvent se produire en dehors d'un contexte de serveur (ex. `messageCreate` en MP), il n'y a pas de `guildId` à rechercher. Dans ce cas, l'enveloppe ne peut pas déterminer l'état d'activation, donc l'écouteur est exécuté avec `config: undefined`. Votre écouteur doit gérer ce cas :

```typescript
async execute(message, config) {
  // En MP, config est undefined — gérez-le gracieusement
  if (!config) {
    if (!message.guild) return; // Ignorer les MPs
    // Ou gérer le cas MP séparément
  }
}
```

## Intentions Discord

Votre module doit déclarer les intentions Gateway requises dans `defineModule()`. Elles sont agrégées au démarrage et transmises au client Discord.

```typescript
export default defineModule({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
```

De plus, les **intentions privilégiées** (`GuildMembers`, `GuildPresences`, `MessageContent`) doivent être activées dans le Discord Developer Portal sous Bot > Privileged Gateway Intents.

## Localisation

Les réponses des écouteurs peuvent utiliser `config.t()` pour des chaînes localisées. Fournissez les traductions dans les fichiers `i18n/` de votre module :

```typescript
async execute(message, config) {
  if (!config) return;
  await message.reply(config.t("messageBienvenue", { user: message.author.username }));
}
```

La locale du serveur est configurée via `/config core > locale`. Voir [Configuration → Localisation](./configuration#localisation) pour les détails.

## Bonnes pratiques

- **Filtrez tôt** — vérifiez les bots, MPs ou salons non pertinents au début de `execute()`
- **Utilisez des services** pour la logique complexe de traitement d'événements
- **Soyez attentif aux performances** — les événements à volume élevé comme `messageCreate` s'exécutent pour chaque message
- **Gérez les erreurs** — les erreurs non capturées dans les écouteurs sont attrapées et journalisées par le chargeur
- **Ne supposez pas que la configuration est disponible** — gérez le cas `undefined` pour les événements en MP

## Prochaines étapes

- [Configuration](./configuration) pour gérer les paramètres du module
- [Base de données](./database) pour le stockage persistant des données
- [Services](./services) pour organiser la logique métier
