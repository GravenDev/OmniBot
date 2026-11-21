# Commandes du bot

|                   |                                                                     |
| ----------------- | ------------------------------------------------------------------- |
| Identifiant       | `core`                                                              |
| Configuration     | `/config core` (« Configuration Globale »)                          |
| Intent privilégié | aucun                                                               |
| Utilisé par       | les administrateurs (modules), tout le monde (`/pings`, `/privacy`) |

Le cœur du bot est toujours actif et ne peut pas être désactivé. Il gère les modules de chaque serveur et les préférences des membres.

## Commandes

### `/modules`

Accès : administrateurs. Réponse : visible de vous seul.

Aucune option.

Liste des modules, 5 par page, avec les boutons **◀ Précédent** et **Suivant ▶**. Chaque module est marqué ✅ (activé), ❌ (désactivé) ou 🚫 (indisponible), avec sa description et un bouton **Activer**, **Désactiver** ou **Indisponible** (grisé). Un module 🚫 indique l'intent privilégié que Discord n'a pas accordé au bot. Pour les modules Anniversaires et Ancienneté, quand des anniversaires ou des anciennetés recalculées seraient supprimés, **Désactiver** affiche d'abord un avertissement avec **Désactiver et supprimer** et **Annuler** ; sans rien à perdre, il prend effet aussitôt.

### `/config`

Accès : administrateurs. Réponse : publique.

| Option   | Requise | Valeurs                                        | Description             |
| -------- | ------- | ---------------------------------------------- | ----------------------- |
| `module` | oui     | un module activé, ou **Configuration Globale** | Le module à configurer. |

Panneau « Paramètres » du module : chaque réglage avec son type, sa description et sa valeur actuelle, marquée _(par défaut)_ tant qu'elle n'a pas été changée. À droite de chaque réglage :

- un interrupteur (vert/rouge) pour un réglage oui/non ;
- un bouton bleu pour les autres réglages : saisie, menu de choix ou éditeur.

En bas : **◀ Précédent** et **Suivant ▶** quand le panneau a plusieurs pages, et **Réinitialiser…**, qui remet les réglages choisis (ou **Tous les champs**) à leur valeur par défaut. Les réglages par salon ne sont pas réinitialisés.

Types de réglages :

| Type                                | Saisie                                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Texte                               | Champ de texte. Les codes d'emoji connus (`:tada:`) sont remplacés par l'emoji.                                                                           |
| Nombre                              | Champ de texte, un nombre.                                                                                                                                |
| Booléen                             | Interrupteur.                                                                                                                                             |
| Durée                               | Nombre suivi de `s`, `m`, `h` ou `d` : `30s`, `5m`, `4h`, `1h30m`, `3d`.                                                                                  |
| Emoji                               | Un emoji (🚩), son nom Discord (`:smile:`) ou le nom d'un emoji du serveur (`:nom:`).                                                                     |
| Salon, Catégorie, Rôle, Utilisateur | Menu de sélection Discord.                                                                                                                                |
| Choix                               | Menu avec les valeurs possibles.                                                                                                                          |
| Liste de …                          | Menu à choix multiples pour des salons, rôles, catégories ou utilisateurs ; éditeur avec **Ajouter** et **Supprimer** pour des textes, nombres ou emojis. |
| Réglages par salon                  | Éditeur, 7 salons par page, avec **Ajouter**, **Modifier** et **Supprimer**.                                                                              |

### `/pings`

Accès : tout le monde. Réponse : visible de vous seul.

| Option    | Requise | Valeurs         | Description                                            |
| --------- | ------- | --------------- | ------------------------------------------------------ |
| `enabled` | oui     | `True`, `False` | Être mentionné par les annonces du bot sur ce serveur. |

`False` : le bot ne vous mentionne plus dans ses annonces sur ce serveur ; votre nom reste affiché. `True` : il vous mentionne de nouveau. Le réglage vaut pour les annonces de tous les modules du serveur (anniversaires, ancienneté, RNGdle).

### `/privacy delete`

Accès : tout le monde. Réponse : visible de vous seul.

Aucune option.

Affiche ce qui sera supprimé et un bouton **Supprimer mes données**. Le bouton efface, sur ce serveur seulement, que les modules soient activés ou non :

- vos compteurs de Statistiques du serveur ;
- au Jeu des 4h : votre score, l'historique de vos points, vos points du jour, et le dernier message du salon de jeu si vous en êtes l'auteur ;
- votre compte, vos tirages, votre rappel et vos cartes du jour RNGdle ;
- le lien vers votre joueur Clash of Code (le joueur et ses résultats, venus de CodinGame, restent au classement) ;
- votre anniversaire (et le rôle d'anniversaire, si vous l'avez aujourd'hui) ;
- votre ancienneté recalculée ;
- votre préférence `/pings`.

Les signalements ne sont pas supprimés : ils restent aux modérateurs jusqu'à leur purge. Si une partie échoue, le reste est quand même supprimé et le message invite à réessayer.

## Réglages

| Réglage | Clé      | Type  | Par défaut | Description                                         |
| ------- | -------- | ----- | ---------- | --------------------------------------------------- |
| Langue  | `locale` | Choix | anglais    | Langue du bot sur le serveur : anglais ou français. |

## Fonctionnement

- À son arrivée sur un serveur, le bot poste un message de bienvenue dans le salon système, en français si la langue du serveur dans Discord est le français et en anglais sinon, ou l'envoie en message privé au propriétaire si ce salon est indisponible. Aucun module n'est activé.
- Quand le bot quitte un serveur, la configuration et les modules activés sont gardés, et restaurés s'il est réinvité. Les données à durée de conservation limitée sont tout de même supprimées à leur échéance (les signalements, par exemple).
- Une commande d'un module désactivé répond qu'elle n'est pas activée sur ce serveur.
- Les messages d'erreur ne sont visibles que de la personne concernée. Si l'erreur vient d'une permission manquante du bot, le message le dit.
- Les images des modules affichent chaque membre sous son surnom et son avatar de serveur.

## Données conservées

| Donnée                                           | Conservation                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Configuration des modules du serveur             | Tant que le bot est sur le serveur, et après son départ, pour être restaurée s'il revient. |
| Modules activés et leur version                  | Comme la configuration.                                                                    |
| Préférence `/pings` (ID du serveur et du membre) | Jusqu'à `/pings enabled:True` ou `/privacy delete`.                                        |
