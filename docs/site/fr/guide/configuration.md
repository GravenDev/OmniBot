# Configuration

OmniBot fournit un système de configuration typée pour les modules. Chaque module peut déclarer un schéma de configuration qui est automatiquement exposé via une interface interactive Discord accessible aux administrateurs.

## Déclarer un schéma de configuration

Un module déclare son schéma dans `defineModule()` via la propriété `config` :

```typescript
// src/modules/mon-module/mon-module.module.ts

import { ConfigType } from "#lib/config.js";
import { defineModule } from "#lib/module.js";

export default defineModule({
  id: "mon-module",
  name: "Mon Module",
  description: "Description de mon module.",
  version: "1.0.0",

  config: {
    logChannel: {
      name: "Salon de logs",
      description: "Salon où poster les logs",
      type: ConfigType.CHANNEL,
    },
    maxWarnings: {
      name: "Avertissements max",
      description: "Nombre d'avertissements avant sanction",
      type: ConfigType.NUMBER,
      defaultValue: 3,
    },
    logLevel: {
      name: "Niveau de log",
      description: "Verbosité des logs",
      type: ConfigType.ENUM,
      options: ["debug", "info", "warn", "error"] as const,
      defaultValue: "info",
    },
  },

  onLoad(_client, registry) {
    // ...
  },
});
```

## Types de champs supportés

| Type       | Saisie                   | Stockage (JSON)  | Lecture           |
| ---------- | ------------------------ | ---------------- | ----------------- |
| `STRING`   | Modal (texte)            | `string`         | `string`          |
| `NUMBER`   | Modal (texte → nombre)   | `number`         | `number`          |
| `BOOLEAN`  | Bouton toggle            | `boolean`        | `boolean`         |
| `USER`     | Select menu utilisateur  | `string` (id)    | `User`            |
| `ROLE`     | Select menu rôle         | `string` (id)    | `Role`            |
| `CHANNEL`  | Select menu salon        | `string` (id)    | `Channel`         |
| `CATEGORY` | Select menu catégorie    | `string` (id)    | `CategoryChannel` |
| `ENUM`     | Select menu (choix fixe) | `string` (choix) | Union littérale   |

## Listes

N'importe quel type peut être déclaré en **liste** via `type: [ConfigType.X]` :

```typescript
config: {
  channels: {
    name: "Salons surveillés",
    description: "Salons à surveiller (un ou plusieurs)",
    type: [ConfigType.CHANNEL],    // Liste de salons
  },
  warnings: {
    name: "Avertissements",
    description: "Liste d'avertissements",
    type: [ConfigType.NUMBER],     // Liste de nombres
  },
}
```

Le type retourné par `config.get("channels")` est alors `Channel[]`.

## Type ENUM (choix fixe)

Le type `ENUM` permet de restreindre un champ à un ensemble fixe de valeurs :

```typescript
config: {
  theme: {
    name: "Thème",
    description: "Thème d'affichage",
    type: ConfigType.ENUM,
    options: ["clair", "sombre", "auto"] as const,
    defaultValue: "auto",
  },
  features: {
    name: "Fonctionnalités",
    description: "Fonctionnalités activées",
    type: [ConfigType.ENUM],        // Liste multi-choix
    options: ["welcome", "logs", "automod"] as const,
  },
}
```

- `options` est **obligatoire** sur une entrée `ENUM`
- L'utilisation de `as const` donne un typage précis : `config.get("theme")` retourne `"clair" | "sombre" | "auto"`
- Sans `as const`, le type retourné est `string`

## Valeurs par défaut

- Un champ **avec** `defaultValue` est toujours présent (`T`)
- Un champ **sans** `defaultValue` peut être `undefined` (`T | undefined`)
- Les entités Discord sont automatiquement désérialisées (du stockage par id vers l'objet Discord)

## Accès à la configuration

La configuration est accessible via le paramètre `config` dans les commandes, écouteurs et interactions :

```typescript
// Dans une commande
async execute(interaction, config) {
  const channel = config.get("logChannel");   // Channel | undefined
  const max = config.get("maxWarnings");      // number (a un defaultValue)
  const level = config.get("logLevel");       // "debug" | "info" | "warn" | "error"
}
```

## Interface administrateur

La commande `/config <module>` (réservée aux administrateurs) affiche un panneau de configuration interactif avec :

- La liste de tous les champs configurables, leur type et valeur courante
- Des boutons d'édition adaptés à chaque type (modal, toggle, select menu)
- Une pagination automatique si le module a plus de 10 champs configurables
- Barre de navigation si plusieurs pages

Les modifications sont persistées et prennent effet immédiatement.

## Bonnes pratiques

### Nommage des champs

- **Clé** : camelCase (`logChannel`, `maxWarnings`)
- **name** : lisible, affiché dans l'interface (`Salon de logs`)
- **description** : explique le rôle du champ

### Validation

La validation est automatique selon le type déclaré. Pour `ENUM`, seules les valeurs listées dans `options` sont acceptées.

## Prochaines étapes

- [Services](./services) pour organiser la logique métier
- [Base de données](./database) pour des données persistantes avancées
