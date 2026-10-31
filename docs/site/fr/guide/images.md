# Générer des images

Les classements et les fiches de statistiques sont rendus en images PNG avec [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas) (binaires précompilés, rien à installer). Une fiche de statistiques prête à l'emploi, et un tableau à dessiner dedans, couvrent l'essentiel des besoins ; des fonctions de plus bas niveau sont là pour le reste.

| Module           | Fournit                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#lib/table`     | `drawTable`, `playerColumn`, `drawCellText` : tableau classé avec médailles, avatars, pseudos et vos propres colonnes, dessiné dans une fiche                                                              |
| `#lib/stat-card` | `renderStatCard` : fiche avec portrait, titre, rang optionnel, grille de cases de statistiques et panneau latéral                                                                                          |
| `#lib/imaging`   | Palette et police communes, accent par défaut (`DEFAULT_ACCENT`), téléchargement d'avatars, images rondes et portraits cerclés (`drawPortrait`), mise en avant (`drawHighlight`), texte ajusté, ressources |

La police Outfit et les médailles or, argent et bronze sont fournies dans `src/lib/assets/` et chargées pour vous. Outfit n'a pas d'emojis : `font()` ajoute la police emoji du système quand elle existe (Noto Color Emoji, installée par l'image Docker), pour que les pseudos qui en contiennent s'affichent. Passez toujours par `font()` plutôt que d'écrire `ctx.font` à la main.

Chaque module déclare sa couleur d'accent dans `rendering/theme.ts` (`export const ACCENT: Rgb = [141, 196, 255];`) et la passe en `accent` à chaque générateur, pour que toutes ses images se ressemblent. Sans `accent`, c'est `DEFAULT_ACCENT` qui s'applique.

## Un classement

Un tableau classé est dessiné par `drawTable` de `#lib/table`, dans le pied d'une fiche de statistiques (voir plus bas) : la fiche fournit l'en-tête (icône du serveur, titre, sous-titre) et le tableau occupe toute sa largeur. Avec `rows: []`, le tableau commence juste sous l'en-tête.

Les lignes étendent `RankedPlayer` (`rank`, `name`, `avatar`) ; `playerColumn` dessine le rang (une médaille pour le podium), l'avatar et le pseudo, sous deux en-têtes, et reçoit la largeur que les pseudos peuvent occuper avant de rétrécir. Décrivez les autres colonnes :

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

Chaque colonne a un `header` et un `x`, son bord gauche, ou son bord droit avec `align: "right"` ; son `draw(ctx, row, x, centerY)` dessine la cellule, `drawCellText` pour du texte (`align`, `color`, `size`, et `fitWidth` pour rétrécir un texte trop long). Une colonne sans `draw` ne fait qu'étiqueter ce qu'une autre colonne dessine en dessous. `tableHeight(rows, extra, titled)` donne la hauteur à réserver. Le tableau accepte aussi un `title`, dessiné dans le panneau au-dessus d'un séparateur, une ligne `extra` (celle de la personne qui consulte, quand elle n'est pas sur la page) sous un séparateur, teintée de `extraAccent`, et un `highlight(row, index)` qui teinte une ligne. Les classements et l'historique de RNGdle (`src/modules/rngdle/rendering/`) et les classements du jeu des 4h (`src/modules/four-hour-game/rendering/leaderboard-image.ts`) sont construits ainsi.

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

La fiche fait 1000 px de large par défaut (`width` pour l'élargir), en paysage, pour que Discord l'affiche assez grande pour être lue. Son `accent`, la couleur du module, colore le liseré sous l'en-tête, l'anneau du portrait et le rang.

- **L'en-tête** affiche l'`image` ronde, le `title`, un `subtitle` optionnel et un `rank` optionnel : une médaille pour le podium, `#N / total` sinon, masqué quand `position` vaut 0.
- **Les lignes** contiennent une à trois cases, qui se partagent la largeur de la ligne.
- **Une case** a un `title` et une `value`, et éventuellement une `color` (valeur, teinte légère et liseré sur le bord gauche ; `highlight: false` colore la valeur sans mettre la case en avant), un `subtext`, une `trend` (`{ text, direction: "up" | "down" }`, une flèche et un texte verts ou rouges avant le `subtext`) et un petit `avatar` dans le coin. Un texte trop long rétrécit pour tenir dans la case.
- **Un panneau latéral** (`{ width, draw(ctx, x, y, width, height) }`) ajoute un panneau personnalisé à droite des cases, de la même hauteur qu'elles. `drawPanel`, `drawPanelTitle`, `drawText`, `drawFittedText` et `measureText` de `#lib/stat-card` le gardent cohérent avec le reste de la fiche ; la répartition par palier de RNGdle est construite ainsi (`src/modules/rngdle/rendering/cards.ts`).
- **Un pied** (`{ height, draw(ctx, x, y, width) }`) ajoute une section personnalisée sous les cases, sur toute la largeur du contenu, et la fiche grandit d'autant. Les classements y dessinent leurs tableaux (voir plus haut).

## Prévisualiser une image

Un rendu ne se juge qu'en le regardant. À côté de lui, un fichier `<rendu>.preview.ts` exporte des rendus d'exemple, typés `Previews` (`#lib/preview`), qui renvoient chacun un PNG à partir de données écrites dans le fichier (sans réseau : avatars et icônes restent à `null`) :

```typescript
import type { Previews } from "#lib/preview.js";
import { renderReportCard } from "./report-card.js";

export default {
  report: () => renderReportCard(data, labels),
  "without-members": () =>
    renderReportCard({ ...data, topMembers: null }, labels),
} satisfies Previews;
```

`pnpm render-preview <fichier.preview.ts> --out <dossier>` les dessine en `<nom>-after.png`, depuis l'arbre de travail. Avec `--before <ref>` (pour une PR : le hash qu'affiche `git merge-base HEAD origin/master`), il dessine aussi `<nom>-before.png` depuis ce commit, dans un worktree temporaire où le fichier de prévisualisation actuel est copié : les deux côtés dessinent les mêmes données et ne diffèrent que par le changement. `--only <nom>` dessine une seule entrée. Un rendu qui attend un `t` l'obtient avec `await previewT("<id du module>", fr)` (`#lib/preview`), à partir du `i18n/fr.json` du module, comme dans `src/modules/four-hour-game/rendering/profile-card.preview.ts`. Les fichiers de prévisualisation sont vérifiés par `tsc` avec le reste de `src/` : un changement de forme des données se voit au build. Exemple : `src/modules/server-stats/rendering/report-card.preview.ts`.

Les emojis sont dessinés avec la police emoji du système : leur aspect change d'un système à l'autre, pas le texte ni la mise en page.

Pour une paire qui vaille d'être montrée :

- **Les données.** Recopiez tels quels les caractères en cause (un nom de salon avec `︱`, par exemple : un sosie tapé à la main est un autre point de code), des pseudos à la limite de 32 caractères de Discord, cinq lignes, des accents. Le fichier est public : inventez les noms des membres et dites-le en commentaire.
- **Quel côté.** Rien n'a encore changé : pas de `--before`, une paire identique ne prouve rien. Un correctif déjà fusionné : l'arbre de travail contient tout ce qui a été fusionné depuis, donc dessinez les deux côtés en « avant », `--before <correctif>~1 --out <dossier>/old` puis `--before <correctif> --out <dossier>/new` (`~1`, car cmd.exe avale `^`), et comparez `old/<nom>-before.png` à `new/<nom>-before.png`.
- **La sortie.** `identical: <nom>` signale une paire identique à l'octet : rien n'a changé à cet endroit, ou le mauvais commit a été dessiné. Une entrée que l'ancien code ne sait pas dessiner, ou qu'il dessine avec « undefined » ou « NaN » (un champ absent des données), échoue : montrez-la sans « avant ». Regardez chaque image avant de la montrer, et donnez à `--out` un dossier neuf et vide.
- **Un passage interrompu** laisse le worktree qu'il a affiché sur stderr (`worktree: <chemin>`) ; `pnpm render-preview --clean <chemin>` le supprime, et refuse tout autre dossier.

Dans une pull request, et seulement quand elle est demandée : `gh pr create … --attach "./x-before.png#Avant" --attach "./x-after.png#Après"` (gh 2.99 ou plus) téléverse les images et réécrit sur place les références `![…](./x-before.png)` du corps : mettez la paire dans un tableau à deux colonnes avec les chemins locaux. Lancez-le depuis le dossier des images, avec `-R <propriétaire>/<dépôt> --head <branche>` hors du dépôt ; pour une pull request existante, `gh pr edit <numéro> --body-file body.md --attach …`, sinon les images partent en fin de description. Dites quelles données sont inventées, et que les emojis peuvent s'afficher autrement en production, sans nommer le système qui a dessiné les images.

## Bonnes pratiques

- **Traduisez chaque texte** que vous passez (en-têtes, titres, unités) : les générateurs dessinent ce qu'ils reçoivent.
- **Différez la réponse** (`interaction.deferReply()`) avant de générer : télécharger les avatars et dessiner prend plus que les 3 secondes accordées par Discord.
- **Mettez le PNG en cache** quand la même image est souvent demandée, avec `RevisionCache` de `#lib/revision-cache`, sur une clé qui dépend des données affichées.
- **Les ressources propres à un module** (une autre police, des icônes) vont dans son dossier `assets/` ; le Dockerfile copie chaque dossier `assets/` à côté du code compilé.
