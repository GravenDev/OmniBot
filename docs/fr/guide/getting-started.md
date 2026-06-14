# Pour commencer

Bienvenue dans le guide de développement d'OmniBot ! Cette documentation vous explique comment créer des modules, commandes et écouteurs pour étendre les fonctionnalités du bot Discord.

OmniBot est un bot Discord modulaire où chaque fonctionnalité est encapsulée dans son propre module. Les modules sont auto-découverts au démarrage — **aucun enregistrement manuel n'est nécessaire** en dehors du dossier du module.

## Architecture du projet

```
src/
├── modules/                # Dossier contenant tous les modules du bot
│   ├── mon-module/         # Module
│   │   ├── commands/       # Commandes du module
│   │   ├── listeners/      # Écouteurs du module
│   │   ├── models/         # Modèles Prisma (optionnel)
│   │   ├── services/       # Services du module
│   │   ├── interactions/   # Handlers d'interactions (boutons, etc.)
│   │   └── mon-module.module.ts  # Fichier principal du module
├── lib/                    # Bibliothèque exposée aux modules
│   ├── module.ts           # defineModule()
│   ├── command.ts          # declareCommand()
│   ├── listener.ts         # declareEventListener()
│   ├── interaction.ts      # declareInteractionHandler()
│   ├── service.ts          # declareService()
│   ├── config.ts           # ConfigType, ConfigProvider
│   ├── database.ts         # Client Prisma
│   └── logger.ts           # Logger structuré
├── core/                   # Système central du bot
│   ├── commands/           # Commandes système (/modules, /config)
│   ├── loaders/            # Chargeurs de modules/commandes
│   └── services/           # Services internes
└── prisma/                 # Configuration Prisma
    ├── dbinfo.prisma       # Configuration générateur + datasource
    └── schema.prisma       # Schéma consolidé (généré automatiquement)
```

## Conventions de nommage

Le projet utilise un système de suffixes pour identifier le rôle de chaque fichier :

- `*.module.ts` — Définition du module (ex: `mon-module.module.ts`)
- `*.command.ts` — Commande slash (ex: `test.command.ts`)
- `*.listener.ts` — Écouteur d'événement (ex: `message-create.listener.ts`)
- `*.button.ts` / `*.modal.ts` / `*.select.ts` — Handlers d'interactions
- `*.service.ts` — Service métier (ex: `user.service.ts`)
- `*.prisma` — Modèle de base de données (ex: `users.prisma`)

## Imports

Les imports entre modules se font via des **subpath imports** avec `#lib/...` :

```typescript
import { defineModule } from "#lib/module.js";
import { declareCommand } from "#lib/command.js";
import { declareEventListener } from "#lib/listener.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { declareService } from "#lib/service.js";
import { ConfigType } from "#lib/config.js";
import logger from "#lib/logger.js";
import prisma from "#lib/database.js";
```

Les imports dans un même répertoire restent relatifs (`./fichier.js`). L'extension `.js` est toujours présente (NodeNext).

## Prochaines étapes

- [Créer un module](./creating-a-module) — Structure et cycle de vie d'un module
- [Commandes](./commands) — Créer des commandes slash
- [Écouteurs](./listeners) — Réagir aux événements Discord
- [Interactions](./interactions) — Boutons, menus déroulants et modales
- [Configuration](./configuration) — Schéma de configuration typé
- [Services](./services) — Logique métier
- [Base de données](./database) — Prisma ORM
