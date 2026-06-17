# Configuration

OmniBot fournit un système de configuration typé pour les modules. Chaque module peut déclarer un schéma de configuration qui est automatiquement exposé via une interface Discord interactive, accessible aux administrateurs via `/config <module>`.

## Déclarer un schéma

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
    canalLog: {
      name: "Salon de logs",
      description: "Salon où poster les logs",
      type: ConfigType.CHANNEL,
    },
    avertissementsMax: {
      name: "Avertissements max",
      description: "Nombre d'avertissements avant sanction",
      type: ConfigType.NUMBER,
      defaultValue: 3,
    },
    niveauLog: {
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

## Types de champs

### Types supportés

| Type       | Saisie                          | Stockage (JSON)  | Lecture (désérialisé) |
| ---------- | ------------------------------- | ---------------- | --------------------- |
| `STRING`   | Modale (saisie texte)           | `string`         | `string`              |
| `NUMBER`   | Modale (texte → nombre)         | `number`         | `number`              |
| `BOOLEAN`  | Bouton toggle                   | `boolean`        | `boolean`             |
| `USER`     | Menu de sélection utilisateur   | `string` (id)    | `User`                |
| `ROLE`     | Menu de sélection rôle          | `string` (id)    | `Role`                |
| `CHANNEL`  | Menu de sélection salon         | `string` (id)    | `Channel`             |
| `CATEGORY` | Menu de sélection catégorie     | `string` (id)    | `CategoryChannel`     |
| `ENUM`     | Menu de sélection (choix fixes) | `string` (choix) | Union littérale       |

### Listes

N'importe quel type peut être déclaré en **liste** via `type: [ConfigType.X]` :

```typescript
config: {
  salons: {
    name: "Salons surveillés",
    description: "Salons à surveiller",
    type: [ConfigType.CHANNEL],    // Liste de salons
  },
  scores: {
    name: "Scores",
    description: "Liste des meilleurs scores",
    type: [ConfigType.NUMBER],     // Liste de nombres
  },
}
```

L'édition des listes dépend du type d'élément :

- **Entités** (`USER`, `ROLE`, `CHANNEL`, `CATEGORY`) : menus multi-sélection natifs
- **ENUM** : menu multi-sélection avec les options déclarées
- **Scalaires** (`STRING`, `NUMBER`) : éditeur dédié ajouter/supprimer
- **`BOOLEAN`** : éditeur ajouter/supprimer avec boutons toggle

### Type ENUM (choix fixes)

Le type `ENUM` restreint un champ à un ensemble fixe de valeurs :

```typescript
config: {
  theme: {
    name: "Thème",
    description: "Thème d'affichage",
    type: ConfigType.ENUM,
    options: ["clair", "sombre", "auto"] as const,
    defaultValue: "auto",
  },
  fonctionnalites: {
    name: "Fonctionnalités",
    description: "Fonctionnalités activées",
    type: [ConfigType.ENUM],
    options: ["accueil", "logs", "automod"] as const,
  },
}
```

- `options` est **requis** sur les entrées `ENUM` (imposé par le système de types)
- `as const` permet un typage précis : `config.get("theme")` retourne `"clair" | "sombre" | "auto"`
- Sans `as const`, le type retourné est `string`

## Valeurs par défaut

- Un champ **avec** `defaultValue` est toujours présent — le type est `T` (jamais `undefined`)
- Un champ **sans** `defaultValue` peut être `T | undefined` (jamais défini par l'administrateur)
- Les champs d'entités sans valeur par défaut retournent `undefined` (pas une valeur factice)

C'est une distinction importante — vérifiez toujours `undefined` pour les champs sans valeur par défaut.

## Accéder à la configuration

Le paramètre `config` est passé automatiquement aux commandes, écouteurs et interactions :

```typescript
async function handler(interaction, config) {
  const salon = config.get("canalLog"); // Channel | undefined
  const max = config.get("avertissementsMax"); // number (toujours présent)
  const niveau = config.get("niveauLog"); // "debug" | "info" | "warn" | "error"

  // Utilisation avec valeur par défaut
  const securise = config.get("canalLog") ?? salonParDefaut;
}
```

## Interface administrateur

### Commande `/config <module>`

- **Admin uniquement** (permission `Administrateur` requise)
- **Réponse publique** — la configuration est visible par tous (transparence)
- **Autocomplétion** sur le nom du module (cœur + modules activés)

Le panneau affiche :

- Tous les champs configurables avec leur type, description et valeur courante
- Des boutons d'édition adaptés à chaque type (toggle, modale, menu de sélection)
- Une pagination quand il y a plus de 10 champs (limite des 40 composants Discord)

### Flux d'édition

| Type de champ                         | Type d'éditeur                       | Persistance     | Mise à jour de l'interface          |
| ------------------------------------- | ------------------------------------ | --------------- | ----------------------------------- |
| `STRING`                              | Modale (saisie texte)                | À la soumission | Message public mis à jour sur place |
| `NUMBER`                              | Modale (saisie nombre)               | À la soumission | Message public mis à jour sur place |
| `BOOLEAN`                             | Bouton toggle                        | Au clic         | Message public mis à jour sur place |
| `USER`, `ROLE`, `CHANNEL`, `CATEGORY` | Menu select entité (éphémère)        | À la sélection  | Message public rafraîchi            |
| `ENUM`                                | Menu select chaîne (éphémère)        | À la sélection  | Message public rafraîchi            |
| Liste de scalaires                    | Éditeur ajouter/supprimer (éphémère) | À l'action      | Message public rafraîchi            |

**Éditeurs éphémères** (menus de sélection, éditeurs de listes) : ils rafraîchissent le message de configuration public après chaque modification en utilisant `refreshSourceConfigMessage()`. L'ID du message source est transmis via le `customId` des composants éphémères.

## Persistance

La configuration est stockée sous forme d'un blob JSON par serveur dans la table `GuildConfiguration` :

```prisma
model GuildConfiguration {
  guildId String @id
  data    Json   // Record<moduleId, { key: value }>
}
```

- Les IDs d'entités (utilisateur, rôle, salon) sont stockées sous forme de chaînes et **désérialisées** en objets Discord à la lecture
- Un cache en mémoire (`configCache`) évite les lectures base de données à chaque interaction
- Le cache est invalidé à chaque écriture

## Localisation

Les noms et descriptions des champs de configuration peuvent être traduits par locale via des fichiers i18n. Le système résout automatiquement les valeurs localisées en fonction de la locale configurée du serveur (`/config core > locale`).

### Traductions au niveau du module

Créez un dossier `i18n/` dans votre module avec un fichier JSON par locale :

```json
// i18n/fr.json
{
  "config.monChamp.name": "Mon Champ",
  "config.monChamp.description": "Description de mon champ."
}

// i18n/en.json
{
  "config.monChamp.name": "My Field",
  "config.monChamp.description": "Description of my field."
}
```

Les valeurs `name` et `description` dans le schéma TypeScript servent de valeurs par défaut en anglais — pas besoin de les dupliquer dans `en.json`.

### Utiliser config.t() pour les messages

Le `ConfigProvider` injecté dans les commandes, écouteurs et interactions expose une méthode `t()` pour les chaînes localisées :

```typescript
async execute(interaction, config) {
  const message = config.t("messageBienvenue", { user: interaction.user.username });
  await interaction.reply(message);
}
```

### Repli de namespace

Les clés sont résolues dans cet ordre :

1. Le namespace du module (ex. `thread-creator:messageBienvenue`)
2. Le namespace cœur (`core:messageBienvenue`)

Cela signifie que les chaînes d'interface communes comme `config.previous`, `config.next`, `config.toggle.enable` et les noms de types (`type.text`, `type.number`, etc.) sont fournies par le namespace cœur — vous n'avez à traduire que les chaînes spécifiques à votre module.

## Bonnes pratiques

- **Utilisez le camelCase pour les clés**, un `name` lisible et une `description` claire
- **Fournissez `defaultValue`** pour les champs qui doivent toujours avoir une valeur
- **Gardez les schémas ciblés** — trop de champs rend le panneau d'administration difficile à utiliser
- **Utilisez `as const`** sur les options ENUM pour des unions littérales type-safe
- **Vérifiez `undefined`** pour les champs sans valeur par défaut

## Prochaines étapes

- [Services](./services) pour organiser la logique métier
- [Base de données](./database) pour les données persistantes avancées
- [Commandes](./commands) pour créer des commandes slash
