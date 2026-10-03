# Générer des images

Les classements et les fiches de statistiques sont rendus en images PNG avec [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas) (binaires précompilés, rien à installer). Deux générateurs prêts à l'emploi couvrent l'essentiel des besoins ; des fonctions de plus bas niveau sont là pour le reste.

| Module                   | Fournit                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `#lib/leaderboard-table` | `renderLeaderboardTable` : tableau classé avec médailles, avatars, pseudos et vos propres colonnes                |
| `#lib/stat-card`         | `renderStatCard` : fiche avec portrait, titre, rang optionnel, grille de cases de statistiques et panneau latéral |
| `#lib/imaging`           | Palette et police communes, téléchargement d'avatars, images rondes, texte ajusté, ressources                     |

La police Outfit et les médailles or, argent et bronze sont fournies dans `src/lib/assets/` et chargées pour vous.

## Un classement

Les lignes étendent `LeaderboardEntry` (`rank`, `name`, `avatar`) : les colonnes rang, médaille, avatar et pseudo sont dessinées pour vous. Décrivez les autres colonnes :

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

Une colonne peut être alignée à droite (`align: "right"`, `x` est alors son bord droit), et chaque cellule peut fixer sa `color`, sa police (`family`) ou une petite `icon` dessinée avant le texte. Passez `caller` pour ajouter, sous un séparateur, la ligne de la personne qui consulte quand elle n'est pas sur la page, et `width` pour un tableau plus large que les 800 px par défaut.

## Une fiche de statistiques

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
      { title: t("stats.streak"), value: "12 jours", color: [94, 233, 181] },
    ],
    [
      {
        title: t("stats.joined"),
        value: "01/03/2024",
        subtext: t("stats.hint"),
      },
    ],
  ],
});
```

La fiche fait 1000 px de large, en paysage, pour que Discord l'affiche assez grande pour être lue.

- **L'en-tête** affiche l'`image` ronde, le `title`, un `subtitle` optionnel et un `rank` optionnel : une médaille pour le podium, `#N / total` sinon, masqué quand `position` vaut 0.
- **Les lignes** contiennent une à trois cases, qui se partagent la largeur de la ligne.
- **Une case** a un `title` et une `value`, et éventuellement une `color` (valeur et contour ; `outline: false` garde la couleur sans le cadre), un `subtext` et un petit `avatar` dans le coin. Un texte trop long rétrécit pour tenir dans la case.
- **Un panneau latéral** (`{ width, draw(ctx, x, y, width, height) }`) ajoute un panneau personnalisé à droite des cases, de la même hauteur qu'elles. `drawPanel`, `drawPanelTitle`, `drawText`, `drawFittedText` et `measureText` de `#lib/stat-card` le gardent cohérent avec le reste de la fiche ; la répartition par palier de RNGdle est construite ainsi (`src/modules/rngdle/rendering/cards.ts`).

## Bonnes pratiques

- **Traduisez chaque texte** que vous passez (en-têtes, titres, unités) : les générateurs dessinent ce qu'ils reçoivent.
- **Différez la réponse** (`interaction.deferReply()`) avant de générer : télécharger les avatars et dessiner prend plus que les 3 secondes accordées par Discord.
- **Mettez le PNG en cache** quand la même image est souvent demandée, avec `RevisionCache` de `#lib/revision-cache`, sur une clé qui dépend des données affichées.
- **Les ressources propres à un module** (une autre police, des icônes) vont dans son dossier `assets/` ; le Dockerfile copie chaque dossier `assets/` à côté du code compilé.
