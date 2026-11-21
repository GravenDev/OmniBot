# LaTeX

|                   |                 |
| ----------------- | --------------- |
| Identifiant       | `latex`         |
| Configuration     | `/config latex` |
| Intent privilégié | Message Content |
| Utilisé par       | les membres     |

Le bot affiche des formules LaTeX sous forme d'image, avec la commande `/latex` et en réponse aux messages qui contiennent du LaTeX. Le rendu passe par MathJax : `amsmath`, `amssymb`, `mathtools`, `mhchem` (`\ce{…}`), `\newcommand` et `\def` sont disponibles, ainsi que des macros courantes (`\RR`, `\NN`, `\abs`, `\norm`, `\set`…). Les documents complets, `\usepackage` et TikZ ne le sont pas.

## Commandes

### `/latex`

Accès : tout le monde. Réponse : publique.

| Option    | Requise | Valeurs                  | Description                                             |
| --------- | ------- | ------------------------ | ------------------------------------------------------- |
| `formula` | oui     | 1 000 caractères au plus | La formule, sans délimiteurs `$` (ex. : `\frac{a}{b}`). |

Image de la formule, centrée comme entre `$$ … $$`. La formule sert de texte alternatif à l'image. Une formule invalide donne une réponse visible de vous seul, avec le message d'erreur de MathJax.

## Réglages

| Réglage               | Clé          | Type    | Par défaut | Description                                                                                                |
| --------------------- | ------------ | ------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| Détection automatique | `autoDetect` | Booléen | activé     | Rend en image les messages qui contiennent du LaTeX (`$…$`, `$$…$$`, `\[…\]`, `\(…\)`, `\begin{…}`).       |
| Thème                 | `theme`      | Choix   | `light`    | Couleurs des images : `light` (noir sur blanc) ou `dark` (blanc sur gris foncé). Vaut aussi pour `/latex`. |

## Fonctionnement

- Avec la détection automatique, un message qui contient une formule est rendu en image en entier, texte compris. Les prix (`5$ ou 10$`), les variables de shell (`$HOME`), le LaTeX dans du code et les messages qui contiennent un spoiler ne déclenchent rien.
- Le texte du message fait au plus 4 000 caractères. Les formules entre `$ … $` restent dans le texte ; celles entre `$$ … $$`, `\[ … \]` ou dans un environnement `equation`, `align`, `gather`… sont centrées sur leur ligne. Les listes `itemize` et `enumerate` sont mises en page.
- Le bot répond au message sans notifier son auteur, et seulement dans les salons où il peut voir le salon, envoyer des messages, joindre des fichiers et lire l'historique.
- Si le texte ne peut pas être rendu, la réponse donne le message d'erreur de MathJax et invite l'auteur à modifier son message.
- Quand le message est modifié, l'image est mise à jour ; si le LaTeX est retiré, elle est supprimée. Supprimer le message supprime aussi l'image.
- Après un redémarrage du bot, une modification met encore l'image à jour, mais supprimer le message ou en retirer le LaTeX ne supprime plus l'image.
- Les messages des bots sont ignorés.
- Désactiver la détection ne laisse que `/latex` ; une image déjà postée est retirée à la prochaine modification de son message.
- Un rendu trop lourd (trop de macros, plus de 5 secondes de calcul) est refusé avec une erreur.

## Données conservées

| Donnée                                                    | Conservation                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Lien entre un message et l'image du bot (IDs), en mémoire | Les 1 000 derniers, jusqu'au redémarrage du bot. Rien n'est enregistré en base de données. |
| Images publiées                                           | Sur Discord, jusqu'à la suppression du message d'origine ou par un modérateur.             |
