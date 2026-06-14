# Services

Services allow you to encapsulate business logic and reuse it across your module.

## Creating a service

```typescript
// src/modules/my-module/services/user.service.ts

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

## Service interface

`declareService` accepts any class instance. The `Service` interface is currently empty, allowing great flexibility in service structure.

## Usage

Services can be imported and used in commands, listeners, or other services:

```typescript
// In a command
import userService from "../services/user.service.js";

async execute(interaction) {
  const user = await userService.getUser(interaction.user.id);
  // ...
}
```

## Best practices

- Use services to encapsulate complex business logic
- Keep services focused on a single responsibility
- Use services for database interactions
- Always export an instance declared with `declareService`
