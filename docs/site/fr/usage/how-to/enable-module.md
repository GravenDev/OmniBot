# Activer et configurer un module

Ce guide montre comment activer un module sur votre serveur puis régler ses options.

Avant de commencer : il faut être administrateur du serveur.

## Activer le module

1. Lancez `/modules`. La liste des modules s'affiche, visible de vous seul.
2. Trouvez le module. Utilisez **Suivant ▶** et **◀ Précédent** pour changer de page.
3. Cliquez sur **Activer**. Le module passe à ✅.

Si le module est marqué 🚫 avec un bouton **Indisponible** grisé, il ne peut pas être activé sur ce bot : l'opérateur du bot doit d'abord obtenir de Discord l'intent indiqué sous le module.

## Régler ses options

1. Lancez `/config` et choisissez le module dans l'option `module`. Seuls les modules activés sont proposés.
2. Pour chaque réglage à changer :
   - pour un réglage oui/non, cliquez sur l'interrupteur à droite : vert pour oui, rouge pour non ;
   - pour un autre réglage, cliquez sur le bouton bleu à droite, puis saisissez ou choisissez la valeur.
3. Si le panneau a plusieurs pages, utilisez **Suivant ▶** pour voir les autres réglages.

Le panneau affiche la valeur actuelle de chaque réglage. La mention _(par défaut)_ indique un réglage que personne n'a encore changé.

Pour une durée, saisissez un nombre suivi de `s`, `m`, `h` ou `d` : `30s`, `4h`, `1h30m`, `3d`.

Pour les réglages salon par salon, voir [Régler un module salon par salon](./channel-settings). Pour la liste des réglages d'un module, voir sa page dans la [référence des modules](../reference/modules/).
