# Services

Les services vous permettent d'encapsuler la logique métier et de la réutiliser dans les commandes, écouteurs et interactions de votre module. Contrairement aux modules, les services ne sont **pas auto-découverts** — vous les importez directement là où vous en avez besoin.

## Créer un service

```typescript
// src/modules/salut/services/utilisateur.service.ts

import { declareService, type Service } from "#lib/service.js";
import prisma from "#lib/database.js";

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
class ThreadCreationQueue implements Service {
  // Chaque serveur a sa propre file
  private files = new Map<string, JobEnAttente[]>();
  private pompes = new Map<string, boolean>();
  private horodatages = new Map<string, number[]>();

  enqueue(guildId: string, job: JobEnAttente): void {
    // Ajouter le job à la file du serveur et démarrer le traitement
  }

  private pump(guildId: string): void {
    // Traiter les jobs à max 5 par 10 secondes par serveur
    // Utilise setTimeout pour planifier le prochain lot quand le taux est atteint
  }
}
```

Caractéristiques clés :

- **Isolation par serveur** — les limites de débit sont suivies séparément par serveur
- **Ordre FIFO** — les jobs sont traités dans l'ordre d'arrivée
- **En mémoire uniquement** — la file est perdue au redémarrage (compromis intentionnel)
- **Non-bloquant** — les erreurs sur des jobs individuels sont journalisées sans arrêter la file

### ThreadCreatorService (`services/thread-creator.service.ts`)

Coordonne la création de fils :

```typescript
class ThreadCreatorService implements Service {
  async planifierCreationFil(
    message: Message,
    config: ConfigProvider
  ): Promise<void> {
    // Vérifier si le salon du message est dans les salons configurés
    // Générer le nom du fil à partir du template
    // Mettre en file d'attente la création du fil
  }

  genererNomFil(template: string, message: Message): string {
    // Remplacer les variables : {messageAuthor}, {messageContent}, {timestamp}
    // Limiter à 100 caractères (limite Discord)
  }
}
```

Le `ThreadCreatorService` est utilisé par l'écouteur `messageCreate`, qui appelle `planifierCreationFil()` avec le message et la configuration du module. Le service gère la vérification du salon, la génération du nom et la mise en file d'attente en un seul appel.

### Intégration avec le schéma de configuration

```typescript
// thread-creator.config.ts
config: {
  salons: {
    name: "Salons",
    description: "Salons à surveiller",
    type: [ConfigType.CHANNEL],
  },
  messageBienvenue: {
    name: "Message de bienvenue",
    description: "Message posté dans les nouveaux fils",
    type: ConfigType.STRING,
    defaultValue: "💬 Utilisez ce fil pour discuter de ce sujet !",
  },
}
```

## Bonnes pratiques

- **Responsabilité unique** — chaque service doit se concentrer sur une préoccupation
- **Testable** — exportez la classe pour que les tests unitaires puissent l'importer directement avant `declareService` ; ou gardez-la dans un fichier séparé et importez la classe brute pour les tests sans appels API Discord
- **Pas d'état global** — utilisez des instances de classe avec un encapsullement approprié
- **Import direct** — importez l'instance déclarée là où vous en avez besoin
- **Utilisation avec Prisma** — les services sont l'endroit naturel pour les opérations base de données

## Prochaines étapes

- [Base de données](./database) pour les données persistantes
- [Configuration](./configuration) pour gérer les paramètres du module
- [Commandes](./commands) pour créer des commandes slash
