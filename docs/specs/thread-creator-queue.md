# Spec — Thread Creator : file d'attente de création

Issues : [#36](https://github.com/AsyncCommunityDiscord/OmniBot/issues/36), [#37](https://github.com/AsyncCommunityDiscord/OmniBot/issues/37)  
Priorité : basse

---

## Problème actuel

Quand plusieurs messages arrivent rapidement dans le salon surveillé, le rate limit de 5 fils par 10 secondes est atteint et les messages suivants sont silencieusement ignorés. Des fils ne sont donc jamais créés pour ces messages.

## Comportement cible

Remplacer le drop silencieux par une **file d'attente par serveur** : si le rate limit est atteint, les créations de fils sont mises en attente et traitées dès que la fenêtre de 10 secondes se libère.

### Règles

- La file est propre à chaque serveur (pas de partage inter-serveurs).
- L'ordre de création respecte l'ordre d'arrivée des messages.
- Si le bot redémarre, les entrées en attente sont perdues (pas de persistance requise).
- Pas de limite de taille de file définie pour l'instant (à affiner selon les retours).

## Prérequis pour #37 — multi-salons

L'issue #37 (configurer plusieurs salons par serveur) dépend de cette file : sans elle, surveiller plusieurs salons simultanément amplifierait les drops. Une fois la file en place, #37 peut être implémenté en changeant la clé de configuration de `guildId` vers `(guildId, channelId)`.

## Impact sur le schéma

Aucun changement de schéma nécessaire pour la file (en mémoire). Le multi-salons (#37) nécessitera une migration : la table `ThreadCreatorConfig` passera d'une entrée par serveur à une entrée par couple `(guildId, channelId)`.
