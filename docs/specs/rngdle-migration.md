# Spec — Module RNGdle : portage depuis DJ4H

> **Statut : implémenté.**

## Objectif

Porter dans OmniBot la partie RNGdle du bot DJ4H (Python) : lien entre un membre Discord et son compte [rngdle.com](https://www.rngdle.com), synchronisation de ses tirages, classements, profil, statistiques du serveur et classement quotidien posté automatiquement. Après ce portage, DJ4H peut être arrêté.

Source de référence : `DJ4H/commands/cogs/rngdle.py`, `DJ4H/utils/rngdle.py`, `DJ4H/utils/database/dao/rngdle.py`, `DJ4H/utils/tasks/rngdle_*.py`, `DJ4H/utils/image_generator.py`.

## Arborescence

```
src/modules/rngdle/
├── rngdle.module.ts
├── rngdle.config.ts            # leaderboardChannel (CHANNEL)
├── rngdle.prisma
├── tasks.ts                    # synchro, table des percentiles, classement quotidien
├── assets/                     # police mono, icônes, score-table.json
├── i18n/{en,fr}.json
├── commands/
│   ├── rngdle.command.ts       # leaderboard, profile, server-stats, leaderboard-all
│   └── rngdle-admin.command.ts # register, delete, show, refresh, clear
├── interactions/
│   └── overall-page.button.ts  # pagination de leaderboard-all
├── services/
│   ├── api.ts                  # client rngdle.com (validation, nouvelles tentatives)
│   ├── scoring.ts              # table des percentiles, paliers (pur)
│   ├── stats.ts                # agrégats profil / serveur (pur)
│   ├── store.ts                # persistance : comptes, tirages, table
│   ├── sync.ts                 # synchronisation, file par serveur
│   └── views.ts                # données des images, résolution Discord, cache
└── rendering/
    ├── format.ts               # formatage des nombres
    ├── leaderboards.ts         # classements du jour et général
    └── cards.ts                # profil et statistiques du serveur
```

Briques partagées avec les autres modules : `#lib/task.ts` (tâches planifiées), `#lib/keyed-queue.ts` (file par clé), `#lib/revision-cache.ts` (cache invalidé par révision), `#lib/imaging.ts`, `#lib/leaderboard-table.ts` et `#lib/stat-card.ts` (rendu, décrit dans le guide « Générer des images » ; le classement est aussi utilisé par le jeu des 4h).

## Décisions

- Les commandes gardent leurs noms (`/rngdle`, `/rngdle-admin`). `/rngdle-admin setleaderboard` est remplacée par le champ `leaderboardChannel` de `/config rngdle`.
- Les tirages sont dédupliqués par l'identifiant unique que l'API renvoie pour chaque tirage, et non plus par « date + numéro ». Les scores sont stockés en `BIGINT`.
- Toutes les données sont scopées par serveur, y compris `clear` et `refresh`, qui touchaient tous les serveurs dans DJ4H. Les synchronisations et les modifications de comptes d'un même serveur passent par une seule file.
- Les réponses de rngdle.com sont validées à la réception ; les erreurs 429 et 5xx sont retentées.
- La table des percentiles est stockée en base. Un instantané versionné (`assets/score-table.json`) sert de valeur par défaut, ce qui évite le plantage de DJ4H sur un déploiement neuf. Une table extraite du site qui ne ressemble pas à une table de percentiles est ignorée.
- Les images reproduisent au pixel près celles de DJ4H, mais leurs textes sont traduits.
- La mention codée en dur « TnTube » du classement quotidien est supprimée.

## Mise en production

1. Déployer OmniBot : le conteneur `migrate` crée les tables `RngdleAccount`, `RngdleRoll` et `RngdleScoreTable`.
2. Arrêter DJ4H, puis récupérer sa base : `docker cp <conteneur dj4h>:/app/data/dj4h.db .`
3. Générer le SQL d'import des comptes et des salons de classement : `pnpm exec tsx scripts/export-dj4h-rngdle.ts dj4h.db > rngdle.sql`
4. L'appliquer dans le conteneur PostgreSQL : `docker exec -i <conteneur postgres> psql -U <utilisateur> -d <base> -v ON_ERROR_STOP=1 < rngdle.sql`. Le script est idempotent et fusionne le salon dans la configuration existante du serveur.
5. Redémarrer le bot, qui garde la configuration des serveurs en cache.
6. Activer le module avec `/modules`. Les tirages sont téléchargés à la synchronisation suivante, ou tout de suite avec `/rngdle-admin refresh`.
