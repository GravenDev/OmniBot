import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { TFunction } from "#lib/i18n.js";
import { parseGame } from "./games/pgn.js";
import { RATING_ORDER, playerSide } from "./ratings.js";
import ratingEmojis from "./services/rating-emojis.service.js";
import type { ChessSession, GameAnalysis, GameSummary } from "./types.js";
import {
  EPHEMERAL_FLAGS,
  PUBLIC_FLAGS,
  analyseMessage,
  boardMessage,
  chessView,
  listMessage,
  reportMessage,
  withNotice,
} from "./views.js";

vi.mock("./rendering/board.js", () => ({
  renderBoard: vi.fn(async () => Buffer.from("image")),
}));

const t: TFunction = (key, options) =>
  `${key}${options ? ` ${JSON.stringify(options)}` : ""}`;

ratingEmojis.set(
  Object.fromEntries(
    RATING_ORDER.map((rating) => [rating, `:${rating}:`])
  ) as never
);

const game: GameSummary = {
  id: "g1",
  source: "lichess",
  white: "Alice",
  black: "Bob",
  result: "white",
  timeControl: "180+2",
  speed: "blitz",
  playedAt: new Date("2026-11-20T12:00:00Z"),
  url: null,
  pgn: "1. e4 e5 *",
};

const parsed = parseGame(game.pgn)!;

const analysis: GameAnalysis = {
  accuracies: { white: 91.23, black: 88.0 },
  ratings: ["best", "best"],
  evaluations: [
    { type: "cp", value: 0 },
    { type: "cp", value: 0 },
    { type: "cp", value: 0 },
  ],
  counts: {
    white: [{ rating: "best", count: 2 }],
    black: [],
  },
};

function session(overrides: Partial<ChessSession> = {}): ChessSession {
  return {
    id: "session-id",
    ownerId: "owner",
    mode: "view",
    view: "board",
    side: "white",
    games: [game],
    parsed,
    page: 1,
    ply: 2,
    flipped: false,
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

describe("chess message views", () => {
  it("lists each game with its outcome for the requested player and separators", () => {
    const message = listMessage(
      session({
        games: [
          { ...game, white: "Alice", black: "Bob" },
          { ...game, white: "Carol", black: "Alice", result: "black" },
        ],
        requestedPlayer: "alice",
      }),
      t,
      "fr"
    );
    const json = JSON.stringify(message);
    expect(message.flags).toBe(EPHEMERAL_FLAGS);
    expect(json).toContain("✅ **Alice – Bob**");
    expect(json).toContain("✅ **Carol – Alice**");
    expect(json).toContain('"type":14,"divider":true');
  });

  it("offers a green watch button for a game still in progress", () => {
    const message = listMessage(
      session({
        games: [
          {
            ...game,
            ongoing: true,
            url: "https://lichess.org/abcd1234",
            result: "unknown",
          },
        ],
      }),
      t,
      "fr"
    );
    const json = JSON.stringify(message.components[0]?.toJSON());

    expect(json).toContain("chess-watch:session-id:0");
    expect(json).toContain('"label":"list.watch","style":3');
    expect(json).not.toContain('"label":"list.view"');
    expect(json).toContain("list.ongoing");
  });

  it("keeps the current page in a disabled middle button", () => {
    const message = listMessage(
      session({ games: Array.from({ length: 6 }, () => game) }),
      t,
      "fr",
      2
    );
    const actionRow = message.components[0]
      ?.toJSON()
      .components.at(-1) as ReturnType<typeof JSON.parse>;
    expect(actionRow.components[0]).toMatchObject({
      label: "<",
      disabled: false,
    });
    expect(actionRow.components[1]).toMatchObject({
      label: 'list.page {"current":2,"total":2}',
      disabled: true,
    });
    expect(actionRow.components[2]).toMatchObject({
      label: ">",
      disabled: true,
    });
  });

  it("uses side squares in the title and names the report", () => {
    const bundles = (["en", "fr"] as const).map(
      (lng) =>
        JSON.parse(
          readFileSync(new URL(`./i18n/${lng}.json`, import.meta.url), "utf8")
        ) as Record<string, string>
    );
    expect(bundles.map((bundle) => bundle["viewer.title"])).toEqual([
      "⬜ {{white}} · ⬛ {{black}}",
      "⬜ {{white}} · ⬛ {{black}}",
    ]);
    expect(bundles.map((bundle) => bundle["report.title"])).toEqual([
      "Report for {{player}} ({{side}})",
      "Rapport de {{player}} ({{side}})",
    ]);
    expect(bundles.map((bundle) => bundle["report.accuracy"])).toEqual([
      "Accuracy — {{value}} %",
      "Précision — {{value}} %",
    ]);
  });

  it("puts the players, subtitle and separator in the message, not the image", async () => {
    const message = await boardMessage(session(), t, false);
    const json = JSON.stringify(message);
    expect(message.files).toHaveLength(1);
    expect(message.components).toHaveLength(2);
    expect(json).toContain("viewer.title");
    expect(json).toContain("viewer.subtitle");
    expect(json).toContain('"type":14,"divider":true');
    expect(json).toContain("attachment://board-session-id.png");
    expect(message.flags).toBe(PUBLIC_FLAGS);
  });

  it("keeps all three action buttons and disables the current board view", async () => {
    const message = await boardMessage(session(), t);
    const container = message.components[0]?.toJSON() as ReturnType<
      typeof JSON.parse
    >;
    const nav = container.components.at(-1) as ReturnType<typeof JSON.parse>;
    expect(
      nav.components.map((button: { custom_id: string }) => button.custom_id)
    ).toEqual([
      "chess-nav:session-id:first",
      "chess-nav:session-id:prev",
      "chess-nav:session-id:flip",
      "chess-nav:session-id:next",
      "chess-nav:session-id:last",
    ]);
    const actions = message.components[1]?.toJSON() as ReturnType<
      typeof JSON.parse
    >;
    expect(
      actions.components.map(
        (button: { custom_id: string; label: string; disabled: boolean }) =>
          `${button.custom_id} ${button.label} ${button.disabled}`
      )
    ).toEqual([
      "chess-action:session-id:board ♟️ viewer.game true",
      "chess-action:session-id:analyse 🔍 viewer.analyse false",
      "chess-action:session-id:report 📊 viewer.report false",
    ]);
  });

  it("disables analyse and report for a variant, which Stockfish cannot rate", async () => {
    const base = session();
    const message = await boardMessage(
      session({ parsed: { ...base.parsed!, variant: "atomic" } }),
      t
    );
    const actions = message.components[1]?.toJSON() as ReturnType<
      typeof JSON.parse
    >;
    expect(
      actions.components.map(
        (button: { custom_id: string; disabled: boolean }) =>
          `${button.custom_id} ${button.disabled}`
      )
    ).toEqual([
      "chess-action:session-id:board true",
      "chess-action:session-id:analyse true",
      "chess-action:session-id:report true",
    ]);
  });

  it("adds a transient notice below the three action buttons", async () => {
    const board = await boardMessage(session(), t);
    const message = withNotice(board, "viewer.analysing");

    expect(message.components).toHaveLength(3);
    expect(message.files).toHaveLength(1);
    expect(message.flags).toBe(board.flags);
    expect(JSON.stringify(message.components[1]?.toJSON())).toContain(
      "chess-action"
    );
    expect(JSON.stringify(message.components[2]?.toJSON())).toContain(
      "viewer.analysing"
    );
  });

  it("shows the move and its evaluation in the analyse tab", async () => {
    const message = await analyseMessage(
      session({ analysis, mode: "analyse", view: "analyse", ply: 1 }),
      t
    );
    const json = JSON.stringify(message);
    expect(message.files).toHaveLength(1);
    expect(json).toContain("analyse.title");
    expect(json).toContain("analyse.evaluation");
    expect(json).toContain(":best: e4");
    expect(json).toContain(`${"⬜".repeat(8)}${"⬛".repeat(8)}`);
  });

  it("separates the board from the analysis readout", async () => {
    const message = await analyseMessage(
      session({ analysis, mode: "analyse", view: "analyse", ply: 1 }),
      t
    );
    const container = JSON.stringify(message.components[0]?.toJSON());
    expect(container.match(/"type":14,"divider":true/g)).toHaveLength(2);
  });

  it("disables the analyse button while that tab is open", async () => {
    const message = await analyseMessage(
      session({ analysis, mode: "analyse", view: "analyse", ply: 1 }),
      t
    );
    const actions = message.components[1]?.toJSON() as ReturnType<
      typeof JSON.parse
    >;
    expect(
      actions.components.map(
        (button: { custom_id: string; label: string; disabled: boolean }) =>
          `${button.custom_id} ${button.label} ${button.disabled}`
      )
    ).toEqual([
      "chess-action:session-id:board ♟️ viewer.game false",
      "chess-action:session-id:analyse 🔍 viewer.analyse true",
      "chess-action:session-id:report 📊 viewer.report false",
    ]);
  });

  it("changes the gauge with the board state", async () => {
    const evaluated = {
      ...analysis,
      evaluations: [
        { type: "cp" as const, value: 0 },
        { type: "cp" as const, value: 1_000 },
        { type: "cp" as const, value: -1_000 },
      ],
    };
    const first = await analyseMessage(
      session({ analysis: evaluated, view: "analyse", ply: 0 }),
      t
    );
    const last = await analyseMessage(
      session({ analysis: evaluated, view: "analyse", ply: 2 }),
      t
    );

    expect(JSON.stringify(first)).toContain(
      `${"⬜".repeat(8)}${"⬛".repeat(8)}`
    );
    expect(JSON.stringify(last)).toContain("⬛".repeat(16));
  });

  it("attributes a final checkmate to the side that delivered it", async () => {
    const cases = [
      {
        pgn: "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0",
        winner: "analyse.checkmateWhite",
        gauge: "⬜".repeat(16),
      },
      {
        pgn: "1. f3 e5 2. g4 Qh4# 0-1",
        winner: "analyse.checkmateBlack",
        gauge: "⬛".repeat(16),
      },
    ];
    for (const { pgn, winner, gauge } of cases) {
      const mated = parseGame(pgn)!;
      const ply = mated.steps.length;
      const message = await analyseMessage(
        session({
          parsed: mated,
          ply,
          analysis: {
            ...analysis,
            ratings: Array.from({ length: ply }, () => "best" as const),
            evaluations: Array.from({ length: ply + 1 }, () => ({
              type: "cp" as const,
              value: 0,
            })).map((evaluation, index) =>
              index === ply ? { type: "mate" as const, value: 0 } : evaluation
            ),
          },
          view: "analyse",
        }),
        t
      );
      const json = JSON.stringify(message);
      expect(json).toContain(winner);
      expect(json).toContain(gauge);
    }
  });

  it("renders the tab stored on the session", async () => {
    const message = await chessView(
      session({ analysis, mode: "analyse", view: "analyse", ply: 1 }),
      t
    );
    expect(JSON.stringify(message)).toContain("analyse.title");
  });

  it("reads the requested player's colour from a game", () => {
    expect(playerSide(game, "alice")).toBe("white");
    expect(playerSide(game, "BOB")).toBe("black");
    expect(playerSide(game, "Carol")).toBeNull();
    expect(playerSide(game)).toBeNull();
  });

  it("reports without a board attachment", () => {
    const message = reportMessage(session({ analysis, mode: "report" }), t);
    const json = JSON.stringify(message);
    expect(message.files).toBeUndefined();
    expect(json).toContain(":best:");
    expect(json).toContain("91.2");
    expect(json).not.toContain(":critical:");
  });

  it("puts the other-side switch inside the report container", () => {
    const message = reportMessage(session({ analysis, mode: "report" }), t);
    expect(message.components).toHaveLength(2);
    const container = message.components[0]?.toJSON() as ReturnType<
      typeof JSON.parse
    >;
    const other = container.components.at(-1);
    expect(other.components).toHaveLength(1);
    expect(other.components[0]).toMatchObject({
      custom_id: "chess-action:session-id:opponent",
      label: "🔄 report.otherSide",
    });
    expect(JSON.stringify(container)).not.toContain(
      "chess-action:session-id:board"
    );

    const actions = message.components[1]?.toJSON() as ReturnType<
      typeof JSON.parse
    >;
    expect(
      actions.components.map(
        (button: { custom_id: string; label: string; disabled: boolean }) =>
          `${button.custom_id} ${button.label} ${button.disabled}`
      )
    ).toEqual([
      "chess-action:session-id:board ♟️ viewer.game false",
      "chess-action:session-id:analyse 🔍 viewer.analyse false",
      "chess-action:session-id:report 📊 viewer.report true",
    ]);
  });

  it("titles the report with the player and side stored on the session", () => {
    const message = reportMessage(
      session({ analysis, mode: "report", side: "black" }),
      t
    );
    const json = JSON.stringify(message);
    expect(json).toContain("report.title");
    expect(json).toContain("Bob");
    expect(json).toContain("report.side.black");

    const flipped = reportMessage(
      session({ analysis, mode: "report", side: "white" }),
      t
    );
    expect(JSON.stringify(flipped)).toContain("Alice");
    expect(JSON.stringify(flipped)).toContain("report.side.white");
  });

  it("marks public reports differently from ephemeral responses", () => {
    expect(
      reportMessage(session({ analysis, mode: "report" }), t, false).flags
    ).toBe(PUBLIC_FLAGS);
  });

  it("clamps the accuracy to the reported side's display range", () => {
    const unbounded = {
      ...analysis,
      accuracies: { white: -42, black: 173 },
    };
    const white = JSON.stringify(
      reportMessage(session({ analysis: unbounded, side: "white" }), t)
    );
    const black = JSON.stringify(
      reportMessage(session({ analysis: unbounded, side: "black" }), t)
    );

    expect(white).toContain("0.0");
    expect(white).not.toContain("100.0");
    expect(white).not.toContain("-42");
    expect(black).toContain("100.0");
    expect(black).not.toContain("-42");
  });
});
