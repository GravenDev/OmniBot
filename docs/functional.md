# Fonctionnement du bot

Documentation du comportement visible par les utilisateurs et administrateurs de serveur Discord.

---

## Arrivée et départ du bot

Quand le bot est invité sur un serveur, ses données sont initialisées et un message de bienvenue est posté dans le salon système (ou envoyé en MP au propriétaire si le salon système est indisponible). Le message pointe vers `/modules` et `/config`. Rien d'autre n'est activé automatiquement : seuls les administrateurs décident quels modules activer.

Quand le bot quitte un serveur, rien n'est effacé : si le bot est réinvité plus tard, la configuration et les modules activés sont restaurés automatiquement (y compris leurs commandes).

## Module Core

Toujours actif, non désinstallable. Fournit la gestion des modules pour les administrateurs.

### `/modules` — Gérer les modules du serveur

**Permission requise :** Administrateur

Affiche la liste de tous les modules disponibles avec leur statut sur le serveur (activé/désactivé), leur version activée, et leur description. Chaque module dispose d'un bouton **Activer** (vert) ou **Désactiver** (rouge) qui prend effet immédiatement.

### `/config` — Réinitialiser des champs

En bas du panneau `/config` d'un module, un bouton **Réinitialiser…** ouvre un sélecteur (éphémère, visible de l'administrateur seul) listant les champs actuellement personnalisés, plus une entrée **Tous les champs**. Les champs choisis sont remis à leur valeur par défaut.

Le bouton est désactivé tant qu'aucun champ n'a été personnalisé (rien à réinitialiser). Réinitialiser un champ retire simplement la valeur enregistrée : il repasse sur le défaut (qui suit alors de nouveau la langue du serveur, cf. plus bas) et son marqueur _(par défaut)_ réapparaît.

---

## Module Jeu des 4h

Repris du bot DJ4H. Dans le salon de jeu, le dernier message posté « tient » : si personne d'autre n'écrit pendant le délai configuré (4 h par défaut), son auteur marque un point au message suivant.

### Comportement automatique

À chaque message posté dans le salon configuré :

1. Si c'est le premier message suivi, il devient le dernier message, sans point.
2. S'il vient de l'auteur du dernier message, il est ignoré : le dernier message ne change pas, et un joueur ne peut donc pas relancer son propre délai.
3. Si le délai s'est écoulé depuis le dernier message, **l'auteur du dernier message** marque un point ; le bot l'annonce dans le salon avec son nouveau total.
4. Dans tous les autres cas, le nouveau message devient le dernier message.

Les messages de bots, les messages système (arrivée d'un membre, épinglage, boost…), les messages hors du salon (y compris dans ses fils) et les messages privés sont ignorés. Un message plus ancien que le dernier message enregistré (reçu dans le désordre) est ignoré lui aussi. Après un changement de salon de jeu, le dernier message de l'ancien salon ne compte plus : la partie repart du premier message posté dans le nouveau. Il en va de même quand le module est réactivé après avoir été désactivé.

Un message supprimé ne compte plus : si c'était le dernier message, c'est le message de joueur précédent encore présent dans le salon qui redevient le dernier message, avec son heure d'envoi réelle. Si le salon n'en contient plus, la partie repart du prochain message.

Au démarrage, le bot relit le vrai dernier message de joueur de chaque salon de jeu pour rattraper les messages postés ou supprimés pendant qu'il était arrêté. Les points qui auraient dû être gagnés pendant l'arrêt ne sont pas rattrapés. Les messages d'un même serveur sont traités un par un : deux messages simultanés ne peuvent pas marquer deux fois sur le même prédécesseur.

### `/jd4h score [member]`

Affiche le score du membre indiqué, ou le sien par défaut.

### `/jd4h leaderboard`

Génère une image du top 10 du serveur (rang, médailles pour le podium, avatar, pseudo, score). Les membres à 0 point et ceux dont le compte Discord est introuvable n'y figurent pas. L'image est réutilisée pendant 15 secondes par serveur et par langue, et régénérée dès qu'un score change.

### `/jd4h-admin set <member> <score>` et `/jd4h-admin unset <member>`

**Permission requise :** Administrateur

Fixe le score d'un membre, ou le supprime. Fixer un score à 0 revient à le supprimer. Réponses éphémères.

### Configuration — `/config four-hour-game`

| Champ     | Type  | Description                                                                               |
| --------- | ----- | ----------------------------------------------------------------------------------------- |
| `channel` | Salon | Salon du jeu. Tant qu'il n'est pas défini, le module ne fait rien.                        |
| `delay`   | Durée | Délai pour marquer un point, saisi comme `30s`, `5m`, `4h`, `1h30m`, `3d`. Défaut : `4h`. |

---

## Module Thread Creator

Crée automatiquement un fil de discussion sous chaque nouveau message dans un salon configuré. Remplace le bot Needle.

### Comportement automatique

Dès qu'un message est posté dans le salon configuré :

1. Le bot crée un fil dont le nom est généré depuis le template configuré
2. Si un message de bienvenue est configuré, le bot le poste dans le fil

**Variables disponibles dans le template de nom :**

| Variable           | Valeur                                           |
| ------------------ | ------------------------------------------------ |
| `{messageAuthor}`  | Nom d'affichage ou pseudo de l'auteur            |
| `{messageContent}` | 50 premiers caractères du message                |
| `{timestamp}`      | Heure au format `JJ/MM HH:MM` (locale française) |

**Template par défaut :** `Discussion - {messageAuthor}`  
**Message de bienvenue par défaut :** `💬 Utilisez ce fil pour discuter de ce sujet !`

> [!NOTE]
> Les valeurs par défaut suivent la langue du serveur (`/config core`) : tant
> qu'un administrateur n'a pas saisi sa propre valeur, le message de bienvenue
> par défaut s'affiche dans la langue configurée et change si on bascule la
> langue. Dès qu'une valeur est définie manuellement, elle est figée et
> n'est plus affectée par la langue. Dans `/config`, une valeur encore par
> défaut est signalée par le marqueur _(par défaut)_, ce qui permet de voir
> d'un coup d'œil ce qui a réellement été configuré.

**Limites :**

- Noms de fils tronqués à 100 caractères (limite Discord)
- Rate limit : 5 fils max par fenêtre de 10 secondes par serveur — les créations excédentaires sont **mises en file d'attente** (FIFO, par serveur) et traitées dès que la fenêtre se libère, au lieu d'être ignorées. File en mémoire : perdue au redémarrage.
- Messages de bots ignorés
- Ne fonctionne pas dans les fils, salons vocaux, forum ou annonces

**Erreurs gérées silencieusement :**

- Message supprimé avant création du fil
- Limite de fils atteinte sur le salon
- Permissions insuffisantes

### Configuration — `/config thread-creator`

Depuis la v2.0.0, le module utilise le système de configuration générique. Il n'a
plus de commande dédiée : la configuration se fait via `/config thread-creator`
(réservé aux administrateurs) et l'activation/désactivation via `/modules`.

| Champ                | Type           | Description                                                                                  |
| -------------------- | -------------- | -------------------------------------------------------------------------------------------- |
| `channels`           | Salons (liste) | Salons à surveiller (un ou plusieurs, multi-select). Liste vide = rien n'est surveillé.      |
| `welcomeMessage`     | Texte          | Message posté automatiquement dans chaque fil créé.                                          |
| `threadNameTemplate` | Texte          | Template du nom des fils — variables : `{messageAuthor}`, `{messageContent}`, `{timestamp}`. |

Il n'y a plus de flag `actif` : désactiver le module via `/modules` arrête la
surveillance sans effacer la configuration.
