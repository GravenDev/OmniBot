# Lier son compte RNGdle

Ce guide montre comment lier votre compte Discord à votre pseudo [rngdle.com](https://www.rngdle.com), pour que vos tirages comptent dans les classements du serveur.

Avant de commencer : un administrateur doit avoir activé le module RNGdle sur le serveur, et vous devez connaître votre pseudo sur rngdle.com.

1. Sur le serveur, lancez `/rngdle link` avec votre pseudo RNGdle dans l'option `username`.
2. Le bot répond, à vous seul : « Votre compte est maintenant lié au compte RNGdle `<pseudo>` », avec le nombre de tirages importés.
3. Pour voir votre profil, lancez `/rngdle profile`.

Pour être mentionné le soir si vous n'avez pas encore tiré, lancez `/rngdle remind` avec `enabled` sur **True**.

Si le bot répond qu'aucun compte ne porte ce nom, vérifiez l'orthographe de votre pseudo sur rngdle.com. S'il répond que le pseudo est déjà lié à un autre membre et qu'il s'agit bien du vôtre, contactez un administrateur.

Pour changer de pseudo, lancez d'abord `/rngdle unlink`, puis cliquez sur **Délier** : vos tirages enregistrés sur ce serveur sont supprimés. Lancez ensuite `/rngdle link` avec le nouveau pseudo.

Toutes les commandes et options : [référence du module RNGdle](../reference/modules/rngdle).
