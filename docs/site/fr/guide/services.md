# Services

Les services permettent d'encapsuler la logique métier et de la réutiliser à travers votre module.

## Création d'un service

```typescript
// src/modules/mon-module/services/user.service.ts

import { declareService, type Service } from "#lib/service.js";
import prisma from "#lib/database.js";

class UserService implements Service {
  async createUser(userId: string, username: string) {
    return await prisma.user.create({
      data: { userId, username },
    });
  }

  async getUser(userId: string) {
    return await prisma.user.findUnique({
      where: { userId },
    });
  }
}

export default declareService(new UserService());
```

## Interface Service

La fonction `declareService` accepte n'importe quelle instance de classe. L'interface `Service` est pour l'instant vide, ce qui permet une grande flexibilité dans la structure de vos services.

## Utilisation

Les services s'importent et s'utilisent dans vos commandes, écouteurs ou autres services :

```typescript
// Dans une commande
import userService from "../services/user.service.js";

async execute(interaction) {
  const user = await userService.getUser(interaction.user.id);
  // ...
}
```

## Bonnes pratiques

- Utilisez les services pour encapsuler la logique métier complexe
- Gardez les services focalisés sur une responsabilité spécifique
- Utilisez les services pour les interactions avec la base de données
- Exportez toujours une instance déclarée avec `declareService`
