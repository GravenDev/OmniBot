# Spec — Module Autopin

Issues : [#15](https://github.com/AsyncCommunityDiscord/OmniBot/issues/15), [#16](https://github.com/AsyncCommunityDiscord/OmniBot/issues/16)  
Priorité : moyenne

---

## Objectif

Remplacer le bot externe Pinpal. Maintenir un message "ancré" en bas d'un salon en le supprimant et le repostant à chaque nouvelle activité dans le salon.

## Comportement

À chaque nouveau message dans un salon configuré, le bot :

1. Supprime le message ancré précédent (posté par le bot)
2. Reposte le contenu ancré en bas du salon
3. Mémorise l'ID du nouveau message pour la prochaine occurrence

Le message ancré est toujours le dernier message visible dans le salon.

## Commandes

### `/autopin set`

**Permission requise :** Gérer les salons

| Paramètre    | Type          | Obligatoire | Description                         |
| ------------ | ------------- | ----------- | ----------------------------------- |
| `salon`      | Salon textuel | Oui         | Salon dans lequel ancrer le message |
| `message-id` | Texte         | Oui         | ID du message Discord à ancrer      |

Configure l'ancrage et poste immédiatement le message en bas du salon.

### `/autopin disable`

**Permission requise :** Gérer les salons

Désactive l'ancrage sur le salon. Le dernier message ancré posté par le bot est supprimé ou laissé en place (à définir).

### `/autopin status`

**Permission requise :** Gérer les salons

Affiche le salon configuré et un aperçu du contenu ancré. Réponse éphémère.

## Permissions requises pour le bot

- Lire les messages du salon
- Envoyer des messages dans le salon
- Supprimer les messages (au minimum les siens)

## Schéma de données

```prisma
model AutopinConfig {
  guildId         String  @id
  channelId       String
  pinnedContent   String  @db.Text
  lastMessageId   String?
  enabled         Boolean @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

## Cas limites à gérer

- Le bot n'a pas la permission de supprimer son propre message → warning loggé, nouvelle tentative ignorée
- Le message source (celui fourni à `/autopin set`) est supprimé → le contenu ancré doit rester opérationnel (il est stocké en base, pas recalculé)
- Salon très actif → le bot peut générer du spam de suppression/repost ; une option de fréquence minimum (ex. toutes les 5 minutes) est envisagée comme amélioration ultérieure

## Ce qui est hors scope (v1)

- Plusieurs messages ancrés par salon
- Fréquence de réancrage configurable
