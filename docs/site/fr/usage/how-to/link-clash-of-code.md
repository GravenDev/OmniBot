# Lier son compte Clash of Code

Ce guide montre comment lier votre compte Discord à votre joueur CodinGame, pour que `/coc profile` vous trouve sans option et que le classement affiche votre ligne.

Avant de commencer : un administrateur doit avoir activé le module Clash of Code sur le serveur, et vous devez avoir joué au moins une partie dont le lien a été posté sur le serveur et suivi par le bot.

1. Sur le serveur, lancez `/coc link`, puis choisissez votre pseudo CodinGame dans la liste de l'option `player`.
2. Le bot répond, à vous seul : « Votre compte est maintenant lié à **&lt;pseudo&gt;** ».
3. Pour voir votre profil, lancez `/coc profile`.

Si le bot répond qu'aucune partie de ce joueur n'a été enregistrée, jouez une partie et postez son lien sur le serveur avant qu'elle se termine, puis recommencez. S'il répond que le joueur est déjà lié à un autre membre et qu'il s'agit bien de vous, demandez à un administrateur de le délier.

Pour changer de joueur, relancez `/coc link` avec l'autre pseudo : il remplace le précédent. Pour vous délier, lancez `/coc unlink` ; vos parties restent enregistrées.

Toutes les commandes et options : [référence du module Clash of Code](../reference/modules/clash-of-code).
