# Enregistrer son anniversaire

Ce guide montre comment enregistrer votre anniversaire pour que le bot vous le souhaite sur le serveur.

Avant de commencer : un administrateur doit avoir activé le module Anniversaires et défini son salon des annonces.

1. Sur le serveur, lancez `/birthday set` avec le jour dans `day` et le mois dans `month`. Par exemple, pour le 14 mars : `day` sur **14**, `month` sur **mars**.
2. Pour être compté dans les statistiques sans être annoncé, ajoutez l'option `announce` sur **False**.
3. Le bot répond, à vous seul, par une fiche « Anniversaire enregistré » : la date, le salon où elle sera annoncée et les membres qui partagent votre date.

Pour changer d'avis sur l'annonce, cliquez sur **Ne plus annoncer mon anniversaire** (ou **Annoncer mon anniversaire**) sous la fiche. Pour revoir la fiche plus tard, lancez `/birthday show`. Pour supprimer votre anniversaire, lancez `/birthday remove`.

Seuls le jour et le mois sont conservés, jamais l'année. Toutes les commandes sont dans la [référence du module Anniversaires](../reference/modules/birthday).
