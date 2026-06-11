# Guide de Développement AsyncMod

Bienvenue dans le guide de développement d'AsyncMod ! Cette documentation vous expliquera comment créer des modules,
commandes et listeners pour étendre les fonctionnalités du bot Discord.

## Structure de la Documentation

- [**Modules**](modules.md) - Comment créer et structurer un module
- [**Commandes**](commands.md) - Comment créer des commandes slash
- [**Listeners**](listeners.md) - Comment écouter et réagir aux événements Discord
- [**Interactions**](interactions.md) - Comment gérer les boutons, menus et modales
- [**Services**](services.md) - Comment créer des services pour la logique métier
- [**Prisma**](prisma.md) - Guide sur l'utilisation de Prisma pour la base de données
- [**Fonctionnel**](functional.md) - Comportement visible par les utilisateurs Discord

## Architecture du Projet

AsyncMod utilise un système de modules modulaire où chaque fonctionnalité est encapsulée dans son propre module. Chaque
module peut contenir des commandes, des listeners et sa propre logique métier.

## Conventions de Nommage

Le projet utilise un système de nommage inspiré d'Angular avec des suffixes pour identifier le type de fichier :

- `*.module.ts` - Fichiers de modules (ex: `example.module.ts`)
- `*.command.ts` - Fichiers de commandes Discord (ex: `test.command.ts`)
- `*.listener.ts` - Fichiers d'événements Discord (ex: `message.listener.ts`)
- `*.button.ts` / `*.modal.ts` / `*.select.ts` - Handlers d'interactions
- `*.service.ts` - Fichiers de services (ex: `user.service.ts`)
- `*.prisma` - Modèles de base de données Prisma (ex: `users.prisma`)

Cette convention permet d'identifier rapidement le rôle de chaque fichier dans le projet.

## Structure du Projet

```
src/
├── modules/                # Dossier contenant tous les modules du bot
│   ├── mon-module-ici/     # Module
│   │   ├── commands/       # Commandes du module
│   │   ├── listeners/      # Listeners du module
│   │   ├── models/         # Modèles de données pour la base de données
│   │   ├── services/       # Services du module
│   │   └── mon-module.module.ts # Fichier principal du module
├── lib/                    # Bibliothèques utile pour les modules
└── core/                   # Système central, services et gestion des modules
    ├── loaders/            # Chargeurs de modules
    └── services/           # Services principaux
```
