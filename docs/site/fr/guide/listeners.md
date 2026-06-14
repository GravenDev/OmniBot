# Écouteurs

Les écouteurs d'événements (listeners) permettent à votre module de réagir aux événements Discord. Le système de modules gère automatiquement l'activation/désactivation des écouteurs selon l'état du module.

> **Important** : Pour les événements pouvant se produire en messages privés, vous devez gérer manuellement la vérification d'activation du module, car le système ne peut pas détecter automatiquement si le module est actif en dehors d'un serveur.

> **Intents Discord** : Assurez-vous d'ajouter les intents nécessaires dans `defineModule()` et dans votre configuration Discord Developer Portal.

## Déclaration d'un écouteur

```typescript
// src/modules/mon-module/listeners/message-create.listener.ts

import { declareEventListener } from "#lib/listener.js";

export default declareEventListener({
  eventType: "messageCreate",

  async execute(message, config) {
    // config est un ConfigProvider | undefined
    // Votre logique ici
  },
});
```

## Enregistrement dans le module

```typescript
// src/modules/mon-module/mon-module.module.ts
import messageListener from "./listeners/message-create.listener.js";

export default defineModule({
  onLoad(_client, registry) {
    registry.register(messageListener);
  },
});
```

Le système active ou désactive automatiquement l'écouteur selon que le module est installé sur le serveur concerné.

## Prochaines étapes

- [Configuration](./configuration) pour gérer les paramètres du module
- [Base de données](./database) pour les données persistantes
