# Base de données

OmniBot utilise [Prisma](https://www.prisma.io/) comme ORM avec le schéma multi-fichiers de Prisma. Les modèles de base de données vivent dans chaque module, à côté de son code, et Prisma les lit tous depuis `src/`.

## Architecture

### Disposition des fichiers

```
src/
├── prisma/
│   ├── dbinfo.prisma          # Configuration du générateur + datasource
│   └── migrations/            # Historique des migrations SQL
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
  provider            = "prisma-client"
  output              = "../generated/prisma"
  runtime             = "nodejs"
  moduleFormat        = "esm"
  importFileExtension = "js"
}

datasource db {
  provider = "postgresql"
}
```

Le schéma ne contient aucune URL de connexion. Le CLI Prisma lit `DATABASE_URL` via `prisma.config.ts` (qui charge `.env` s'il existe), et le bot se connecte par l'adapter node-postgres de `src/lib/database.ts`.

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

Ceci exécute `prisma generate`.

### 4. Créer une migration

```bash
pnpm prisma:migrate
```

Ceci exécute `prisma migrate dev`, qui crée un nouveau fichier de migration dans `src/prisma/migrations/`, puis régénère le client : depuis Prisma 7, `migrate dev` ne le fait plus.

## Schéma multi-fichiers

`prisma.config.ts` fait lire `src/` à Prisma : tout fichier `*.prisma` en dessous, à n'importe quelle profondeur, fait partie d'un même schéma. Il n'y a ni étape de fusion ni fichier de schéma généré : éditez le fichier `*.prisma` du module, puis lancez les commandes ci-dessous.

- Les noms de modèles sont communs à tous les modules : deux modules ne peuvent pas déclarer chacun un `model Score`. Prisma signale le conflit en indiquant le fichier en cause.
- Tout fichier `*.prisma` sous `src/` est pris en compte, fixtures de test comprises : gardez ces fichiers hors de `src/`.
- Les migrations restent dans `src/prisma/migrations/`, à côté de `dbinfo.prisma` (`migrations.path` dans `prisma.config.ts`).

### Commandes

```bash
pnpm prisma:generate      # Génère le client Prisma
pnpm prisma:migrate       # Crée et applique une migration, puis régénère le client
pnpm prisma:studio        # Ouvre Prisma Studio
```

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

Le client Prisma est un singleton exporté depuis `#lib/database.js`. Il est initialisé une fois au démarrage et passe par `@prisma/adapter-pg` : le pool de connexions est celui de node-postgres (10 connexions).

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
