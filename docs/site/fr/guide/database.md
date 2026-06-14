# Base de données

OmniBot utilise [Prisma](https://www.prisma.io/) comme ORM avec une architecture de schéma multi-fichiers. Les modèles de base de données sont répartis entre les modules et consolidés au moment de la construction.

## Architecture

### Disposition des fichiers

```
src/
├── prisma/
│   ├── dbinfo.prisma          # Configuration du générateur + datasource
│   └── schema.prisma          # Schéma consolidé (auto-généré, ne pas éditer)
├── core/
│   └── models/
│       ├── config.prisma      # Modèle GuildConfiguration
│       └── modules.prisma     # Modèle ModuleActivation
└── modules/
    └── mon-module/
        └── models/
            └── mon-modele.prisma  # Modèles spécifiques au module
```

### Configuration de base (`dbinfo.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

## Ajouter un modèle à votre module

### 1. Créer le fichier `.prisma`

```
src/modules/mon-module/models/mon-modele.prisma
```

### 2. Définir votre modèle

```prisma
model MonModele {
  id        String   @id @default(cuid())
  userId    String
  nom       String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 3. Générer le client Prisma

```bash
pnpm prisma:generate
```

Ceci exécute le script de consolidation puis `prisma generate`.

### 4. Créer une migration

```bash
pnpm prisma:migrate
```

Ceci exécute la consolidation puis `prisma migrate dev`. Cela crée un nouveau fichier de migration dans `src/prisma/migrations/`.

## Système de consolidation

Au lieu de maintenir un seul fichier `schema.prisma` monolithique, le projet répartit les modèles dans des fichiers `*.prisma` dans chaque module. Le script de consolidation (`scripts/consolidate-schema.ts`) fusionne le tout :

1. Parcourt récursivement `src/` pour les fichiers `*.prisma` (sauf `src/prisma/` lui-même et `src/generated/`)
2. Extrait les modèles de chaque fichier
3. Les combine avec l'en-tête `dbinfo.prisma` dans `src/prisma/schema.prisma`
4. Ajoute des commentaires identifiant le fichier source de chaque modèle

### Commandes

```bash
pnpm prisma:consolidate   # Consolidation uniquement (pas de génération client)
pnpm prisma:generate      # Consolidation + génération du client Prisma
pnpm prisma:migrate       # Consolidation + création et application de migration
pnpm prisma:studio        # Consolidation + ouverture de Prisma Studio
```

> **Important** : Ne modifiez jamais `src/prisma/schema.prisma` directement. Éditez toujours le fichier `*.prisma` du module concerné et exécutez `pnpm prisma:consolidate` (ou `pnpm prisma:generate`).

## Modèles actuels

### ModuleActivation (`src/core/models/modules.prisma`)

```prisma
model ModuleActivation {
  moduleId         String
  guildId          String
  activated        Boolean
  activatedVersion String @default("")
  @@id([moduleId, guildId])
}
```

Suit quels modules sont activés sur quels serveurs et à quelle version. Utilisé par le système de versionnage pour l'enregistrement des commandes.

### GuildConfiguration (`src/core/models/config.prisma`)

```prisma
model GuildConfiguration {
  guildId String @id
  data    Json
}
```

Stocke toutes les configurations des modules sous forme d'un blob JSON par serveur. Le champ `data` contient la correspondance `moduleId → { clé: valeurSérialisée }`.

## Utiliser Prisma dans le code

```typescript
import prisma from "#lib/database.js";

// Exemples de requêtes
const activations = await prisma.moduleActivation.findMany({
  where: { guildId: interaction.guildId },
});

const config = await prisma.guildConfiguration.findUnique({
  where: { guildId: "123456789" },
});

// Création
await prisma.moduleActivation.create({
  data: {
    moduleId: "mon-module",
    guildId: "123456789",
    activated: true,
    activatedVersion: "1.0.0",
  },
});
```

Le client Prisma est un singleton exporté depuis `#lib/database.js`. Il est initialisé une fois au démarrage.

## Bonnes pratiques

- **Modèles du cœur** dans `src/core/models/`
- **Modèles spécifiques aux modules** dans `src/modules/<module>/models/`
- Utilisez le **PascalCase** pour les noms de modèles et le **camelCase** pour les champs
- Gardez les modèles ciblés — un fichier par entité logique ou petit groupe
- Exécutez toujours `pnpm prisma:generate` après avoir modifié un fichier `.prisma`
- Exécutez `pnpm prisma:migrate` en développement pour créer et appliquer les migrations

## Prochaines étapes

- [Services](./services) pour organiser les opérations base de données
- [Configuration](./configuration) pour le système de configuration générique
