# Spec — Thread Creator : file d'attente de création

Issues : [#36](https://github.com/AsyncCommunityDiscord/OmniBot/issues/36), [#37](https://github.com/AsyncCommunityDiscord/OmniBot/issues/37)  
Priorité : basse

---

> **Statut : implémenté.** File d'attente et multi-salons (#37) livrés : la classe `ThreadCreationQueue` (`services/thread-creation-queue.ts`) et le champ de config `channels` en `ListOf<CHANNEL>`. Voir « Implémentation » plus bas.

## Problème (avant)

Quand plusieurs messages arrivaient rapidement dans le salon surveillé, le rate limit de 5 fils par 10 secondes était atteint et les messages suivants étaient silencieusement ignorés. Des fils n'étaient donc jamais créés pour ces messages.

## Comportement

Le drop silencieux est remplacé par une **file d'attente par serveur** : si le rate limit est atteint, les créations de fils sont mises en attente et traitées dès que la fenêtre de 10 secondes se libère.

### Règles

- La file est propre à chaque serveur (pas de partage inter-serveurs).
- L'ordre de création respecte l'ordre d'arrivée des messages.
- Si le bot redémarre, les entrées en attente sont perdues (pas de persistance requise).
- Pas de limite de taille de file définie pour l'instant (à affiner selon les retours).

### Pourquoi pas de persistance (décision assumée)

La file est volontairement **en mémoire seule**. Ce qu'on perd à un redémarrage = uniquement les jobs en attente d'un **burst en cours** (le surplus au-delà de 5/10 s pas encore traité) :

- **Sévérité faible** : les messages ne sont pas perdus (ils restent sur Discord) — on rate seulement le _fil auto_ sous certains messages d'un pic, ce qui est cosmétique et rattrapable. C'est l'ancien mode d'échec (drop sur rate limit), désormais réduit à « drop seulement si redémarrage pendant un backlog actif ».
- **Coût disproportionné** : un job référence un `Message` vivant (non sérialisable) → il faudrait persister `(messageId, channelId, …)`, **re-fetch** les messages au boot et gérer ceux supprimés entre-temps, plus une **table dédiée** — qu'on vient justement de supprimer (clean cut de la migration). Trop pour une feature `priority: low`.
- **Juste-milieu écarté** : un drain best-effort au graceful shutdown ne couvrirait que les deploys planifiés (pas les crashes) et resterait limité par le délai de grâce + le rate limit → bénéfice marginal.

À reconsidérer seulement si la création de fil devient critique (modération/traçabilité) ou si des pics + redémarrages fréquents rendent la perte visible.

## #37 — multi-salons

L'issue #37 (configurer plusieurs salons par serveur) dépendait de cette file : sans elle, surveiller plusieurs salons amplifierait les drops. La file en place, le multi-salons est livré en passant le champ de config `channel` (salon unique) à **`channels: ListOf<CHANNEL>`** : le service crée un fil si le message est posté dans **l'un** des salons surveillés, et toutes les créations passent par la file (donc partagent la même fenêtre de rate limit par serveur).

## Impact sur le schéma

Aucun changement de schéma de base nécessaire (file en mémoire). Depuis la v2.0.0, le module n'a plus de table dédiée : sa configuration vit dans le système générique (`GuildConfiguration`, blob JSON par serveur). Le multi-salons s'est donc fait au niveau du schéma de config du module (`channel` → `channels: ListOf<CHANNEL>`), sans migration de table. **Clean cut** : les configs `channel` (singulier) déjà enregistrées ne sont pas reprises — les serveurs concernés re-sélectionnent leurs salons via `/config thread-creator`.

## Implémentation

- `services/thread-creation-queue.ts` — `ThreadCreationQueue` : file FIFO par serveur, cadence ≤ 5 / 10 s, reprise par `setTimeout` quand la fenêtre est pleine, drain non réentrant (un seul `pump` par serveur). Erreur sur un job loggée sans bloquer la file.
- `services/thread-creator.service.ts` — `scheduleThreadForMessage` : teste l'appartenance du salon à `channels`, génère le nom du fil, puis enfile le job.
- Tests : `services/thread-creation-queue.test.ts` (FIFO sans drop sur plusieurs fenêtres, cadence ≤ 5/10 s, isolation par serveur, message de bienvenue) avec fake timers.
