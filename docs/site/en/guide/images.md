# Generating Images

Leaderboards and stat cards are rendered as PNG images with [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas) (prebuilt binaries, nothing to install). A ready-made stat card, and a table to draw in it, cover most needs; lower-level helpers are there for anything else.

| Module           | Provides                                                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#lib/table`     | `drawTable`, `playerColumn`, `drawCellText`: ranked table with medals, avatars, names and your own columns, drawn in a stat card                                                        |
| `#lib/stat-card` | `renderStatCard`: card with a portrait, a title, an optional rank, a grid of stat boxes and a side panel                                                                                |
| `#lib/imaging`   | Shared palette and font, default accent (`DEFAULT_ACCENT`), avatar download, circular images and ringed portraits (`drawPortrait`), highlighting (`drawHighlight`), fitted text, assets |

The Outfit font and the gold, silver and bronze medals ship in `src/lib/assets/` and are loaded for you. Outfit has no emojis: `font()` adds the system's emoji font when there is one (Noto Color Emoji, installed by the Docker image), so that names containing emojis render. Always go through `font()` rather than setting `ctx.font` by hand.

Each module declares its accent color in `rendering/theme.ts` (`export const ACCENT: Rgb = [141, 196, 255];`) and passes it as `accent` to every renderer, so all its images look alike. Without `accent`, `DEFAULT_ACCENT` applies.

## A Leaderboard

A ranked table is drawn by `drawTable` from `#lib/table`, in the footer of a stat card (see below): the card supplies the header (server icon, title, subtitle) and the table fills its width. With `rows: []`, the table starts right below the header.

Rows extend `RankedPlayer` (`rank`, `name`, `avatar`); `playerColumn` draws the rank (a medal for the podium), the avatar and the name, under two headers, and takes the width the names may use before they shrink. Describe the other columns:

```typescript
import { fetchAvatar, fetchImage, loadMedals } from "#lib/imaging.js";
import { PANEL_PADDING, renderStatCard } from "#lib/stat-card.js";
import {
  drawCellText,
  drawTable,
  playerColumn,
  tableHeight,
  type RankedPlayer,
} from "#lib/table.js";

interface Row extends RankedPlayer {
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
const medals = await loadMedals();

const png = await renderStatCard({
  accent: ACCENT,
  width: 800,
  image: await fetchImage(guild.iconURL({ extension: "png" })),
  title: t("leaderboard.title"),
  rows: [],
  footer: {
    height: tableHeight(rows.length),
    draw(ctx, x, y, width) {
      drawTable<Row>(ctx, x, y, width, {
        rows,
        columns: [
          ...playerColumn(
            { rank: t("header.rank"), player: t("header.player") },
            420,
            medals
          ),
          {
            header: t("header.points"),
            x: width - PANEL_PADDING,
            align: "right",
            draw: (c, row, cx, cy) =>
              drawCellText(c, String(row.points), cx, cy, {
                align: "right",
                color: ACCENT,
              }),
          },
        ],
      });
    },
  },
});
```

Each column has a `header` and an `x`, its left edge, or its right edge with `align: "right"`; its `draw(ctx, row, x, centerY)` draws the cell, `drawCellText` for text (`align`, `color`, `size`, and `fitWidth` to shrink a long text). A column without `draw` only labels what another column draws below it. `tableHeight(rows, extra, titled)` gives the height to reserve. The table can also take a `title`, drawn inside the panel above a separator, an `extra` row (the viewer's own, when they are not on the page) under a separator, tinted with `extraAccent`, and a `highlight(row, index)` that tints a row. The RNGdle leaderboards and history (`src/modules/rngdle/rendering/`) and the 4h game leaderboards (`src/modules/four-hour-game/rendering/leaderboard-image.ts`) are built this way.

## A Stat Card

```typescript
import { renderStatCard } from "#lib/stat-card.js";

const png = await renderStatCard({
  image: await fetchAvatar(user),
  title: user.username,
  subtitle: t("stats.memberSince", { date }),
  rank: { position: 3, total: 42 },
  rows: [
    [
      { title: t("stats.messages"), value: "1 204" },
      { title: t("stats.streak"), value: "12 days", color: [94, 233, 181] },
    ],
    [
      {
        title: t("stats.joined"),
        value: "2024-03-01",
        subtext: t("stats.hint"),
      },
    ],
  ],
});
```

The card is 1000 px wide by default (`width` widens it), landscape, so Discord displays it large enough to read. Its `accent`, the module's color, colors the line under the header, the portrait ring and the rank.

- **The header** shows the round `image`, the `title`, an optional `subtitle` and an optional `rank`: a medal for the podium, `#N / total` otherwise, hidden when `position` is 0.
- **Rows** hold one to three boxes, which share the row's width.
- **A box** has a `title` and a `value`, and optionally a `color` (value, light tint and an edge on the left; `highlight: false` colors the value without highlighting the box), a `subtext`, a `trend` (`{ text, direction: "up" | "down" }`, a green or red arrow and text before the subtext) and a small corner `avatar`. Text that is too long shrinks to fit the box.
- **An aside** (`{ width, draw(ctx, x, y, width, height) }`) adds a custom panel on the right of the boxes, as tall as them. `drawPanel`, `drawPanelTitle`, `drawText`, `drawFittedText` and `measureText` from `#lib/stat-card` keep it consistent with the rest of the card; the RNGdle tier breakdown is built this way (`src/modules/rngdle/rendering/cards.ts`).
- **A footer** (`{ height, draw(ctx, x, y, width) }`) adds a custom section below the boxes, across the whole content width, and the card grows by its height. Leaderboards draw their tables there (see above).

## Good Practices

- **Translate every text** you pass in (headers, titles, units): renderers draw what they receive.
- **Defer the reply** (`interaction.deferReply()`) before rendering: downloading avatars and drawing takes longer than Discord's 3-second limit allows.
- **Cache the PNG** when the same image is requested often, with `RevisionCache` from `#lib/revision-cache` keyed on the data that drives it.
- **Module-specific assets** (an extra font, icons) go in the module's own `assets/` folder; the Dockerfile copies every `assets/` folder next to the compiled code.
