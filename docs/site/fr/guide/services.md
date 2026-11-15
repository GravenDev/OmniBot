# Services

Les services portent l'état et les dépendances (base de données, Discord, API externes) partagés par les commandes, écouteurs et interactions de votre module. Contrairement aux modules, les services ne sont **pas auto-découverts** — vous les importez directement là où vous en avez besoin.

## Qu'est-ce qu'un service

Un service est du code qui porte un **état** (un cache, une file, un minuteur) ou des **dépendances** (la base de données, Discord, une API externe), et que plusieurs parties du module partagent. Écrivez-le comme une classe déclarée avec `declareService`, dans `services/<nom>.service.ts`.

Les fonctions pures (analyse, mise en forme, règles de calcul, construction d'un message à partir de données) ne sont pas des services : gardez-les en fonctions exportées simples, sans classe ni `declareService`, dans un fichier à la racine du module, nommé d'après leur rôle (`rules.ts`, `formatting.ts`). Elles se lisent et se testent plus facilement ainsi. Un fichier qui mélange les deux se découpe : la partie pure d'un côté, celle qui lit ou écrit de l'autre.

Pas de dossier `domain/` ni `business/`, ni de couches par-dessus : un module reste petit, et ce que plusieurs modules partagent va dans `src/lib/`. Quand un module accumule beaucoup de fichiers purs (six ou sept), regroupez-les dans un dossier nommé d'après leur rôle, comme `rendering/` pour les images.

Le starboard la suit : `eligibility.ts` (quels messages peuvent atteindre le tableau), `tally.ts` (le décompte des membres qui ont réagi) et `view.ts` (le message posté sur le tableau) sont purs et se trouvent à la racine de `src/modules/starboard/` ; `services/` contient `reactions.service.ts`, qui va chercher les auteurs des réactions sur Discord pour que `tally.ts` les compte, `store.service.ts`, qui lit et écrit en base, et `starboard.service.ts`, qui les relie derrière une file par message. La plupart des autres modules précèdent cette règle : appliquez-la au nouveau code, et quand un changement retravaille un module.

## Créer un service

```typescript
// src/modules/salut/services/utilisateur.service.ts

import prisma from "#lib/database.js";
import { declareService, type Service } from "#lib/service.js";

class UtilisateurService implements Service {
  async creerUtilisateur(userId: string, nom: string) {
    return await prisma.user.create({
      data: { userId, nom },
    });
  }

  async getUtilisateur(userId: string) {
    return await prisma.user.findUnique({
      where: { userId },
    });
  }
}

export default declareService(new UtilisateurService());
```

L'interface `Service` est actuellement vide, ce qui offre une flexibilité maximale. `declareService()` étiquette l'instance avec `DeclarationType.Service` pour la cohérence avec le motif Declared.

## Utiliser un service

Les services sont importés et utilisés dans les commandes, écouteurs ou autres services :

```typescript
// Dans une commande
import utilisateurService from "../services/utilisateur.service.js";

async execute(interaction) {
  const utilisateur = await utilisateurService.getUtilisateur(interaction.user.id);
  // ...
}
```

## Exemple concret : File d'attente de création de fils

Le module `thread-creator` illustre un modèle de service pratique. Voici son fonctionnement :

### ThreadCreationQueue (`services/thread-creation-queue.ts`)

Une file d'attente FIFO par serveur avec limitation de débit pour la création de fils :

```typescript
export class ThreadCreationQueue {
  // Chaque serveur a sa propre file
  private readonly queues = new Map<string, ThreadJob[]>();
  private readonly recentCreations = new Map<string, number[]>();
  private readonly draining = new Set<string>();

  enqueue(guildId: string, job: ThreadJob): void {
    // Ajouter le job à la file du serveur et démarrer le traitement
  }

  private async pump(guildId: string): Promise<void> {
    // Traiter les jobs à max 5 par 10 secondes par serveur
    // Utilise setTimeout pour reprendre quand la fenêtre se libère
  }
}
```

C'est une classe simple, sans `declareService` : `ThreadCreatorService` crée son unique instance, et c'est lui que le module partage.

Caractéristiques clés :

- **Isolation par serveur** — les limites de débit sont suivies séparément par serveur
- **Ordre FIFO** — les jobs sont traités dans l'ordre d'arrivée
- **En mémoire uniquement** — la file est perdue au redémarrage (compromis intentionnel)
- **Non-bloquant** — les erreurs sur des jobs individuels sont journalisées sans arrêter la file

### ThreadCreatorService (`services/thread-creator.service.ts`)

Coordonne la création de fils :

```typescript
class ThreadCreatorService implements Service {
  private readonly queue = new ThreadCreationQueue();

  scheduleThreadForMessage(
    message: Message,
    config: ConfigProvider<ThreadCreatorConfigSchema>
  ): void {
    // Vérifier si le salon du message est dans les salons configurés
    // Générer le nom du fil à partir du template
    // Mettre en file d'attente la création du fil
  }

  generateThreadName(template: string, message: Message): string {
    // Remplacer les variables : {messageAuthor}, {messageContent}, {timestamp}
    // Limiter à 100 caractères (limite Discord)
  }
}
```

Le `ThreadCreatorService` est utilisé par l'écouteur `messageCreate`, qui appelle `scheduleThreadForMessage()` avec le message et la configuration du module. Le service gère la vérification du salon, la génération du nom et la mise en file d'attente en un seul appel.

Ce module précède lui aussi la règle ci-dessus : `generateThreadName` et `creationFailure` sont purs et iraient dans un fichier à la racine du module, et la file, qui porte un état, vivrait dans `thread-creation-queue.service.ts`.

### Intégration avec le schéma de configuration

```typescript
// thread-creator.config.ts
export const threadCreatorConfigSchema = {
  channels: {
    name: "Monitored channels",
    description: "Channels where new messages are monitored (…)",
    type: [ConfigType.CHANNEL],
  },
  welcomeMessage: {
    name: "Welcome message",
    description: "Message automatically posted in each created thread.",
    type: ConfigType.STRING,
    defaultValue: "💬 Use this thread to discuss this topic!",
  },
  threadNameTemplate: {
    name: "Name template",
    description:
      "Thread name — variables: {messageAuthor}, {messageContent}, {timestamp}.",
    type: ConfigType.STRING,
    defaultValue: "Discussion - {messageAuthor}",
  },
} satisfies ConfigSchema;
```

## Bonnes pratiques

- **Responsabilité unique** — chaque service doit se concentrer sur une préoccupation
- **Testable** — exportez la classe pour que les tests unitaires puissent l'importer directement avant `declareService` ; ou gardez-la dans un fichier séparé et importez la classe brute pour les tests sans appels API Discord
- **L'état dans le service** — gardez-le dans les champs privés de l'instance, pas dans des variables de module à côté
- **Import direct** — importez l'instance déclarée là où vous en avez besoin
- **Utilisation avec Prisma** — les services sont l'endroit naturel pour les opérations base de données

## Prochaines étapes

- [Base de données](./database) pour les données persistantes
- [Configuration](./configuration) pour gérer les paramètres du module
- [Commandes](./commands) pour créer des commandes slash
