# Vos premiers pas avec OmniBot

Dans ce tutoriel, nous allons activer un premier module sur votre serveur, le configurer, puis le voir fonctionner. Nous prenons le module **Messages collants** : il garde un message en bas d'un salon.

Il vous faut :

- être administrateur du serveur ;
- avoir invité OmniBot sur le serveur ;
- un salon textuel où le bot peut voir le salon et envoyer des messages. Un salon de test convient très bien.

## 1. Repérer le message de bienvenue

À son arrivée, le bot poste un message dans le salon système du serveur : « Merci de m'avoir invité ! ». Il vous invite à commencer par `/modules`. C'est ce que nous allons faire.

Si vous ne le trouvez pas, ce n'est pas grave : il a pu être envoyé en message privé au propriétaire du serveur. Passez à l'étape suivante.

Le bot parle anglais tant que vous n'avez pas changé sa langue, même si ce message de bienvenue est en français. Pour retrouver les libellés de ce tutoriel, passez-le d'abord en français avec le guide [Changer la langue du bot](../how-to/change-language), puis revenez ici.

## 2. Activer le module

Dans n'importe quel salon, tapez `/modules` et validez.

Le bot répond par la liste des modules, visible de vous seul. Un module qui n'est pas activé est marqué ❌. Sur un serveur où le bot vient d'arriver pour la première fois, aucun module n'est encore activé.

Cherchez **Messages collants**. La liste montre 5 modules par page : utilisez **Suivant ▶** pour avancer. Cliquez sur le bouton vert **Activer** du module.

Remarquez que le module passe à ✅ et que son bouton devient rouge, **Désactiver**. Le module est activé sur votre serveur.

## 3. Ouvrir sa configuration

Tapez `/config` puis, dans l'option `module`, choisissez **Messages collants**.

Le bot affiche le panneau « Paramètres · `Messages collants` ». Il contient un seul réglage, **Messages collants**, avec un bouton bleu à droite. Cliquez dessus.

Un éditeur s'ouvre, visible de vous seul. Il indique « Aucun salon configuré pour l'instant ».

## 4. Ajouter un message collant

Cliquez sur **Ajouter**. Un formulaire s'ouvre :

1. Dans **Salon**, choisissez votre salon de test.
2. Dans **Message**, écrivez par exemple : `Bienvenue ! Lisez les règles avant de poster.`
3. Validez.

L'éditeur affiche « Le message reste désormais en bas de #votre-salon ». Votre salon apparaît dans la liste.

## 5. Voir le module fonctionner

Allez dans votre salon de test. Votre message collant y est déjà, posté par le bot.

Écrivez maintenant un message quelconque dans ce salon, par exemple `Bonjour`.

Le bot republie le message collant juste en dessous du vôtre et supprime l'ancien. Le message collant est toujours le dernier du salon. Écrivez un deuxième message : il revient encore en bas.

## Ce que vous avez fait

Vous avez activé un module avec `/modules`, réglé ce module avec `/config` et vérifié qu'il fonctionne. Tous les autres modules s'activent et se configurent de la même façon.

Pour continuer :

- [Activer et configurer un module](../how-to/enable-module), pour les autres modules ;
- [Désactiver un module](../how-to/disable-module), si vous voulez retirer les Messages collants de votre serveur de test ;
- la [liste des modules](../reference/modules/), pour choisir les suivants.
