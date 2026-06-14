# Pour commencer

Bienvenue sur OmniBot ! Ce guide vous aidera à configurer le bot pour le développement et à comprendre le projet.

## Qu'est-ce qu'OmniBot ?

OmniBot est un **bot Discord modulaire** développé pour la communauté [Graven - Développement](https://discord.gg/graven). Chaque fonctionnalité est un **module** autonome qui est auto-découvert au démarrage et peut être installé ou désinstallé **par serveur Discord** via `/modules`. Les modules déclarent leurs propres commandes slash, écouteurs d'événements, gestionnaires d'interactions et un schéma de configuration typé éditable en direct avec `/config <module>`.

Le système central relie le tout — ajouter une fonctionnalité signifie créer un module, sans jamais toucher au bootstrap.

### Technologies utilisées

| Domaine                 | Choix                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Langage                 | TypeScript (ESM, NodeNext), Node.js 24                                                   |
| API Discord             | discord.js v14                                                                           |
| Base de données         | PostgreSQL 17 via Prisma ORM                                                             |
| Gestionnaire de paquets | pnpm (workspaces : bot + site de doc)                                                    |
| Outillage               | mise (versions d'outils), oxlint + oxfmt (lint/format), lefthook (hooks git), commitlint |
| Tests                   | Vitest (unitaires + intégration)                                                         |
| Journalisation          | pino                                                                                     |
| Lanceur de Dev          | pitchfork (stack complète en une commande : DB + bot)                                    |

---

## Démarrage rapide

### Prérequis

- [mise](https://mise.jdx.dev/) — fixe les versions de Node.js, pnpm et pitchfork. Sans mise, installez **Node.js 24** et **pnpm** manuellement (vérifiez `.mise.toml` pour les versions exactes).
- **Docker** — pour le conteneur PostgreSQL 17.
- Un **token de bot Discord** — créez une application dans le [Discord Developer Portal](https://discord.com/developers/applications), puis allez dans la section Bot et réinitialisez le token. Activez **Message Content Intent** si votre module en a besoin.

### Configuration

```bash
# 1. Cloner le dépôt
git clone https://github.com/GravenDev/OmniBot.git
cd OmniBot

# 2. Installer la chaîne d'outils (Node, pnpm, pitchfork)
mise install

# 3. Installer les dépendances et les hooks git
pnpm install

# 4. Créer le fichier d'environnement
cp .env.example .env

# 5. Remplir le fichier .env (voir section Environnement ci-dessous)
```

### Lancement

**Stack complète en une commande (recommandé) :**

```bash
pitchfork start bot    # démarre PostgreSQL, attend qu'il soit prêt, puis lance le bot
pitchfork logs bot     # consulter les logs
pitchfork stop bot db  # tout arrêter
```

Les daemons sont définis dans `pitchfork.toml` — le daemon `bot` dépend de `db` (Docker PostgreSQL).

**Lancement manuel :**

```bash
docker compose up -d    # démarrer PostgreSQL 17
pnpm prisma:migrate     # appliquer les migrations (première exécution uniquement)
pnpm dev                # lancer le bot avec tsx
```

### Environnement

Copiez `.env.example` vers `.env` et remplissez les valeurs :

| Variable        | Description                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN` | Token du bot depuis le Discord Developer Portal                                                                                                                                  |
| `DATABASE_URL`  | Chaîne de connexion PostgreSQL (la valeur par défaut correspond à `compose.yaml`)                                                                                                |
| `DEV_GUILD_ID`  | **Développement uniquement** — ID du serveur où les commandes slash sont enregistrées instantanément (les commandes globales mettent ~1h à se propager). Requis pour `pnpm dev`. |

---

## Structure du projet

```
src/
├── index.ts                    # Point d'entrée — séquence de démarrage
├── core/                       # Framework (toujours chargé)
│   ├── commands/               #   Commandes /modules et /config
│   ├── config/                 #   Gestionnaires de types de config (modale, select, toggle)
│   ├── interactions/           #   Gestionnaires de boutons du cœur
│   ├── listeners/              #   Écouteurs d'événements globaux
│   ├── loaders/                #   Découverte des modules/commandes/écouteurs
│   ├── models/                 #   Schémas Prisma du cœur
│   ├── services/               #   ModuleService, ConfigService
│   └── utils/                  #   Garde de permission, parseur de version, messages
├── modules/                    # Modules fonctionnels (un dossier par module)
│   ├── thread-creator/         #   Module exemple : création automatique de fils
│   └── test-config/            #   Dev uniquement : teste tous les types de config
├── lib/                        # Contrats partagés exposés aux modules
│   ├── module.ts               #   defineModule()
│   ├── command.ts              #   declareCommand()
│   ├── listener.ts             #   declareEventListener()
│   ├── interaction.ts          #   declareInteractionHandler()
│   ├── config.ts               #   ConfigType, ConfigProvider, validateurs
│   ├── service.ts              #   declareService()
│   ├── database.ts             #   Singleton Prisma client
│   ├── logger.ts               #   Logger Pino
│   └── registry.ts             #   Registry : collecte commandes/écouteurs/gestionnaires
├── prisma/                     # Base de données
│   ├── dbinfo.prisma           #   Configuration du générateur + datasource
│   ├── schema.prisma           #   Schéma consolidé (auto-généré)
│   └── migrations/             #   Fichiers de migration SQL
├── utils/                      # Utilitaires partagés
│   └── colors.ts               #   Constantes de couleurs pour les embeds
└── generated/                  # Client Prisma (auto-généré)
```

---

## Conventions de nommage

Les fichiers utilisent des suffixes pour identifier leur rôle :

| Suffixe         | Rôle                                                    |
| --------------- | ------------------------------------------------------- |
| `*.module.ts`   | Définition du module (ex. `thread-creator.module.ts`)   |
| `*.command.ts`  | Commande slash (ex. `saluer.command.ts`)                |
| `*.listener.ts` | Écouteur d'événement (ex. `message-create.listener.ts`) |
| `*.button.ts`   | Gestionnaire d'interaction bouton                       |
| `*.modal.ts`    | Gestionnaire de soumission de modale                    |
| `*.select.ts`   | Gestionnaire de menu de sélection                       |
| `*.service.ts`  | Service métier (ex. `file-attente.service.ts`)          |
| `*.prisma`      | Définition de modèle Prisma                             |

---

## Conventions d'import

Les imports entre répertoires utilisent des **subpath imports** avec le préfixe `#`. L'extension `.js` est toujours présente (résolution NodeNext) :

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

Les imports dans le même répertoire restent relatifs :

```typescript
import maCommande from "./commands/ma-commande.command.js";
```

---

## Commandes courantes

```bash
pnpm dev                  # Lancer le bot avec tsx (développement)
pnpm build                # prisma:generate + tsc → dist/
pnpm test                 # Lancer toute la suite de tests (unitaire + intégration)
pnpm test:unit            # Tests unitaires uniquement
pnpm test:integration     # Tests d'intégration uniquement
pnpm format               # oxfmt + oxlint --fix

# Base de données
pnpm prisma:generate      # Consolider les schémas + générer le client Prisma
pnpm prisma:migrate       # Créer et appliquer une migration
pnpm prisma:studio        # Ouvrir Prisma Studio (interface graphique)

# Site de documentation (VitePress)
pnpm --filter omnibot-docs dev    # Démarrer le serveur de doc en dev
pnpm --filter omnibot-docs build  # Construire le site statique de doc
```

---

## Prochaines étapes

- [Architecture](./architecture) — Comprendre le fonctionnement interne du bot
- [Créer un module](./creating-a-module) — Construire votre premier module
- [Contribuer](./contributing) — Apprendre à contribuer au projet
