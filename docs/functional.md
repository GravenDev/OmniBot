# Fonctionnement du bot

Documentation du comportement visible par les utilisateurs et administrateurs de serveur Discord.

---

## Arrivée et départ du bot

Quand le bot est invité sur un serveur, ses données sont initialisées et un message de bienvenue est posté dans le salon système (ou envoyé en MP au propriétaire si le salon système est indisponible). Le message pointe vers `/modules` et `/config`. Rien d'autre n'est activé automatiquement : seuls les administrateurs décident quels modules activer.

Quand le bot quitte un serveur, rien n'est effacé : si le bot est réinvité plus tard, la configuration et les modules activés sont restaurés automatiquement (y compris leurs commandes).

## Module Core

Toujours actif, non désinstallable. Fournit la gestion des modules pour les administrateurs.

### `/modules` — Gérer les modules du serveur

**Permission requise :** Administrateur

Affiche la liste de tous les modules disponibles avec leur statut sur le serveur (activé/désactivé), leur version activée, et leur description. Chaque module dispose d'un bouton **Activer** (vert) ou **Désactiver** (rouge) qui prend effet immédiatement.

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

Repris du bot DJ4H. Dans le salon de jeu, le dernier message posté « tient » : si personne d'autre n'écrit pendant le délai configuré (4 h par défaut), son auteur marque un point au message suivant.

### Comportement automatique

À chaque message posté dans le salon configuré :

1. Si c'est le premier message suivi, il devient le dernier message, sans point.
2. S'il vient de l'auteur du dernier message, il est ignoré : le dernier message ne change pas, et un joueur ne peut donc pas relancer son propre délai.
3. Si le délai s'est écoulé depuis le dernier message, **l'auteur du dernier message** marque un point ; le bot l'annonce dans le salon (voir ci-dessous).
4. Dans tous les autres cas, le nouveau message devient le dernier message.

L'annonce d'un point indique combien de temps le message est resté sans réponse (« 4 h 12 min », deux unités au plus), le nouveau total du gagnant et son rang au classement du serveur (« 3ᵉ sur 17 »), avec l'avatar de serveur du gagnant en vignette et, en pied, l'heure d'envoi du message gagnant (affichée dans le fuseau de chaque lecteur). Personne n'est notifié. Si le rang ou l'avatar ne peuvent pas être obtenus, l'annonce part sans eux.

Chaque point gagné est aussi inscrit dans l'historique du serveur, avec la durée pendant laquelle le message a tenu et l'heure du message qui l'a fait gagner. Cet historique alimente la carte de `/jd4h score` ; il n'existe que pour les points gagnés depuis sa mise en place.

Les messages de bots, les messages système (arrivée d'un membre, épinglage, boost…), les messages hors du salon (y compris dans ses fils) et les messages privés sont ignorés. Un message plus ancien que le dernier message enregistré (reçu dans le désordre) est ignoré lui aussi. Après un changement de salon de jeu, le dernier message de l'ancien salon ne compte plus : la partie repart du premier message posté dans le nouveau. Il en va de même quand le module est réactivé après avoir été désactivé.

Un message supprimé ne compte plus : si c'était le dernier message, c'est le message de joueur précédent encore présent dans le salon qui redevient le dernier message, avec son heure d'envoi réelle. Si le salon n'en contient plus, la partie repart du prochain message.

Au démarrage, le bot relit le vrai dernier message de joueur de chaque salon de jeu pour rattraper les messages postés ou supprimés pendant qu'il était arrêté. Les points qui auraient dû être gagnés pendant l'arrêt ne sont pas rattrapés. Les messages d'un même serveur sont traités un par un : deux messages simultanés ne peuvent pas marquer deux fois sur le même prédécesseur.

### `/jd4h score [member]`

Affiche la carte du membre indiqué, ou la sienne par défaut : une image avec son avatar et son surnom sur le serveur (à défaut, ceux de son compte Discord) et son rang parmi les joueurs du serveur qui ont au moins un point (médaille pour le podium, sinon « #3 / 17 »). Le rang suit l'ordre de `/jd4h leaderboard` : score décroissant, puis identifiant Discord pour départager les égalités.

La carte montre :

- **Points** : le score total ;
- **Ce mois-ci** : les points gagnés depuis le 1ᵉʳ du mois (UTC) ;
- **Meilleur temps tenu** : la plus longue durée pendant laquelle un de ses messages gagnants est resté sans réponse ;
- **Série en cours** : le nombre de points d'affilée qu'il a remportés sur le serveur, sans qu'un autre joueur marque entre deux (0 si le dernier point du serveur est à quelqu'un d'autre), avec son record en dessous ;
- **Dernier point** : la date de son dernier point (UTC).

Ces valeurs viennent de l'historique : un joueur dont tous les points sont antérieurs à l'historique (ou ont été fixés par un administrateur) voit « — » à leur place. Un membre sans score reçoit un simple message texte. L'image est réutilisée pendant 15 secondes par serveur, langue et membre, et régénérée dès qu'un score change.

### `/jd4h leaderboard`

Génère une image du top 10 du serveur (rang, médailles pour le podium, avatar, surnom sur le serveur, score). Les membres à 0 point et ceux dont le compte Discord est introuvable n'y figurent pas. L'image est réutilisée pendant 15 secondes par serveur et par langue, et régénérée dès qu'un score change.

### `/jd4h-admin set <member> <score>` et `/jd4h-admin unset <member>`

**Permission requise :** Administrateur

Fixe le score d'un membre, ou le supprime. Fixer un score à 0 revient à le supprimer. Supprimer un score efface aussi l'historique des points du membre, et les séries des autres joueurs sont alors calculées comme si ces points n'avaient pas existé ; le fixer à une autre valeur conserve l'historique. Réponses éphémères.

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

Image du classement des tirages du jour (UTC) : rang, avatar, surnom sur le serveur (ou pseudo RNGdle si le membre est introuvable), numéro tiré coloré selon son palier, score et placement en percentile. Limité aux 25 premiers. Deux boutons sont proposés sous l'image : « Mon profil » et « Classement général ».

### `/rngdle profile [member] [username]`

Image du profil d'un joueur : meilleur et pire tirage avec leur date, score moyen avec le nombre de tirages, score total, série en cours avec son record, record de badges, rang au classement général du serveur et répartition par palier. La série compte les jours UTC consécutifs avec au moins un tirage ; elle reste en cours tant que le joueur a tiré hier ou aujourd'hui, et retombe à zéro après un jour sans tirage. Sans option, affiche son propre profil. L'option `username` propose les pseudos liés sur le serveur ; les deux options ne se combinent pas. Un membre qui n'a pas encore lié de compte est invité à le faire avec `/rngdle link`. Un bouton « Classement général » est proposé sous l'image.

### `/rngdle link <username>`

Lie son propre compte Discord à un pseudo RNGdle, avec les mêmes vérifications que `/rngdle-admin register` : le pseudo doit exister sur rngdle.com et ne pas être déjà lié à un autre membre du serveur ; tous les tirages sont importés. Un membre déjà lié à un autre pseudo doit d'abord se délier avec `/rngdle unlink` : le bot ne remplace pas un pseudo sans demander. Relancer la commande avec le même pseudo importe seulement les nouveaux tirages. Réponses visibles du membre seul.

### `/rngdle unlink`

Délie son propre compte et supprime ses tirages sur ce serveur, après confirmation par un bouton rouge « Délier » (ou « Annuler »). Le message et ses boutons ne sont visibles que du membre, et seul lui peut les utiliser.

### `/rngdle server-stats`

Image des statistiques du serveur : meilleur et pire tirage de tous les temps (avec le surnom de leur auteur, ou son pseudo RNGdle s'il est introuvable sur Discord), nombre de tirages, score moyen, score total et répartition par palier avec les trois joueurs les plus représentés dans chacun. Deux boutons sont proposés sous l'image : « Mon profil » et « Classement général ».

### Boutons de navigation

Les boutons « Mon profil » et « Classement général » répondent par un message visible de soi seul : le profil de la personne qui clique (ou, si elle n'a pas de compte RNGdle lié, un message qui l'invite à le faire avec `/rngdle link`), ou la première page du classement général depuis toujours.

### `/rngdle leaderboard-all [period] [page]`

Image du classement général (somme des scores), 10 joueurs par page, avec des boutons Précédent et Suivant. L'option `period` restreint le classement aux tirages de la période : « Depuis toujours » (par défaut), « Ce mois-ci » (mois calendaire UTC) ou « Cette semaine » (semaine du lundi au dimanche, UTC). Le message rappelle la période au-dessus de l'image, par exemple « Classement de la semaine — du lun. 5 oct. au dim. 11 oct. », et les boutons conservent la période choisie. Si le membre qui consulte n'est pas sur la page, sa ligne est ajoutée en bas. Cliquer sur les boutons d'un message public ouvre une copie visible de soi seul, qu'on peut ensuite parcourir.

### `/rngdle versus <player1> [player2]`

Image comparant deux joueurs côte à côte, avec leur avatar et leur surnom sur le serveur (ou leur pseudo RNGdle s'ils sont introuvables sur Discord) : score total, nombre de tirages, score moyen et meilleur tirage (colorés selon leur palier), record de badges, et face-à-face sur les jours UTC où les deux ont tiré (victoires de chacun, égalités, nombre de jours en commun). Sur chaque ligne, le meilleur des deux est mis en valeur par une flèche et un fond à sa couleur ; à égalité, aucun ne l'est. Sans `player2`, compare `player1` avec soi-même. Choisir deux fois le même joueur, ou un joueur sans compte RNGdle lié, donne un message visible de soi seul ; si c'est soi-même qui n'a pas de compte lié, le message invite à le faire avec `/rngdle link`.

### `/rngdle remind <enabled>`

Inscrit ou désinscrit le membre au rappel quotidien. Réponse visible de lui seul. Il faut un compte RNGdle lié pour s'inscrire ; sinon, le bot invite le membre à lier le sien avec `/rngdle link`. Si le membre a désactivé ses mentions avec `/pings`, la réponse le prévient qu'il ne sera pas notifié.

### Classement quotidien

Chaque jour à 01:00 UTC, le bot publie le classement de la veille dans le salon configuré. Le texte au-dessus de l'image félicite le ou les meilleurs joueurs, puis donne le nombre de participants de la veille, le tirage le plus rare s'il est au moins RARE (avec son percentile), le pire tirage quand au moins deux joueurs ont tiré et qu'il ne se confond pas avec le meilleur, et les séries qui atteignent ce jour-là 7, 30, 50, 100, 200 ou 365 jours, puis chaque centaine. Seuls les meilleurs joueurs reçoivent une notification (sauf ceux qui ont désactivé leurs mentions avec `/pings`) ; les autres joueurs cités apparaissent sans être notifiés. Si les séries ne tiennent pas dans un message Discord, les dernières sont résumées en une ligne. Les boutons « Mon profil » et « Classement général » sont proposés sous l'image.

### Rappel quotidien

Chaque jour à 18:00 UTC, juste après la synchronisation, le bot poste dans le salon du classement quotidien un message qui mentionne les inscrits au rappel encore liés et qui n'ont pas tiré depuis minuit UTC, avec l'heure de fin du tirage du jour et un lien vers rngdle.com. Les membres qui ont désactivé leurs mentions avec `/pings` y figurent sans être notifiés. Si personne n'est à rappeler, ou si le salon n'est pas configuré, rien n'est posté. Délier un membre annule son inscription.

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

| Champ                | Type  | Description                                                                                  |
| -------------------- | ----- | -------------------------------------------------------------------------------------------- |
| `leaderboardChannel` | Salon | Salon du classement et du rappel quotidiens. Tant qu'il n'est pas défini, rien n'est publié. |

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

Pour chaque message supprimé, le bot poste dans le salon des logs l'auteur, le salon, la date d'envoi, le texte et le nom des pièces jointes, avec en pied l'ID de l'auteur et l'ID du message. Les mentions ne notifient personne.

- **Contenu connu seulement pour les messages en cache** : ceux reçus depuis le démarrage du bot (environ 200 par salon). Pour un message plus ancien, le log indique que le contenu est inconnu.
- **Pièces jointes** : seul leur nom est consigné, leur lien ne fonctionne plus après la suppression.
- **Auteur de la suppression** : affiché seulement quand le journal d'audit le confirme, c'est-à-dire quand un modérateur supprime le message d'un autre membre. Le bot attend 1,5 seconde que l'entrée apparaisse, et il lui faut la permission _Voir les logs du serveur_. Quand un membre supprime son propre message, aucun nom n'est affiché.

Une suppression en masse produit un seul log avec le nombre de messages et, en fichier joint, le contenu de ceux qui étaient en cache.

### Messages modifiés

Si l'option est active, chaque modification du texte d'un message en cache est consignée avec le contenu avant et après et un lien vers le message. Les mises à jour qui ne changent pas le texte (chargement d'un aperçu de lien) sont ignorées.

### Ce qui n'est pas consigné

Les messages des bots et des webhooks, ceux des salons exclus et ceux du salon des logs lui-même. Le bot ne stocke rien : le contenu n'est conservé que dans son cache en mémoire, puis dans le salon des logs.

### Configuration — `/config message-log`

| Champ              | Type           | Description                                                       |
| ------------------ | -------------- | ----------------------------------------------------------------- |
| `logChannel`       | Salon          | Salon des logs. Tant qu'il n'est pas défini, rien n'est consigné. |
| `excludedChannels` | Salons (liste) | Salons ou catégories dont les messages ne sont pas consignés.     |
| `logEdits`         | Booléen        | Consigne aussi les messages modifiés. Activé par défaut.          |

Le salon des logs doit être réservé au staff : il reproduit le contenu de messages venant de tous les salons, privés compris. Le module lit le contenu des messages : l'intent privilégié _Message Content_ doit être activé sur le bot.
