# Base de données

OmniBot utilise Prisma comme ORM avec une architecture multi-fichiers qui permet de distribuer les modèles de base de données à travers les différents modules.

## Architecture

### Structure des fichiers Prisma

```
src/
├── prisma/
│   ├── dbinfo.prisma          # Configuration du générateur et datasource
│   └── schema.prisma          # Schéma consolidé (généré)
├── core/
│   └── models/
│       └── modules.prisma     # Modèles du système de modules
└── modules/
    └── [module-name]/
        └── models/
            └── *.prisma       # Modèles spécifiques au module
```

### Configuration

Le fichier `dbinfo.prisma` contient la configuration de base :

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

1. Créez un fichier `.prisma` dans le dossier `models/` de votre module :

```
src/modules/mon-module/models/mon-modele.prisma
```

2. Définissez votre modèle :

```prisma
model MonModele {
  id        String   @id @default(cuid())
  nom       String
  createdAt DateTime @default(now())
}
```

3. Générez le client Prisma :

```bash
pnpm prisma:generate
```

4. Créez une migration :

```bash
pnpm prisma:migrate
```

## Système de consolidation

Au lieu d'avoir tous les modèles dans un seul fichier `schema.prisma`, le projet permet de distribuer les modèles dans différents fichiers `.prisma` à travers les modules. Un script de consolidation (`scripts/consolidate-schema.ts`) rassemble automatiquement tous ces fichiers avec le header `dbinfo.prisma` dans le schéma principal.

Le script :

1. Parcourt tous les dossiers dans `src/` pour trouver les fichiers `.prisma` (sauf dans `src/prisma/`)
2. Combine le header et tous les modèles dans un seul `schema.prisma`
3. Ajoute des commentaires pour identifier la source de chaque modèle

### Scripts npm

```bash
pnpm prisma:consolidate   # Consolide uniquement les modèles
pnpm prisma:generate      # Consolide + génère le client Prisma
pnpm prisma:migrate       # Consolide + crée/applique une migration
pnpm prisma:studio        # Consolide + ouvre Prisma Studio
```

## Utilisation dans le code

```typescript
import prisma from "#lib/database.js";

// Dans un service ou une commande
const users = await prisma.user.findMany();
const newUser = await prisma.user.create({
  data: { userId: "123", username: "test" },
});
```

## Bonnes pratiques

- **Modèles du core** : `src/core/models/`
- **Modèles spécifiques aux modules** : `src/modules/[module-name]/models/`
- **Nommage des fichiers** : `nom-descriptif.prisma`
- **Nommage des modèles** : PascalCase (`ModuleActivation`)
- **Nommage des champs** : camelCase (`moduleId`)
- Réduisez le nombre de modèles par fichier pour faciliter la maintenance

## Variables d'environnement

```ini
DATABASE_URL="postgresql://username:password@localhost:5432/omnibot"
```

## Ressources utiles

- [Documentation Prisma](https://www.prisma.io/docs/)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
