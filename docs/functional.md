# Fonctionnement du bot

Documentation du comportement visible par les utilisateurs et administrateurs de serveur Discord.

---

## Module Core

Toujours actif, non désinstallable. Fournit la gestion des modules pour les administrateurs.

### `/modules` — Gérer les modules du serveur

**Permission requise :** Administrateur

Affiche la liste de tous les modules disponibles avec leur statut sur le serveur (activé/désactivé), leur version activée, et leur description. Chaque module dispose d'un bouton **Activer** (vert) ou **Désactiver** (rouge) qui prend effet immédiatement.

---

## Module Thread Creator

Crée automatiquement un fil de discussion sous chaque nouveau message dans un salon configuré. Remplace le bot Needle.

### Comportement automatique

Dès qu'un message est posté dans le salon configuré :

1. Le bot crée un fil dont le nom est généré depuis le template configuré
2. Si un message de bienvenue est configuré, le bot le poste dans le fil

**Variables disponibles dans le template de nom :**
| Variable | Valeur |
|---|---|
| `{messageAuthor}` | Nom d'affichage ou pseudo de l'auteur |
| `{messageContent}` | 50 premiers caractères du message |
| `{timestamp}` | Heure au format `JJ/MM HH:MM` (locale française) |

**Template par défaut :** `Discussion - {messageAuthor}`  
**Message de bienvenue par défaut :** `💬 Utilisez ce fil pour discuter de ce sujet !`

**Limites :**

- Noms de fils tronqués à 100 caractères (limite Discord)
- Rate limit : 5 fils max par fenêtre de 10 secondes par serveur — les messages supplémentaires sont ignorés silencieusement
- Messages de bots ignorés
- Ne fonctionne pas dans les fils, salons vocaux, forum ou annonces

**Erreurs gérées silencieusement :**

- Message supprimé avant création du fil
- Limite de fils atteinte sur le salon
- Permissions insuffisantes

### `/thread-config setup` — Configurer le module

**Permission requise :** Gérer les salons

| Paramètre           | Type          | Obligatoire | Description                                   |
| ------------------- | ------------- | ----------- | --------------------------------------------- |
| `canal`             | Salon textuel | Oui         | Salon à surveiller                            |
| `message-bienvenue` | Texte         | Non         | Message posté automatiquement dans chaque fil |
| `nom-template`      | Texte         | Non         | Template du nom des fils                      |
| `actif`             | Booléen       | Non         | Activer ou désactiver la création automatique |

### `/thread-config status` — Voir la configuration actuelle

**Permission requise :** Gérer les salons  
Affiche la configuration active : salon surveillé, statut, message de bienvenue, template, date de création. Réponse éphémère.

### `/thread-config disable` — Désactiver sans supprimer la configuration

**Permission requise :** Gérer les salons  
Désactive la création automatique de fils sans effacer la configuration existante.
