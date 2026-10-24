# Fonctionnement du bot

Documentation du comportement visible par les utilisateurs et administrateurs de serveur Discord.

---

## Arrivée et départ du bot

Quand le bot est invité sur un serveur, ses données sont initialisées et un message de bienvenue est posté dans le salon système (ou envoyé en MP au propriétaire si le salon système est indisponible). Le message pointe vers `/modules` et `/config`. Rien d'autre n'est activé automatiquement : seuls les administrateurs décident quels modules activer.

Quand le bot quitte un serveur, rien n'est effacé : si le bot est réinvité plus tard, la configuration et les modules activés sont restaurés automatiquement (y compris leurs commandes). Si les commandes d'un module ne peuvent pas être réinstallées à ce moment-là, le module reste activé et le bot réessaie à son prochain démarrage.

## Module Core

Toujours actif, non désinstallable. Fournit la gestion des modules pour les administrateurs.

### `/modules` — Gérer les modules du serveur

**Permission requise :** Administrateur

Affiche la liste de tous les modules disponibles avec leur statut sur le serveur (activé/désactivé), leur version activée, et leur description. Chaque module dispose d'un bouton **Activer** (vert) ou **Désactiver** (rouge) qui prend effet immédiatement.

Un module qui a besoin d'un intent privilégié (Server Members, Presence ou Message Content) que Discord n'a pas accordé au bot n'est pas chargé : il n'apparaît pas dans la liste et ne fait rien, sur aucun serveur. Ses commandes slash et de menu contextuel encore présentes sur un serveur répondent, en message visible de soi seul, qu'elles sont indisponibles ; l'autocomplétion de ses commandes et les boutons de ses anciens messages restent sans réponse. Son activation et sa configuration sont conservées, même quand on modifie la configuration d'un autre module ; il reprend au premier redémarrage qui suit l'octroi de l'intent. Si le bot a été réinvité sur un serveur pendant que le module était écarté, et que le bot était en ligne à ce moment-là, les commandes du module y sont réinstallées à son retour.

### `/config` — Réinitialiser des champs

En bas du panneau `/config` d'un module, un bouton **Réinitialiser…** ouvre un sélecteur (éphémère, visible de l'administrateur seul) listant les champs actuellement personnalisés, plus une entrée **Tous les champs**. Les champs choisis sont remis à leur valeur par défaut.

Le bouton est désactivé tant qu'aucun champ n'a été personnalisé (rien à réinitialiser). Réinitialiser un champ retire simplement la valeur enregistrée : il repasse sur le défaut (qui suit alors de nouveau la langue du serveur, cf. plus bas) et son marqueur _(par défaut)_ réapparaît.

### `/pings` — Ne plus être mentionné

**Permission requise :** aucune

`/pings enabled:False` inscrit le membre sur la liste des personnes que le bot ne mentionne plus dans ses annonces sur ce serveur ; `/pings enabled:True` l'en retire. La liste est propre à chaque serveur et commune à tous les modules. Le nom du membre reste affiché dans les annonces, mais il n'en reçoit plus de notification. La réponse n'est visible que de lui.

### Erreurs

Quand une commande ou un bouton échoue, la réponse d'erreur n'est visible que du membre concerné et lui indique quoi faire : relancer la commande, et prévenir un administrateur si le problème persiste. Un bouton devenu invalide (module ou option de configuration disparus depuis l'affichage du message) invite à relancer la commande pour obtenir un message à jour. Si l'échec vient d'une permission ou d'un accès manquant au bot sur Discord, le message le dit explicitement : un administrateur doit vérifier les permissions du bot sur le serveur et dans le salon.

### Noms et avatars dans les images

Les images générées par les modules (classements, profils, statistiques) affichent chaque joueur sous son surnom sur le serveur, avec son avatar de serveur s'il en a un. Si le joueur a quitté le serveur, son nom d'affichage et son avatar Discord globaux sont utilisés à la place. Un nom trop long est écrit plus petit ; sur les fiches (profil, statistiques du serveur), s'il ne tient toujours pas, il est raccourci et terminé par « … ».

---

## Module Jeu des 4h

Repris du bot DJ4H. Dans le salon de jeu, le dernier message posté « tient » : si personne d'autre n'écrit pendant le délai configuré (4 h par défaut), son auteur marque un point au message suivant. En parallèle, chaque jour, le message resté le plus longtemps sans réponse rapporte un **point du jour**, compté à part.

### Comportement automatique

À chaque message posté dans le salon configuré :

1. Si c'est le premier message suivi, il devient le dernier message, sans point.
2. S'il vient de l'auteur du dernier message, il est ignoré : le dernier message ne change pas, et un joueur ne peut donc pas relancer son propre délai.
3. Si le délai s'est écoulé depuis le dernier message, **l'auteur du dernier message** marque un point ; le bot l'annonce dans le salon (voir ci-dessous).
4. Dans tous les autres cas, le nouveau message devient le dernier message.

L'annonce d'un point indique combien de temps le message est resté sans réponse (« 4 h 12 min », deux unités au plus), le nouveau total du gagnant et son rang au classement du serveur (« 3ᵉ sur 17 »), avec l'avatar de serveur du gagnant en vignette et, en pied, l'heure d'envoi du message gagnant (affichée dans le fuseau de chaque lecteur). Personne n'est notifié. Si le rang ou l'avatar ne peuvent pas être obtenus, l'annonce part sans eux.

Chaque point gagné est aussi inscrit dans l'historique du serveur, avec la durée pendant laquelle le message a tenu et l'heure du message qui l'a fait gagner. Cet historique alimente la carte de `/jd4h score` ; il n'existe que pour les points gagnés depuis sa mise en place.

Les messages de bots, les messages système (arrivée d'un membre, épinglage, boost…), les messages hors du salon (y compris dans ses fils) et les messages privés sont ignorés. Un message plus ancien que le dernier message enregistré (reçu dans le désordre) est ignoré lui aussi. Après un changement de salon de jeu, le dernier message de l'ancien salon ne compte plus : la partie repart du premier message posté dans le nouveau. Il en va de même quand le module est réactivé après avoir été désactivé.

Un message supprimé ne compte plus : si c'était le dernier message, c'est le message de joueur précédent encore présent dans le salon qui redevient le dernier message, avec son heure d'envoi réelle (si son auteur a posté plusieurs messages d'affilée, le premier de la série, comme pendant la partie). Si le salon n'en contient plus, la partie repart du prochain message.

Au démarrage, le bot relit le vrai dernier message de joueur de chaque salon de jeu (le premier de la dernière série d'un même joueur, puisque reposter ne remplace pas son propre message) pour rattraper les messages postés ou supprimés pendant qu'il était arrêté. Les points qui auraient dû être gagnés pendant l'arrêt ne sont pas rattrapés. Les messages d'un même serveur sont traités un par un : deux messages simultanés ne peuvent pas marquer deux fois sur le même prédécesseur.

### Point du jour

Les journées suivent l'heure de Paris (minuit à minuit). Chaque fois qu'un message cesse d'être le dernier (un autre joueur répond), le temps pendant lequel il a tenu est attribué à son auteur, découpé par journée : un message posté à 22 h et remplacé à 3 h compte 2 h pour la première journée et 3 h pour la suivante. Le délai configuré ne joue aucun rôle : une tenue de 40 minutes peut remporter la journée, et une tenue qui rapporte un point des 4h compte aussi. Le meilleur temps de chaque journée est retenu ; à égalité, le premier à l'avoir atteint le garde. Un temps déjà attribué reste acquis, même si son message est supprimé ensuite.

À minuit (heure de Paris), le bot clôt la journée écoulée sur chaque serveur : le message encore en place compte jusqu'à minuit, puis l'auteur du meilleur temps de la journée gagne son point du jour. Le bot l'annonce dans le salon de jeu, sans notifier personne : la journée, le temps tenu, son total de points du jour et son rang à ce classement à la fin de cette journée, avec son avatar en vignette. Une journée où aucun message n'a été en place n'attribue rien ; un message resté en place toute la journée, même sans aucune réponse, la remporte avec la journée entière (24 h, 23 h ou 25 h les jours de changement d'heure). Une journée n'est jamais close deux fois. Une annonce qui ne peut pas être envoyée (salon supprimé, permission retirée) est perdue, mais la journée est close quand même et les annonces suivantes partent.

La clôture est aussi tentée au démarrage, après la relecture des salons : les journées écoulées pendant un arrêt sont closes et annoncées, une par une. La relecture rejoue les 50 derniers messages du salon postés pendant l'arrêt comme s'ils avaient été vus en direct : le message qui était en place est crédité jusqu'à la première réponse d'un autre joueur, puis chaque réponse jusqu'à la suivante. Si personne n'a répondu, ou si seul son auteur a reposté, il reste en place et est crédité jusqu'à minuit, comme s'il avait été vu tenir. S'il a été supprimé pendant l'arrêt, la partie reprend sur le dernier message en place, sans crédit. Si la relecture d'un salon échoue, ou si un message y arrive avant qu'elle soit faite, le message qui était en place à l'arrêt est crédité de toute la durée de l'arrêt.

Sur un serveur, le décompte commence le jour du premier message traité ou du premier démarrage après la mise en place du point du jour. Quand le module est réactivé après avoir été désactivé, les journées qui n'avaient pas été closes sont oubliées et le décompte repart du jour de la réactivation ; les points du jour déjà gagnés sont conservés et restent visibles.

### `/jd4h score [member]`

Affiche la carte du membre indiqué, ou la sienne par défaut : une image avec son avatar et son surnom sur le serveur (à défaut, ceux de son compte Discord) et son rang parmi les joueurs du serveur qui ont au moins un point (médaille pour le podium, sinon « #3 / 17 »). Le rang suit l'ordre de `/jd4h leaderboard` : score décroissant, puis identifiant Discord pour départager les égalités.

La carte montre :

- **Points** : le score total ;
- **Ce mois-ci** : les points gagnés depuis le 1ᵉʳ du mois (UTC) ;
- **Meilleur temps tenu** : la plus longue durée pendant laquelle un de ses messages gagnants est resté sans réponse ;
- **Série en cours** : le nombre de points d'affilée qu'il a remportés sur le serveur, sans qu'un autre joueur marque entre deux (0 si le dernier point du serveur est à quelqu'un d'autre), avec son record en dessous ;
- **Dernier point** : la date de son dernier point (UTC) ;
- **Points du jour** : le nombre de journées qu'il a remportées, avec son rang à ce classement en dessous (« #2 sur 9 »).

Ces valeurs viennent de l'historique : un joueur dont tous les points sont antérieurs à l'historique (ou ont été fixés par un administrateur) voit « — » à leur place. Un membre sans score ni point du jour reçoit un simple message texte ; un membre qui n'a que des points du jour voit 0 point. L'image est réutilisée pendant 15 secondes par serveur, langue et membre, et régénérée dès qu'un score change.

### `/jd4h leaderboard [type]`

Génère une image du top 10 du serveur (rang, médailles pour le podium, avatar, surnom sur le serveur, score). Par défaut, c'est le classement des points des 4h ; `type: Points du jour` classe les joueurs par nombre de journées remportées (journées closes seulement), avec un rappel de la règle au-dessus de l'image. Dans les deux cas, les égalités sont départagées par identifiant Discord. Les membres à 0 point et ceux dont le compte Discord est introuvable n'y figurent pas. L'image est réutilisée pendant 15 secondes par serveur, langue et classement, et régénérée dès qu'un score change ou qu'une journée est close.

### `/jd4h-admin set <member> <score>` et `/jd4h-admin unset <member>`

**Permission requise :** Administrateur

Fixe le score d'un membre, ou le supprime. Fixer un score à 0 revient à le supprimer. Supprimer un score efface aussi l'historique des points du membre et ses points du jour, y compris son meilleur temps de la journée en cours (la journée concernée revient à la meilleure tenue enregistrée ensuite, s'il y en a une ; le message qu'il a encore en place peut de nouveau être crédité). La réponse ne parle de suppression que si un score ou un point du jour visible a été effacé, et les séries des autres joueurs sont alors calculées comme si ces points n'avaient pas existé ; le fixer à une autre valeur conserve l'historique. Réponses éphémères.

### Configuration — `/config four-hour-game`

| Champ     | Type  | Description                                                                               |
| --------- | ----- | ----------------------------------------------------------------------------------------- |
| `channel` | Salon | Salon du jeu. Tant qu'il n'est pas défini, le module ne fait rien.                        |
| `delay`   | Durée | Délai pour marquer un point, saisi comme `30s`, `5m`, `4h`, `1h30m`, `3d`. Défaut : `4h`. |

---

## Module RNGdle

Repris du bot DJ4H. Suit les tirages quotidiens des membres sur [rngdle.com](https://www.rngdle.com) : chaque membre lie son pseudo RNGdle (ou un administrateur le fait pour lui), puis le bot télécharge ses tirages et en tire des classements, des profils et des statistiques. Toutes les données sont propres à chaque serveur : un même joueur peut être lié sur plusieurs serveurs sans que ses tirages se mélangent.

### Paliers

Chaque tirage est classé selon le percentile de son score parmi tous les tirages de rngdle.com : TRASH (moins de 1 %), COMMON (moins de 50 %), UNCOMMON (moins de 75 %), RARE (moins de 90 %), EPIC (moins de 95 %), ANOMALY (moins de 99 %) et MYTHIC. La table des percentiles est extraite du site au démarrage du bot puis chaque semaine ; si elle change, tous les tirages sont retéléchargés. Une table extraite qui ne ressemble pas à une table de percentiles est ignorée.

### Synchronisation

Les tirages sont téléchargés à 06:00 et 18:00 UTC (juste avant le rappel quotidien), avant le classement quotidien, et au plus toutes les 5 minutes par serveur quand un joueur lance une commande `/rngdle`. Si rngdle.com est lent, la commande n'attend pas plus de 10 secondes et affiche les données déjà enregistrées. Un compte qui a déjà un tirage enregistré pour le jour en cours n'est pas re-téléchargé. Un pseudo qui n'existe plus sur rngdle.com est signalé dans les journaux et ignoré.

### `/rngdle leaderboard`

Image du classement des tirages du jour (UTC), avec l'icône du serveur et la date en en-tête. Trois encadrés résument la journée : le score moyen et le nombre de joueurs, chacun comparé à la veille (flèche verte ou rouge, écart et valeur de la veille, absents si personne n'a tiré la veille), et le pire tirage avec son auteur et son placement, affiché quand au moins deux joueurs ont tiré et qu'il ne se confond pas avec le meilleur. Le tableau donne pour chaque tirage le rang, l'avatar, le surnom sur le serveur (ou le pseudo RNGdle si le membre est introuvable), le numéro tiré dans un encadré à la couleur de son palier, le score, l'écart avec le meilleur score du joueur la veille (« nouveau » s'il n'avait pas tiré, « = » à égalité) et le placement en percentile. Limité aux 25 premiers. Trois boutons sont proposés sous l'image : « Mon profil », « Mon historique » et « Classement général ».

### `/rngdle profile [member] [username]`

Image du profil d'un joueur : meilleur et pire tirage avec leur date, score moyen avec le nombre de tirages, score total, série en cours avec son record, record de badges, rang au classement général du serveur (par indice, voir `/rngdle leaderboard-all`) et répartition par palier. La série compte les jours UTC consécutifs avec au moins un tirage ; elle reste en cours tant que le joueur a tiré hier ou aujourd'hui, et retombe à zéro après un jour sans tirage. Sans option, affiche son propre profil. L'option `username` propose les pseudos liés sur le serveur ; les deux options ne se combinent pas. Un membre qui n'a pas encore lié de compte est invité à le faire avec `/rngdle link`. Quatre boutons sont proposés sous l'image : « Mon historique », « Ma tendance », « Ma frise » et « Classement général ».

### `/rngdle history [member] [username] [count]`

Image des derniers tirages d'un joueur, du plus récent au plus ancien : date (« Aujourd'hui » pour le jour UTC en cours), numéro tiré dans un encadré à la couleur de son palier, score et placement en percentile. Le meilleur tirage de la liste est mis en avant à la couleur de son palier. Trois encadrés résument ces tirages : score moyen (coloré selon son palier), placement moyen avec le nombre de tirages dans la moitié haute, et série en cours avec son record (calculée sur tout l'historique, comme pour le profil). L'option `count` choisit le nombre de tirages par page, de 5 à 15 (10 par défaut). Quand le joueur a plus de tirages, des boutons Précédent et Suivant remontent vers les plus anciens, page par page ; le sous-titre indique alors les tirages affichés, par exemple « tirages 16 à 30 sur 136 », et les trois encadrés résument la page affichée. Les boutons gardent le jour de la commande : utilisés les jours suivants, ils parcourent les mêmes pages, sans les tirages faits depuis. Cliquer sur les boutons d'un message public ouvre une copie visible de soi seul, qu'on peut ensuite parcourir. Les options `member` et `username` fonctionnent comme pour `/rngdle profile`. Quatre boutons sont proposés sous l'image : « Mon profil », « Ma tendance », « Ma frise » et « Classement général ».

### `/rngdle trend [member] [username] [days]`

Image de la forme récente d'un joueur sur les 30, 90 (par défaut) ou 365 derniers jours UTC, aujourd'hui compris. Quatre encadrés résument la période : meilleur et pire tirage avec leur date, score moyen (coloré selon son palier) et placement moyen avec le nombre de tirages dans la moitié haute. Le score moyen est comparé à celui de la période de même durée qui précède (flèche verte ou rouge et écart en pourcentage), quand le joueur y a au moins 5 tirages ; sinon, l'encadré donne le nombre de tirages. À droite, la répartition par palier de la période, comme sur le profil. En bas, un graphique donne le placement de chaque tirage, une barre par jour à la couleur de son palier (les jours sans tirage restent vides), avec la ligne des 50 % et une moyenne glissante sur les 7 derniers tirages (30 sur un an). Les options `member` et `username` fonctionnent comme pour `/rngdle profile`. Sans tirage sur la période, un message le dit. Trois boutons sont proposés sous l'image : « Mon profil », « Mon historique » et « Ma frise ».

### `/rngdle timeline [member] [username]`

Image de la frise chronologique d'un joueur, du mois de son premier tirage à la fin du mois en cours. Trois encadrés comptent ses tirages MYTHIC, ANOMALY et TRASH, chacun avec le nombre attendu au vu de son nombre de tirages. Sur la frise, chacun de ces tirages est marqué d'une épingle à la couleur de son palier : au-dessus de la ligne pour les mythiques et les anomalies, en dessous pour les trash. Les épingles trop proches s'empilent, sur trois rangs au plus. Chaque mythique est légendé par son score et sa date. La ligne est colorée du premier tirage à aujourd'hui, marqué d'un point. Les options `member` et `username` fonctionnent comme pour `/rngdle profile`. Trois boutons sont proposés sous l'image : « Mon profil », « Mon historique » et « Ma tendance ».

### `/rngdle link <username>`

Lie son propre compte Discord à un pseudo RNGdle, avec les mêmes vérifications que `/rngdle-admin register` : le pseudo doit exister sur rngdle.com et ne pas être déjà lié à un autre membre du serveur ; tous les tirages sont importés. Un membre déjà lié à un autre pseudo doit d'abord se délier avec `/rngdle unlink` : le bot ne remplace pas un pseudo sans demander. Relancer la commande avec le même pseudo importe seulement les nouveaux tirages. Réponses visibles du membre seul.

### `/rngdle unlink`

Délie son propre compte et supprime ses tirages sur ce serveur, après confirmation par un bouton rouge « Délier » (ou « Annuler »). Le message et ses boutons ne sont visibles que du membre, et seul lui peut les utiliser.

### `/rngdle server-stats`

Image des statistiques du serveur : meilleur et pire tirage de tous les temps (avec le surnom de leur auteur, ou son pseudo RNGdle s'il est introuvable sur Discord), nombre de tirages, score moyen, score total et répartition par palier avec les trois joueurs les plus représentés dans chacun. Trois boutons sont proposés sous l'image : « Mon profil », « Mon historique » et « Classement général ».

### Boutons de navigation

Les boutons « Mon profil », « Mon historique », « Ma tendance », « Ma frise » et « Classement général » répondent par un message visible de soi seul : le profil, les 10 derniers tirages, la tendance sur 90 jours ou la frise de la personne qui clique (ou, si elle n'a pas de compte RNGdle lié, un message qui l'invite à le faire avec `/rngdle link`), ou la première page du classement général depuis toujours.

### `/rngdle leaderboard-all [period] [page]`

Image du classement général, avec l'icône du serveur et la période en en-tête, 10 joueurs par page, avec des boutons Précédent et Suivant. Trois encadrés résument la période : nombre de joueurs, nombre de tirages et score moyen par tirage. Le tableau de gauche classe les joueurs par indice, score total ÷ (nombre de tirages + 20), et affiche aussi leur nombre de tirages et leur total : avec peu de tirages, l'indice suit le total, ce qui empêche un nouveau venu chanceux de prendre la tête ; avec beaucoup de tirages, il tend vers la moyenne, ce qui départage les joueurs réguliers ; le passage de l'un à l'autre est progressif. Une ligne sous l'image rappelle la formule. Le tableau de droite classe les joueurs par leur meilleur tirage (le plus ancien d'abord à égalité), avec le numéro dans un encadré à la couleur de son palier et le score ; les deux tableaux suivent la même pagination. L'option `period` restreint le classement aux tirages de la période : « Depuis toujours » (par défaut), « Ce mois-ci » (mois calendaire UTC) ou « Cette semaine » (semaine du lundi au dimanche, UTC). Le message rappelle la période au-dessus de l'image, par exemple « Classement de la semaine — du lun. 5 oct. au dim. 11 oct. », et les boutons conservent la période choisie. Si le membre qui consulte n'est pas sur la page, sa ligne est ajoutée en bas du tableau de gauche. Cliquer sur les boutons d'un message public ouvre une copie visible de soi seul, qu'on peut ensuite parcourir.

### `/rngdle versus <player1> [player2]`

Image comparant deux joueurs côte à côte, avec leur avatar et leur surnom sur le serveur (ou leur pseudo RNGdle s'ils sont introuvables sur Discord) : score total, nombre de tirages, score moyen et meilleur tirage (colorés selon leur palier), record de badges, et face-à-face sur les jours UTC où les deux ont tiré (victoires de chacun, égalités, nombre de jours en commun). Sur chaque ligne, le meilleur des deux est mis en valeur par une flèche, une teinte et un liseré à la couleur de RNGdle ; à égalité, aucun ne l'est. Sans `player2`, compare `player1` avec soi-même. Choisir deux fois le même joueur, ou un joueur sans compte RNGdle lié, donne un message visible de soi seul ; si c'est soi-même qui n'a pas de compte lié, le message invite à le faire avec `/rngdle link`.

### `/rngdle remind <enabled>`

Inscrit ou désinscrit le membre au rappel quotidien. Réponse visible de lui seul. Il faut un compte RNGdle lié pour s'inscrire ; sinon, le bot invite le membre à lier le sien avec `/rngdle link`. Si le membre a désactivé ses mentions avec `/pings`, la réponse le prévient qu'il ne sera pas notifié.

### Cartes des tirages

Le bot dessine une carte par tirage : numéro, score, palier et percentile, puis la liste complète des badges avec leurs EP, leur rareté et la part des numéros qui les obtiennent. Les badges englobés par un badge plus fort ne rapportent rien : ils sont grisés et marqués « inclus ». Au-delà de 24 badges, les suivants sont résumés en une ligne. La liste des badges vient du calculateur [rng.cubityfir.st](https://rng.cubityfir.st), qui recalcule les badges de n'importe quel numéro ; s'il ne répond pas en 5 secondes, la carte reprend les badges du résultat collé, sans leurs EP, leur probabilité ni la mention « inclus », ou n'affiche pas de badges. Sur une carte vérifiée, le score, le palier et le classement viennent toujours de rngdle.com : un texte retouché ne peut changer que la liste des badges, et seulement quand le calculateur ne répond pas. Pour un membre lié, la carte ajoute selon le cas : record personnel (au-dessus de tous ses tirages précédents), son rang du jour parmi les membres liés qui ont déjà tiré, et l'écart avec sa moyenne (à partir de 5 tirages précédents).

- **Résultat collé** : quand un membre colle dans le salon RNGdle le résultat partagé par rngdle.com (« RNGdle 🎲 … » jusqu'à la ligne des EP), le bot y répond avec la carte, sans le mentionner. Cela marche aussi pour les membres non liés. Les résultats collés ailleurs sont ignorés : le bot ne lit le contenu des messages que dans ce salon. Pour un membre lié, le bot cherche ce numéro parmi ses tirages enregistrés d'aujourd'hui et d'hier, et télécharge ses nouveaux tirages sur rngdle.com s'il ne le trouve pas. La carte reprend alors le score et le jour du tirage enregistré, même si le résultat est collé après minuit. Pour un membre non lié, le score collé doit correspondre au total d'EP que le calculateur donne pour ce numéro. Seul le premier résultat vérifié du jour compte : une fois qu'un membre a eu sa carte, ou si la vérification échoue (numéro inconnu, score qui ne correspond pas, site qui ne répond pas), le bot dessine la carte à partir du seul texte collé, sans aucune requête, et ne l'enregistre nulle part. Exception : un membre lié qui recolle le résultat d'un tirage déjà enregistré, avec le même score, retrouve la carte de ses vraies données. Toute carte qui ne vient pas d'un tirage enregistré d'un membre lié porte la mention « Non connecté » à côté de la date, y compris celle d'un membre non lié vérifiée par le calculateur. La vérification est faite au plus une fois toutes les 10 minutes par membre.
- **Une carte vérifiée par jour** : un membre a au plus une carte vérifiée par jour UTC et par serveur. Si l'envoi échoue, il peut recoller son résultat.

### Classement quotidien

Chaque jour à 01:00 UTC, le bot publie le classement de la veille dans le salon configuré. Le texte au-dessus de l'image félicite le ou les meilleurs joueurs, puis donne le nombre de participants de la veille, le tirage le plus rare s'il est au moins RARE (avec son percentile), le pire tirage quand au moins deux joueurs ont tiré et qu'il ne se confond pas avec le meilleur, et les séries qui atteignent ce jour-là 7, 30, 50, 100, 200 ou 365 jours, puis chaque centaine. Seuls les meilleurs joueurs reçoivent une notification (sauf ceux qui ont désactivé leurs mentions avec `/pings`) ; les autres joueurs cités apparaissent sans être notifiés. Si les séries ne tiennent pas dans un message Discord, les dernières sont résumées en une ligne. Les boutons « Mon profil », « Mon historique » et « Classement général » sont proposés sous l'image.

### Rappel quotidien

Chaque jour à 18:00 UTC, juste après la synchronisation, le bot poste dans le salon RNGdle un message qui mentionne les inscrits au rappel encore liés et qui n'ont pas tiré depuis minuit UTC, avec l'heure de fin du tirage du jour et un lien vers rngdle.com. Les membres qui ont désactivé leurs mentions avec `/pings` y figurent sans être notifiés. Si personne n'est à rappeler, ou si le salon n'est pas configuré, rien n'est posté. Délier un membre annule son inscription.

### `/rngdle-admin`

**Permission requise :** Administrateur. Réponses visibles de l'administrateur seul.

| Sous-commande                  | Effet                                                                                                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `register <member> <username>` | Lie un membre à un pseudo RNGdle, après avoir vérifié qu'il existe, et importe tous ses tirages. Un pseudo ne peut être lié qu'à un seul membre par serveur. Changer de pseudo supprime les tirages de l'ancien. |
| `delete <member>`              | Délie le membre, supprime ses tirages sur ce serveur et annule son inscription au rappel.                                                                                                                        |
| `show`                         | Liste les comptes liés sur le serveur.                                                                                                                                                                           |
| `refresh [full]`               | Télécharge tout de suite les nouveaux tirages du serveur ; avec `full`, retélécharge tout l'historique (au plus une fois tous les quarts d'heure).                                                               |
| `clear`                        | Supprime les tirages enregistrés sur ce serveur ; ils sont retéléchargés à la synchronisation suivante.                                                                                                          |

### Configuration — `/config rngdle`

| Champ                | Type    | Description                                                                                                                       |
| -------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `leaderboardChannel` | Salon   | Salon RNGdle : classement et rappel quotidiens, résultats collés par les membres. Tant qu'il n'est pas défini, rien n'est publié. |
| `shareCards`         | Booléen | Répond par une carte aux résultats collés dans le salon RNGdle (activé par défaut).                                               |

---

## Module Signalements

Permet aux membres de signaler un message aux modérateurs, qui reçoivent une alerte avec les actions possibles. Rien n'est signalé tant que le salon des alertes n'est pas configuré.

### Signaler un message

- **Par réaction** : réagir avec l'emoji configuré (🚩 par défaut). Le bot retire la réaction aussitôt, pour que personne ne voie qui a signalé ; elle reste visible le temps que le bot la retire. Celui qui signale ne reçoit aucune confirmation.
- **Par le menu contextuel** : clic droit sur le message, _Applications_ → _Signaler le message_. Une fenêtre propose un motif facultatif, puis une confirmation visible de soi seul s'affiche.

Ne peuvent pas être signalés : ses propres messages, les messages de bots et du système, et ceux du salon des alertes et de ses fils. Un même membre ne compte qu'une fois par message.

### L'alerte

Un message signalé donne **une seule alerte**, quel que soit le nombre de signalements. Le premier signalement publie l'alerte en mentionnant le rôle modérateur ; les suivants la mettent à jour (« Signalé par 3 membres ») sans mentionner à nouveau.

L'alerte montre l'auteur, le salon avec un lien vers le message, sa date, une **copie du message** (texte et liens des pièces jointes), les membres qui ont signalé avec leurs motifs, le nombre de signalements précédents de l'auteur et combien ont été sanctionnés (les signalements jugés abusifs ne comptent pas). Si l'auteur modifie son message, la nouvelle version s'ajoute sous la copie ; s'il le supprime, l'alerte l'indique et garde la copie. Si le bot n'a pas pu retirer une réaction, l'alerte le signale.

Un nouveau signalement sur une alerte close la rouvre et mentionne le rôle modérateur en réponse à l'alerte. Si l'alerte d'un signalement en attente a été supprimée, une nouvelle est publiée ; celle d'un signalement clos n'est republiée qu'à sa réouverture.

### Actions

| Bouton               | Effet                                                                                                                                        | Permission requise     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Supprimer le message | Supprime le message signalé ; l'alerte reste ouverte. Disponible aussi une fois l'alerte close.                                              | Gérer les messages     |
| Avertir              | Envoie en MP à l'auteur le message saisi, avec le lien du message. Clôt l'alerte.                                                            | Exclure temporairement |
| Exclure…             | Exclusion temporaire de la durée saisie (`1h` par défaut, 28 jours maximum). Clôt l'alerte.                                                  | Exclure temporairement |
| Expulser             | Expulse l'auteur. Clôt l'alerte.                                                                                                             | Expulser des membres   |
| Bannir               | Bannit l'auteur, avec suppression facultative de ses messages récents (7 jours maximum). Clôt l'alerte.                                      | Bannir des membres     |
| Softban              | Bannit l'auteur puis lève aussitôt le bannissement, pour supprimer ses messages récents (1 jour par défaut, 7 jours maximum). Clôt l'alerte. | Bannir des membres     |
| Classer sans suite   | Clôt l'alerte sans action.                                                                                                                   | Gérer les messages     |
| Signalement abusif   | Clôt l'alerte ; le signalement ne compte pas dans l'historique de l'auteur.                                                                  | Gérer les messages     |
| Rouvrir              | Rouvre une alerte close.                                                                                                                     | Gérer les messages     |

Les sanctions ont un motif facultatif (obligatoire pour l'avertissement), repris dans le journal d'audit du serveur. Elles sont refusées avec une explication si l'auteur est le propriétaire du serveur, si le modérateur n'a pas un rôle plus haut que l'auteur, ou si le bot ne peut pas l'atteindre. Un auteur qui a quitté le serveur ne peut plus qu'être banni ou softbanni ; le softban est refusé s'il est déjà banni, pour ne pas lever son bannissement. Une action qui échoue est inscrite au journal de l'alerte avec la mention « échec » et l'alerte reste ouverte. Deux modérateurs qui agissent en même temps ne peuvent pas sanctionner deux fois : le second est prévenu que l'alerte est déjà close.

Les permissions sont vérifiées dans le salon des alertes ; pour « Supprimer le message », le modérateur doit aussi avoir Gérer les messages dans le salon du message signalé.

Le bot a besoin des permissions Gérer les messages (dans les salons surveillés), Exclure temporairement, Expulser et Bannir des membres, et de voir le salon des alertes et d'y écrire. Tant qu'il ne le peut pas, rien n'est signalé.

### Conservation

Chaque jour à 04:00 UTC, les signalements clos depuis plus longtemps que la durée de conservation sont supprimés, et leur alerte est remplacée par une mention « purgé ».

### Configuration — `/config reports`

| Champ           | Type  | Description                                                                     |
| --------------- | ----- | ------------------------------------------------------------------------------- |
| `alertChannel`  | Salon | Salon où arrivent les alertes. Tant qu'il n'est pas défini, rien n'est signalé. |
| `emoji`         | Emoji | Emoji de signalement, standard ou personnalisé (🚩 par défaut).                 |
| `moderatorRole` | Rôle  | Rôle mentionné à chaque nouvelle alerte. Sans rôle, personne n'est mentionné.   |
| `retention`     | Durée | Durée de conservation d'un signalement clos (90 jours par défaut).              |

---

## Module Réactions automatiques

Ajoute automatiquement une réaction à chaque nouveau message des salons configurés, avec une seule réaction par salon.

### Comportement automatique

- Le bot réagit à tous les nouveaux messages du salon, y compris ceux des autres bots et des webhooks ; il ignore ses propres messages et les messages système (épinglage, arrivée d'un membre…).
- Les fils de discussion ne sont pas concernés : un message posté dans un fil n'est pas dans le salon parent.
- Si l'emoji n'existe plus (emoji personnalisé supprimé), la réaction automatique du salon est retirée.
- Si le bot n'a pas accès au salon ou pas la permission d'ajouter des réactions, il cesse d'essayer dans ce salon pendant 10 minutes, puis réessaie.
- La suppression d'un salon retire sa réaction automatique.

### `/autoreact set <channel> <emoji>`

Définit la réaction ajoutée dans un salon textuel ou d'annonces, et remplace la précédente s'il y en avait une. L'emoji peut être un emoji Unicode, un emoji personnalisé (`<:nom:id>`) ou le simple nom d'un emoji du serveur. Un emoji personnalisé est refusé si le bot n'est sur aucun serveur qui le possède.

### `/autoreact remove <channel>`

Retire la réaction automatique d'un salon.

### `/autoreact list`

Liste les salons et leur réaction. Les entrées de salons supprimés sont retirées au passage ; au-delà de la taille d'un embed, la liste indique le nombre de salons non affichés.

Ces trois commandes sont réservées aux administrateurs, et les réglages sont conservés quand le module est désactivé via `/modules`.

---

## Module Thread Creator

Crée automatiquement un fil de discussion sous chaque nouveau message dans un salon configuré.

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

## Module Message Log

Consigne les messages supprimés et modifiés dans un salon réservé au staff.

### Messages supprimés

Pour chaque message supprimé, le bot poste dans le salon des logs l'auteur, le salon, la date d'envoi, le texte et le nom des pièces jointes (en citation, pour qu'un membre ne puisse pas imiter une ligne du log), avec en pied l'ID de l'auteur et l'ID du message. Les mentions ne notifient personne.

- **Seuls les messages en cache sont consignés** : ceux reçus depuis le démarrage du bot et encore en mémoire (environ 200 par salon). Pour un message plus ancien, Discord ne transmet ni l'auteur ni le contenu : rien n'est consigné.
- **Texte trop long** : quand le log dépasse la taille d'un embed, le texte complet est joint en fichier.
- **Pièces jointes** : seul leur nom est consigné, leur lien ne fonctionne plus après la suppression.
- **Auteur de la suppression** : affiché seulement quand le journal d'audit le confirme, c'est-à-dire quand un modérateur supprime le message d'un autre membre. Le bot attend 1,5 seconde que l'entrée apparaisse, et il lui faut la permission _Voir les logs du serveur_. Discord regroupe les suppressions successives d'un même modérateur dans une seule entrée : le bot ne nomme le modérateur que si l'entrée est nouvelle (créée au plus 10 secondes avant la réception de la suppression, ou 2 secondes après) ou si son compteur a augmenté depuis sa dernière lecture, à raison d'une suppression par unité. Une entrée ancienne vue pour la première fois (après un redémarrage) sert seulement de référence, et le bot oublie une entrée 5 minutes après la dernière suppression qui lui a été attribuée. Quand plusieurs modérateurs suppriment des messages du même auteur, les suppressions sont attribuées dans l'ordre où elles ont eu lieu. En cas de doute, aucun nom n'est affiché, en particulier quand un membre supprime son propre message. Limite connue : si un modérateur supprime un message que le bot ne consigne pas (hors cache) puis, dans les 5 minutes, l'auteur supprime lui-même un autre message du même salon, ce modérateur peut être nommé à tort ; de même quand l'entrée du journal d'audit tarde à être écrite. De même, quand l'auteur supprime lui-même un message juste avant ou au milieu d'une rafale de suppressions du modérateur, le journal d'audit ne permet pas de les distinguer : le nom du modérateur peut se retrouver sur la suppression de l'auteur et manquer sur l'une des siennes. Lors d'une rafale de suppressions, l'attente de 1,5 seconde n'est faite qu'une fois.

Une suppression en masse produit un log par salon concerné avec le nombre de messages et, en fichier joint, le contenu de ceux qui étaient en cache et écrits par des membres.

### Messages modifiés

Si l'option est active, chaque modification du texte d'un message en cache est consignée avec le contenu avant et après et un lien vers le message. Quand l'un des deux textes dépasse 1 024 caractères (un emoji compte pour deux), les deux versions complètes sont jointes en fichier. Les mises à jour qui ne changent pas le texte (chargement d'un aperçu de lien, épinglage) sont ignorées.

### Ce qui n'est pas consigné

Les messages des bots, des webhooks et les messages système, ceux des salons et catégories exclus et ceux du salon des logs lui-même. Le bot ne stocke rien : le contenu n'est conservé que dans son cache en mémoire, puis dans le salon des logs.

### Configuration — `/config message-log`

| Champ                | Type               | Description                                                       |
| -------------------- | ------------------ | ----------------------------------------------------------------- |
| `logChannel`         | Salon              | Salon des logs. Tant qu'il n'est pas défini, rien n'est consigné. |
| `excludedChannels`   | Salons (liste)     | Salons dont les messages ne sont pas consignés.                   |
| `excludedCategories` | Catégories (liste) | Catégories dont les messages des salons ne sont pas consignés.    |
| `logEdits`           | Booléen            | Consigne aussi les messages modifiés. Activé par défaut.          |

Un forum ou un fil précis ne se sélectionne pas dans les salons exclus : excluez sa catégorie. Dans le salon des logs, le bot a besoin de _Voir le salon_, d'_Envoyer des messages_, d'_Intégrer des liens_ et de _Joindre des fichiers_. Sans les trois premières, rien n'est consigné ; sans la dernière, les logs partent sans fichier joint. Le salon des logs doit être réservé au staff. Quand un rôle voit le salon des logs sans pouvoir lire le salon d'origine (ou que le message vient d'un fil privé), le log est publié sans le contenu ni les fichiers, avec la mention « Contenu masqué ». Le module lit le contenu des messages : l'intent privilégié _Message Content_ doit être activé sur le bot.

---

## Module Message Quote

Cite les messages Discord dont le lien est posté sur le serveur.

### Comportement automatique

Quand un membre poste un lien vers un message (`https://discord.com/channels/…`, y compris `ptb.` et `canary.`), le bot répond avec une citation : auteur et avatar, texte, première image, autres pièces jointes en liens, salon d'origine, membre qui cite et date du message. Un bouton « Aller au message » ouvre l'original. Les mentions présentes dans le message cité ne notifient personne.

Un message transféré est cité avec son contenu transféré. Un message sans texte reprend la description (ou le titre) de son premier embed, à défaut le bot indique qu'il n'a pas de texte.

**Ce qui n'est pas cité :**

- Les liens vers un autre serveur
- Les messages d'un salon que le membre qui poste le lien ne peut pas lire (voir le salon et lire l'historique ; pour un fil privé, en être membre ou pouvoir gérer les fils). Le bot ne révèle jamais un salon auquel le membre n'a pas accès.
- Les messages qui seraient montrés à un public plus large que celui du salon d'origine : le bot compare, rôle par rôle (chaque rôle avec `@everyone`), qui voit le salon où le lien est posté et qui peut lire l'historique du salon d'origine. Si un rôle voit le premier sans pouvoir lire le second, le message n'est pas cité. Les rôles gérés par une intégration (bots, booster) et les rôles ignorés de la configuration ne sont pas comparés. Un message de `#staff` n'est donc jamais cité dans `#général`, même quand l'accès au serveur passe par un rôle de membre. Un message d'un fil privé n'est cité que dans ce même fil. Limites : les autorisations accordées à un membre précis (et non à un rôle) ne sont pas prises en compte, ni les combinaisons de rôles (un rôle qui retire l'accès au salon d'origine à des membres qui voient la destination grâce à un autre rôle) ; un fil privé de destination est jugé comme son salon parent, ce qui peut refuser une citation légitime. Sur un serveur où l'accès passe par un rôle de membre, un salon ouvert à un rôle optionnel (jeu, notifications) refuse les citations des salons communs tant que ce rôle n'est pas déclaré dans `ignoredRoles`.
- Les citations publiées par le bot lui-même (ses autres messages, comme les annonces, restent citables)
- Les messages d'un salon NSFW, sauf si le lien est posté dans un salon NSFW
- Les liens entre chevrons (`<https://…>`), dans du code ou sous spoiler
- Les messages des salons et catégories exclus, et les liens postés dans un salon exclu
- Les liens postés par des bots

Au plus 3 messages sont cités par message, les doublons sont ignorés. Un texte trop long est coupé, sans jamais laisser un spoiler à moitié ouvert. Si le message contenant le lien a été supprimé entre-temps, la citation est publiée sans y répondre. Si aucun lien n'est citable, le bot ne répond pas. Une pièce jointe image sous spoiler n'est jamais affichée, seulement listée en lien. Dès que le texte cité contient un spoiler (`||`), l'aperçu de lien n'est pas repris.

### Bouton « Supprimer »

Supprime la citation. Il est réservé au membre qui a posté le lien, aux auteurs des messages cités et aux membres qui peuvent gérer les messages du salon ; les autres reçoivent une réponse visible d'eux seuls.

### Configuration — `/config message-quote`

| Champ                | Type               | Description                                                                                                                   |
| -------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `excludedChannels`   | Salons (liste)     | Salons dont les messages ne sont jamais cités, et où les liens postés ne sont pas cités.                                      |
| `excludedCategories` | Catégories (liste) | Catégories dont les salons sont traités comme des salons exclus.                                                              |
| `ignoredRoles`       | Rôles (liste)      | Rôles optionnels portés uniquement par des membres qui ont aussi le rôle de membre : ignorés dans la comparaison des publics. |

Le module lit le contenu des messages : l'intent privilégié _Message Content_ doit être activé sur le bot.

---

## Module LaTeX

Affiche des formules mathématiques LaTeX, ou des textes qui en contiennent, sous forme d'image : noir sur blanc par défaut, ou blanc sur gris foncé avec le thème `dark`.

Le rendu passe par MathJax : les commandes de base de LaTeX et les extensions `amsmath`/`amssymb` (environnements `align`, `pmatrix`, `cases`…, `\mathbb`, `\mathfrak`…), `mathtools`, `boldsymbol`, `braket`, `cancel`, `color` et `mhchem` (`\ce{…}`) sont disponibles, ainsi que `\newcommand` et `\def`. Les documents LaTeX complets, `\usepackage` et TikZ ne le sont pas. Le texte est composé sur une largeur de 32 em, mot par mot, et les lignes coupées sont justifiées comme en LaTeX ; une formule centrée trop longue passe à la ligne à cette largeur. Une image qui dépasse encore 2 400 pixels de large ou 4 000 de haut est réduite. Un rendu trop lourd (plus de 1 000 substitutions de macros ou une expansion de plus de 2 048 caractères dans une formule, plus de 5 secondes de calcul, ou un dessin démesuré) est refusé avec une erreur, pour ne pas bloquer le bot.

### `/latex <formula>`

Répond publiquement avec l'image d'une formule, en mode « display » (comme entre `$$ … $$`). La formule s'écrit sans délimiteurs `$`, en 1 000 caractères au plus ; elle sert aussi de texte alternatif à l'image. Une formule invalide (commande inconnue, accolade manquante, macro qui s'appelle sans fin…) donne une réponse visible de soi seul, avec le message d'erreur de MathJax. Les macros définies par `\newcommand` ou `\def` ne valent que pour l'image où elles sont écrites.

### Textes dans le chat

Avec la détection automatique (activée par défaut), un message qui contient du LaTeX est rendu en image, en entier. Il en contient s'il a :

- un `\begin{…}` de l'un des environnements pris en charge ci-dessous ;
- une formule entre `\[ … \]` ou `\( … \)` qui contient un chiffre, l'un de `\ ^ _ { } = + - * / < >`, ou tient en une ou deux lettres ;
- une formule entre `$$ … $$` qui tient en un mot ou contient l'un de `\ ^ _ { } =` ;
- une formule `$ … $` dont le `$` ouvrant est suivi d'un caractère, le `$` fermant précédé d'un caractère et suivi d'autre chose qu'une lettre, un chiffre ou un `$`, et dont le contenu a une lettre ou l'un de `\ ^ _ { } =`. S'il n'a aucun de `\ ^ _ { } =` mais des espaces, il ne doit ni commencer et finir par un chiffre (`$5 et 10$`), ni contenir de mot d'au moins trois lettres (`$5 for a sandwich … 7$`).

Les prix (`5$ ou 10$`, `entre $5 et $10`, `$15$`, `$5 et 10$`, `earn $$$`), les variables de shell (`$SRC/$DST`, `$HOME:$PATH`, `$FOO$BAR`), les crochets échappés du Markdown (`\[lien\]`) et le LaTeX dans du code (`` `…` ``, ` ```…``` `) ne déclenchent donc rien, pas plus qu'un message qui contient un spoiler (`||…||`, hors formule), pour ne pas le dévoiler. Désactiver la détection ne laisse que la commande `/latex` ; une réponse déjà postée est retirée à la prochaine modification de son message.

Le texte est rendu avec ses formules entre `$ … $` au fil du texte, et entre `$$ … $$`, `\[ … \]` ou dans un environnement `equation`, `align`, `gather`, `multline`, `flalign`, `alignat` ou `eqnarray` (étoilé ou non) centrées sur leur propre ligne. Par exemple : `Montrer que toute fonction polynomiale bornée sur $\mathbb{R}$ est constante.` Le texte passe à la ligne tout seul ; chaque retour à la ligne du message, ou `\\`, commence une nouvelle ligne, et une ligne vide sépare deux paragraphes. Les listes `itemize` et `enumerate` sont mises en page avec leurs puces ou leurs numéros (`1.`, `(a)`, `i.`, `A.` selon la profondeur), imbriquées si besoin, et `\item[…]` choisit son propre repère. Les `%`, `&`, `#`, `_` et les `$` qui n'ouvrent ni ne ferment de formule (`5$`) s'affichent tels quels ; les commandes de texte LaTeX (`\textbf{…}`, `\emph{…}`, accents `\'e`…) sont interprétées, et un mot du texte que TeX ne sait pas lire (`x^2` ou `\alpha` hors des `$`, accolade orpheline…) s'affiche tel qu'il est écrit. Les mentions s'affichent avec le nom de la personne, du rôle ou du salon, et les emojis personnalisés avec leur nom (`:pi:`). Le code d'un message qui contient aussi du LaTeX s'affiche tel qu'il est écrit, sans ses backticks. Les autres environnements de texte (`center`, `tabular`…) ne sont pas pris en charge. Le texte fait au plus 4 000 caractères et sert de texte alternatif à l'image. Les messages des bots sont ignorés.

Le bot répond au message sans notifier son auteur, et seulement dans les salons où il peut envoyer des messages, joindre des fichiers et lire l'historique. Si le texte ne peut pas être rendu, la réponse donne le message d'erreur de MathJax (coupé à 300 caractères) et invite l'auteur à modifier son message. Quand le message est modifié, la réponse est mise à jour ; s'il n'est plus à rendre (LaTeX retiré), elle est supprimée, et s'il le devient, le bot répond. Supprimer le message, seul ou dans une suppression groupée, supprime aussi la réponse. Le bot retient ses réponses en mémoire : après un redémarrage, il retrouve sa réponse à un message modifié qui contient toujours du LaTeX parmi les 20 messages suivants, mais il ne supprime plus la réponse d'un message supprimé ou dont le LaTeX est retiré. Pour un message qui n'est plus en mémoire, seule une modification de moins d'une minute est prise en compte : épingler un ancien message ou retirer ses aperçus de liens ne le fait pas rendre. Si le bot perd le droit de joindre des fichiers, sa réponse reste telle quelle.

### Configuration — `/config latex`

| Champ        | Type    | Description                                                                                 |
| ------------ | ------- | ------------------------------------------------------------------------------------------- |
| `autoDetect` | Booléen | Rend en image les messages qui contiennent du LaTeX. Activé par défaut.                     |
| `theme`      | Choix   | `light` (noir sur blanc, par défaut) ou `dark` (blanc sur gris foncé), pour `/latex` aussi. |

Le module lit le contenu des messages : l'intent privilégié _Message Content_ doit être activé sur le bot.

---

## Module Server Stats

Compte l'activité quotidienne du serveur et publie un bilan chaque nuit.

### Comptage

Dès que le module est activé, le bot compte, par jour (heure de Paris) :

- les messages, par salon et par membre ; les messages d'un fil comptent pour son salon parent ;
- les réactions ajoutées, par emoji ;
- les arrivées et les départs de membres.

Les bots, les messages système, les salons et catégories exclus et, par défaut, les salons que `@everyone` ne voit pas (dont les fils privés) ne sont pas comptés. Seuls des compteurs sont enregistrés, jamais le contenu des messages ; ils sont supprimés au bout de 90 jours. Les événements survenus pendant que le bot est arrêté ne sont pas comptés.

### Bilan quotidien

Chaque jour à minuit (heure de Paris), le bot publie dans le salon configuré le bilan de la veille : nombre de membres (bots compris), nouveaux membres et départs (hors bots), messages postés, membres actifs, salons actifs, réactions ajoutées, et les 5 réactions, salons et membres les plus actifs. La description indique depuis quand le comptage a commencé (premier événement compté sur le serveur ; une désactivation temporaire du module ne remet pas cette date à zéro). Les membres cités ne sont pas notifiés. Tant que le salon n'est pas défini, ou si rien n'a encore été compté, rien n'est publié.

### Configuration — `/config server-stats`

| Champ                    | Type               | Description                                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reportChannel`          | Salon              | Salon du bilan quotidien. Tant qu'il n'est pas défini, rien n'est publié.                                                                                                                                                                                                                                                                          |
| `excludedChannels`       | Salons (liste)     | Salons dont l'activité n'est pas comptée.                                                                                                                                                                                                                                                                                                          |
| `excludedCategories`     | Catégories (liste) | Catégories dont l'activité des salons n'est pas comptée.                                                                                                                                                                                                                                                                                           |
| `includePrivateChannels` | Booléen            | Compte aussi les salons que `@everyone` ne voit pas. À activer quand `@everyone` ne voit aucun salon (accès donné par un rôle de membre), sinon le bilan reste à zéro. Les salons du staff sont alors comptés aussi et peuvent apparaître dans le bilan public : excluez-les avec `excludedChannels` / `excludedCategories`. Désactivé par défaut. |
| `showTopMembers`         | Booléen            | Affiche les membres les plus actifs. Activé par défaut.                                                                                                                                                                                                                                                                                            |

> [!WARNING]
> Le module suit les arrivées et départs : l'intent privilégié _Server Members_ doit être activé dans le Developer Portal **avant** de déployer une version qui contient ce module. Les intents sont demandés au démarrage, que le module soit activé ou non : sans ce réglage, Discord refuse la connexion et le bot entier ne démarre pas.
