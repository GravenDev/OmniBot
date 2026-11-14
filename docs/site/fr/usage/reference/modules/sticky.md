# Messages collants

|                   |                                |
| ----------------- | ------------------------------ |
| Identifiant       | `sticky`                       |
| Configuration     | `/config sticky`               |
| Intent privilégié | aucun                          |
| Utilisé par       | les administrateurs (réglages) |

Le bot garde un message en bas des salons configurés : après chaque nouveau message, il republie le message collant puis supprime l'ancien. Chaque salon a un seul message collant.

## Commandes

Aucune commande.

## Réglages

| Réglage           | Clé        | Type               | Par défaut | Description                                                                                                                                  |
| ----------------- | ---------- | ------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Messages collants | `stickies` | Réglages par salon | aucun      | Pour chaque salon textuel ou d'annonces : **Message**, le texte gardé en bas (2000 caractères au plus, Markdown et sauts de ligne acceptés). |

À l'enregistrement, le message est publié tout de suite en bas du salon. Le bot refuse un salon où il ne peut pas voir le salon ou envoyer des messages. **Supprimer** retire aussi la dernière publication du salon ; si le bot ne peut pas la supprimer, l'éditeur demande de le faire à la main.

## Fonctionnement

- Tous les nouveaux messages du salon déclenchent la republication : ceux des membres, des bots, des webhooks, les messages système et les autres messages du bot. Un autre bot de messages collants actif dans le même salon doit être retiré, sinon les deux se republient sans fin.
- Lors d'une rafale de messages, les republications sont regroupées, et le message collant finit toujours en dernier.
- Le nouveau message est publié avant la suppression de l'ancien : si la publication échoue, l'ancien reste en place.
- Le message collant ne mentionne personne, même s'il contient `@everyone` ou une mention de rôle, et il est publié sans notification.
- Si le bot n'a plus accès au salon ou ne peut plus y écrire, il cesse d'essayer pendant 10 minutes. Enregistrer de nouveau le message dans `/config sticky` relance une tentative tout de suite.
- Les messages des fils ne sont pas concernés.
- La suppression d'un salon retire son message collant.

## Données conservées

| Donnée                                                                   | Conservation                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Salon configuré, texte du message collant, ID de sa dernière publication | Jusqu'au retrait dans `/config sticky` ou la suppression du salon. |
