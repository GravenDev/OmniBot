# Spec — Module RNGdle : portage depuis DJ4H

> **Statut : implémenté.** Ce document a servi de contrat d'implémentation : il fige les signatures partagées entre les différentes parties du module.

## Objectif

Porter dans OmniBot la partie RNGdle du bot DJ4H (Python) : lien entre un membre Discord et son compte [rngdle.com](https://www.rngdle.com), synchronisation de ses tirages, classements, profil, statistiques du serveur et classement quotidien posté automatiquement. Après ce portage, DJ4H peut être arrêté.

Source de référence : `DJ4H/commands/cogs/rngdle.py`, `DJ4H/utils/rngdle.py`, `DJ4H/utils/database/dao/rngdle.py`, `DJ4H/utils/tasks/rngdle_*.py`, `DJ4H/utils/image_generator.py`.

## Arborescence

```
src/modules/rngdle/
├── rngdle.module.ts
├── rngdle.config.ts            # leaderboardChannel (CHANNEL)
├── rngdle.prisma
├── assets/                     # polices, médailles, icônes, score-table.json
├── i18n/{en,fr}.json
├── commands/
│   ├── rngdle.command.ts       # leaderboard, profile, server-stats, leaderboard-all
│   └── rngdle-admin.command.ts # register, delete, show, refresh, clear
├── interactions/
│   └── overall-page.button.ts  # pagination de leaderboard-all
├── tasks/                      # synchro, table des percentiles, classement quotidien
├── services/
│   ├── score-table.ts          # paliers, percentiles (pur)
│   ├── format.ts               # formatage des nombres (pur)
│   ├── rngdle-api.ts           # client rngdle.com
│   ├── stats.ts                # agrégats profil / serveur (pur)
│   └── …                       # comptes, synchro, requêtes, cache d'images
└── rendering/
    ├── common.ts               # polices, palette, médailles, icônes, boîte arrondie
    ├── daily-leaderboard-image.ts
    ├── profile-image.ts
    ├── server-stats-image.ts
    └── overall-leaderboard-image.ts
```

## Décisions

- Les commandes gardent leurs noms (`/rngdle`, `/rngdle-admin`). `/rngdle-admin setleaderboard` est remplacée par le champ `leaderboardChannel` de `/config rngdle`.
- Les tirages sont dédupliqués par l'identifiant unique que l'API renvoie pour chaque tirage, et non plus par « date + numéro ».
- Toutes les données sont scopées par serveur, y compris `clear` et `refresh`, qui touchaient tous les serveurs dans DJ4H.
- La table des percentiles est stockée en base. Un instantané versionné (`assets/score-table.json`) sert de valeur par défaut, ce qui évite le plantage de DJ4H sur un déploiement neuf.
- Les tâches planifiées passent par le planificateur du cœur (`#lib/task.ts`, croner, UTC).
- La mention codée en dur « TnTube » du classement quotidien est supprimée.

## Contrat des générateurs d'images

Chaque générateur est un port fidèle de la classe Python correspondante : mêmes dimensions, positions, couleurs et tailles de police. Seuls les textes changent : ils sont passés en paramètre (`labels`) pour être traduits. Les générateurs ne font aucune requête réseau : les avatars et icônes arrivent déjà chargés (`Image | null`, `null` = disque gris).

Ancres de texte Pillow : `anchor="lt"` → `fillTextAnchored(ctx, text, x, y)` ; texte sans ancre (défaut Pillow `la`) → `fillTextAnchored(ctx, text, x, y, "ascender")`. Pour l'ancre `rt`, poser `ctx.textAlign = "right"` avant l'appel.

### `renderDailyLeaderboard` — `LeaderboardGenerator` avec `RNGdleLeaderboardUser`

```ts
export interface DailyLeaderboardRow {
  rank: number;
  name: string;
  avatar: Image | null;
  number: number;
  score: number;
  percent: number;
  tier: TierOrError;
}
export interface DailyLeaderboardLabels {
  rank: string;
  player: string;
  number: string;
  score: string;
  placement: string;
}
export function renderDailyLeaderboard(
  rows: DailyLeaderboardRow[],
  labels: DailyLeaderboardLabels
): Promise<Buffer>;
```

Lignes placées selon leur index (et non leur rang). Colonne tirage : `formatSpaced(number)` complété à gauche à 7 caractères, police `MONO_FONT`, couleur du palier. Colonne score : `formatCompact(score)`. Colonne placement : `formatPercent(percent)` en couleur du palier, précédé de `arrow_up` si `percent > 50`, sinon `trash`.

### `renderProfile` — `ProfileGenerator`

```ts
export interface ProfileRoll {
  number: number;
  score: number;
  tier: TierOrError;
  dateText: string;
}
export interface ProfileImageData {
  username: string;
  avatar: Image | null;
  serverRank: number;
  totalPlayers: number;
  best: ProfileRoll;
  worst: ProfileRoll;
  totalRolls: number;
  averageScore: number;
  averageTier: TierOrError;
  maxBadges: number;
  totalScore: number;
  tierCounts: Record<Tier, number>;
}
export interface ProfileLabels {
  bestRoll: string;
  worstRoll: string;
  date: (date: string) => string;
  totalRolls: string;
  averageScore: string;
  maxBadges: string;
  maxBadgesValue: (count: number) => string;
  overallScore: string;
  tierBreakdown: string;
}
export function renderProfile(
  data: ProfileImageData,
  labels: ProfileLabels
): Promise<Buffer>;
```

### `renderServerStats` — `ServerStatGenerator`

```ts
export interface ServerStatsRoll {
  number: number;
  score: number;
  tier: TierOrError;
  playerName: string;
  avatar: Image | null;
}
export interface ServerStatsImageData {
  icon: Image | null;
  best: ServerStatsRoll;
  worst: ServerStatsRoll;
  totalRolls: number;
  averageScore: number;
  averageTier: TierOrError;
  overallScore: number;
  tierCounts: Record<Tier, number>;
  tierLeaders: Record<Tier, (Image | null)[]>;
}
export interface ServerStatsLabels {
  title: string;
  bestRoll: string;
  worstRoll: string;
  by: (name: string) => string;
  totalRolls: string;
  averageScore: string;
  overallScore: string;
  tierBreakdown: string;
}
export function renderServerStats(
  data: ServerStatsImageData,
  labels: ServerStatsLabels
): Promise<Buffer>;
```

`tierLeaders` : au plus 3 avatars par palier, du plus fréquent au moins fréquent ; le premier est dessiné par-dessus les autres.

### `renderOverallLeaderboard` — `OverallLeaderboardGenerator`

```ts
export interface OverallRow {
  rank: number;
  name: string;
  avatar: Image | null;
  totalScore: number;
}
export interface OverallLabels {
  rank: string;
  player: string;
  overallScore: string;
}
export function renderOverallLeaderboard(
  rows: OverallRow[],
  labels: OverallLabels,
  locale: string,
  caller?: OverallRow
): Promise<Buffer>;
```

Score affiché : `` `${formatShort(totalScore, locale)} EP` ``. `caller` ajoute, sous un séparateur, la ligne du membre qui consulte quand il n'est pas sur la page.

### Modules partagés (déjà écrits, ne pas modifier)

- `services/score-table.ts` : `TIERS`, `Tier`, `TierOrError`, `TIER_COLORS`, `formatPercent`, `ScoreTable`.
- `services/format.ts` : `formatSpaced`, `formatCompact`, `formatShort`.
- `rendering/common.ts` : `FONT`, `MONO_FONT`, `PALETTE`, `registerFonts`, `font`, `loadMedals`, `loadIcon`, `fillRoundedBox`.
- `#lib/imaging.js` : `drawCircularImage`, `drawFittedText`, `fillTextAnchored`, `rgb`.

## Mise en production

1. Déployer OmniBot : le conteneur `migrate` crée les tables `RngdleAccount`, `RngdleRoll` et `RngdleScoreTable`.
2. Arrêter DJ4H, puis récupérer sa base : `docker cp <conteneur dj4h>:/app/data/dj4h.db .`
3. Générer le SQL d'import des comptes et des salons de classement : `pnpm exec tsx scripts/export-dj4h-rngdle.ts dj4h.db > rngdle.sql`
4. L'appliquer dans le conteneur PostgreSQL : `docker exec -i <conteneur postgres> psql -U <utilisateur> -d <base> -v ON_ERROR_STOP=1 < rngdle.sql`. Le script est idempotent et fusionne le salon dans la configuration existante du serveur.
5. Redémarrer le bot, qui garde la configuration des serveurs en cache.
6. Activer le module avec `/modules`. Les tirages sont téléchargés à la synchronisation suivante, ou tout de suite avec `/rngdle-admin refresh`.
