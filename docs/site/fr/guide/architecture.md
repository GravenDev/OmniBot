# Architecture

Cette page explique le fonctionnement interne d'OmniBot. Comprendre cela vous aidera à créer de meilleurs modules et à résoudre les problèmes.

## Séquence de démarrage

Au démarrage du bot (`src/index.ts`), la séquence suivante est exécutée :

```
1. Vérification de la base de données
   └─ prisma.$queryRaw`SELECT 1`
   └─ sort avec une erreur si la DB est indisponible

2. Découverte des modules
   └─ loadModules("./modules")
   └─ parcourt chaque sous-dossier de src/modules/
   └─ importe le fichier *.module.ts
   └─ ignore les modules devOnly en production

3. Agrégation des intentions
   └─ collecte les GatewayIntentBits de tous les modules
   └─ crée le client Discord avec l'union de toutes les intentions

4. Gestionnaire ClientReady (asynchrone)
   ├─ Pour chaque module :
   │   ├─ module.onLoad(client, registry)
   │   └─ loadModuleEvents(client, module)
   ├─ coreModule.onLoad(client, coreModule.registry)
   ├─ syncCommands(client, modules)
   │   ├─ Mode dev : PUT groupé sur DEV_GUILD_ID
   │   └─ Mode prod : commandes guild versionnées + commandes globales du cœur
   └─ loadGlobalEvents(client)

5. Connexion
   └─ client.login(token)

6. Gestionnaires d'arrêt
   └─ SIGTERM / SIGINT → client.destroy() + prisma.$disconnect()
```

## Auto-découverte des modules

Les modules ne sont **pas enregistrés manuellement**. Le chargeur (`src/core/loaders/module-loader.ts`) les découvre automatiquement :

1. Liste tous les sous-dossiers de `src/modules/`
2. Pour chaque dossier, trouve un fichier `*.module.ts` (ou `*.module.js`)
3. Importe dynamiquement le module
4. Valide qu'il a `type: DeclarationType.Module`
5. Retourne un objet `Module` avec son `Registry`

Cela signifie qu'ajouter un nouveau module est aussi simple que de créer un dossier avec un fichier `*.module.ts`. Aucun fichier de configuration à éditer, aucun import à ajouter.

## Registry et motif Declared

Chaque module possède sa propre instance de **Registry** (`src/lib/registry.ts`) qui collecte trois types d'artefacts :

- `commands: Declared<Command>[]`
- `listeners: Declared<EventListener>[]`
- `interactionHandlers: Declared<InteractionHandler>[]`

La méthode `register()` utilise une union discriminée — elle vérifie `handler.type` (de l'énumération `DeclarationType`) et pousse dans le tableau approprié.

Chaque fichier importé dynamiquement (commande, écouteur, interaction) est enveloppé avec une fonction `declare*()` qui l'étiquette avec son `DeclarationType`. Cela permet aux chargeurs d'identifier le type d'artefact sans conventions de nommage ni configuration.

```typescript
// Le motif Declared
export enum DeclarationType {
  Module = "module",
  Command = "command",
  Listener = "listener",
  Interaction = "interaction",
  Service = "service",
}
```

## Dispatch centralisé des interactions

Un seul écouteur `interactionCreate` (`src/core/listeners/interaction-create.listener.ts`) gère toutes les interactions utilisateur :

```
interactionCreate
├─ isChatInputCommand()
│   ├─ trouver la commande par nom dans tous les modules
│   ├─ vérifier l'état d'activation du module (BDD)
│   ├─ charger la configuration (ConfigProvider)
│   └─ execute(interaction, config)
├─ isAutocomplete()
│   ├─ trouver la commande
│   ├─ vérifier l'activation
│   └─ complete(interaction, config)
├─ isMessageComponent() ou isModalSubmit()
│   ├─ diviser customId sur ":" → préfixe + args
│   ├─ trouver le gestionnaire par préfixe
│   ├─ vérifier l'activation du module
│   ├─ si requiresAdmin → vérifier la permission Administrateur
│   ├─ exécuter la garde de type (check())
│   └─ execute(interaction, args, config)
```

Cette approche centralisée signifie que :

- Les **permissions** sont vérifiées à un seul endroit (le flag `requiresAdmin` sur `InteractionHandler`)
- L'**activation du module** est vérifiée automatiquement
- L'**injection de configuration** se fait de manière transparente

## Propagation des commandes

### Mode développement

Quand `NODE_ENV=development`, toutes les commandes (cœur + modules activés) sont enregistrées dans un **PUT unique** sur `DEV_GUILD_ID`. C'est **instantané** — aucun délai de propagation. Chaque redémarrage du bot resynchronise toutes les commandes.

### Mode production

- **Commandes du cœur** (`/modules`, `/config`) : enregistrées **globalement** (~1 heure de propagation).
- **Commandes des modules** : enregistrées **par serveur**. Pour éviter de ré-enregistrer à chaque démarrage, le système utilise le **versionnage** : il compare la version déclarée du module avec `activatedVersion` stockée en base. Les commandes ne sont ré-enregistrées que sur les serveurs où la version diffère.

## Aperçu du système de configuration

Le système de configuration comporte plusieurs couches :

1. **Déclaration du schéma** — Les modules déclarent des schémas typés dans `defineModule({ config: {...} })`
2. **Stockage** — Toutes les configurations sont stockées dans un blob JSON par serveur dans la table `GuildConfiguration`
3. **Cache** — `ConfigService` maintient un cache en mémoire (`configCache`) pour éviter les lectures base de données à chaque interaction
4. **Désérialisation** — Les IDs d'entités (utilisateur, rôle, salon) sont stockés sous forme de chaînes et résolus en objets Discord à la lecture
5. **Interface admin** — `/config <module>` affiche un panneau interactif avec des contrôles d'édition par champ

## Couche service

Contrairement aux modules, **les services ne sont pas auto-découverts**. Ce sont de simples classes ou objets TypeScript étiquetés avec `declareService()`. Vous les importez directement là où vous en avez besoin :

```typescript
import fileAttente from "../services/file-attente-creation.js";
```

Cela maintient la couche service simple et sans dépendances.

## Auto-activation des écouteurs

Quand un écouteur de module est enregistré, le chargeur l'enveloppe avec une logique qui :

1. Extrait le `guildId` des arguments de l'événement
2. Recherche l'état d'activation du module dans la base de données
3. Si désactivé → retour silencieux (no-op)
4. Si activé → récupère la configuration et appelle `execute()` avec la config comme dernier argument

Pour les événements qui peuvent se produire en dehors d'un serveur (ex. messages privés), l'écouteur doit gérer les vérifications d'activation manuellement — il n'y a pas de contexte de serveur pour effectuer la recherche.
