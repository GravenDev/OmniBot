# Fonctionnement du bot

Documentation du comportement visible par les utilisateurs et administrateurs de serveur Discord.

---

## Module Core

Toujours actif, non désinstallable. Fournit la gestion des modules pour les administrateurs.

### `/modules` — Gérer les modules du serveur

**Permission requise :** Administrateur

Affiche la liste de tous les modules disponibles avec leur statut sur le serveur (activé/désactivé), leur version activée, et leur description. Chaque module dispose d'un bouton **Activer** (vert) ou **Désactiver** (rouge) qui prend effet immédiatement.

### `/config` — Réinitialiser des champs

En bas du panneau `/config` d'un module, un bouton **Réinitialiser…** ouvre un sélecteur (éphémère, visible de l'administrateur seul) listant les champs actuellement personnalisés, plus une entrée **Tous les champs**. Les champs choisis sont remis à leur valeur par défaut.

Le bouton est désactivé tant qu'aucun champ n'a été personnalisé (rien à réinitialiser). Réinitialiser un champ retire simplement la valeur enregistrée : il repasse sur le défaut (qui suit alors de nouveau la langue du serveur, cf. plus bas) et son marqueur _(par défaut)_ réapparaît.

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

---

## Module IMC

Permet aux membres d'enregistrer leur IMC (poids / taille²) et affiche un
classement du serveur par IMC décroissant.

### `/imc record` — Enregistrer son IMC

Options :

| Option   | Type   | Contraintes       | Description           |
| -------- | ------ | ----------------- | --------------------- |
| `weight` | Nombre | 20 – 300 (requis) | Poids en kilogrammes  |
| `height` | Nombre | 50 – 250 (requis) | Taille en centimètres |

Le bot calcule l'IMC (`poids / taille²`), l'enregistre (un seul enregistrement
par membre et par serveur — un nouvel envoi écrase le précédent) et répond en
**éphémère** avec l'IMC arrondi à une décimale et sa catégorie OMS (maigreur,
normal, surpoids, obésité).

### `/imc view` — Consulter un IMC

Option `target` (utilisateur, facultatif — vous-même par défaut). Réponse en
**éphémère**. Si le membre n'a rien enregistré, le bot l'indique.

### `/imc leaderboard` — Classement du serveur

Option `limit` (entier 1 – 25, défaut 10). Réponse **publique** : liste des
membres ayant enregistré leur IMC, triés par IMC décroissant, avec mention,
IMC et catégorie.

**Confidentialité :** `record` et `view` répondent en éphémère (données de
santé visibles du seul demandeur) ; seul `leaderboard` est public — c'est le
but affiché de la fonctionnalité, chaque membre choisissant d'y figurer en
enregistrant son IMC.
