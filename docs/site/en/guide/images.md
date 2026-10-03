# Generating Images

Leaderboards and stat cards are rendered as PNG images with [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas) (prebuilt binaries, nothing to install). Two ready-made renderers cover most needs; lower-level helpers are there for anything else.

| Module                   | Provides                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `#lib/leaderboard-table` | `renderLeaderboardTable`: ranked table with medals, avatars, names and your own columns              |
| `#lib/stat-card`         | `renderStatCard`: card with a portrait, a title, an optional rank, a grid of stat boxes and a footer |
| `#lib/imaging`           | Shared palette and font, avatar download, circular images, fitted text, assets                       |

The Outfit font and the gold, silver and bronze medals ship in `src/lib/assets/` and are loaded for you.

## A Leaderboard

Rows extend `LeaderboardEntry` (`rank`, `name`, `avatar`); the rank, medal, avatar and name columns are drawn for you. Describe the other columns:

```typescript
import { fetchAvatar } from "#lib/imaging.js";
import {
  renderLeaderboardTable,
  type LeaderboardEntry,
} from "#lib/leaderboard-table.js";

interface Row extends LeaderboardEntry {
  points: number;
}

const rows: Row[] = await Promise.all(
  players.map(async (player, index) => ({
    rank: index + 1,
    name: player.user.username,
    avatar: await fetchAvatar(player.user),
    points: player.points,
  }))
);

const png = await renderLeaderboardTable({
  headers: { rank: t("header.rank"), player: t("header.player") },
  rows,
  columns: [
    {
      header: t("header.points"),
      x: 650,
      maxWidth: 140,
      cell: (row) => ({ text: String(row.points) }),
    },
  ],
});
```

A column can be right-aligned (`align: "right"`, `x` is then its right edge), and each cell can set its own `color`, font `family` or a small `icon` drawn before the text. Pass `caller` to add the viewer's own row under a separator when they are not on the page, and `width` for a table wider than the default 800 px.

## A Stat Card

```typescript
import { renderStatCard } from "#lib/stat-card.js";

const png = await renderStatCard({
  image: await fetchAvatar(user),
  title: { text: user.username, y: 35, size: 50 },
  rank: { position: 3, total: 42 },
  valueSize: 30,
  rows: [
    [
      { title: t("stats.messages"), value: "1 204" },
      { title: t("stats.streak"), value: "12 days", color: [94, 233, 181] },
    ],
    [
      {
        title: t("stats.joined"),
        value: "2024-03-01",
        subtext: t("stats.joinedHint"),
      },
    ],
  ],
});
```

- **Rows** hold one to three boxes, laid out on the full width, in halves or in thirds.
- **A box** has a `title` and a `value`, and optionally a `color` (value and outline), a `suffix` after the value, a `subtext` and a small corner `avatar`.
- **The rank** shows a medal for the podium, `#N / total` otherwise; it is hidden when `position` is 0.
- **A footer** (`{ height, draw(ctx, top) }`) adds a custom panel under the boxes. `drawPanel`, `drawPanelTitle`, `drawText` and `measureText` from `#lib/stat-card` keep it consistent with the rest of the card; the RNGdle tier breakdown is built this way (`src/modules/rngdle/rendering/cards.ts`).

## Good Practices

- **Translate every text** you pass in (headers, titles, units): renderers draw what they receive.
- **Defer the reply** (`interaction.deferReply()`) before rendering: downloading avatars and drawing takes longer than Discord's 3-second limit allows.
- **Cache the PNG** when the same image is requested often, with `RevisionCache` from `#lib/revision-cache` keyed on the data that drives it.
- **Module-specific assets** (an extra font, icons) go in the module's own `assets/` folder; the Dockerfile copies every `assets/` folder next to the compiled code.
