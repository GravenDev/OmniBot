import { describe, expect, it, vi } from "vitest";
import type { TFunction } from "#lib/i18n.js";
import { PUBLIC_FLAGS } from "../views.js";
import type { LiveGame } from "./types.js";
import { liveMessage } from "./views.js";

const renderBoard = vi.hoisted(() => vi.fn(async () => Buffer.from("image")));
vi.mock("../rendering/board.js", () => ({ renderBoard }));

const t: TFunction = (key, options) =>
  `${key}${options ? ` ${JSON.stringify(options)}` : ""}`;

const game: LiveGame = {
  id: "watch-id",
  source: "lichess",
  gameId: "abcdefgh",
  url: "https://lichess.org/abcdefgh",
  guildId: "guild",
  channelId: "channel",
  messageId: "message",
  ownerId: "owner",
  white: "Alice",
  black: "Bob",
  timeControl: "180+2",
  flipped: true,
  moves: ["e2e4", "e7e5", "g1f3"],
  ply: 3,
  finished: false,
  result: "unknown",
};

describe("live board view", () => {
  it("keeps the followed player at the bottom and scrolls the score sheet", async () => {
    renderBoard.mockClear();
    const message = await liveMessage(game, t, 3, false);
    const json = JSON.stringify(message.components[0]?.toJSON());

    expect(renderBoard).toHaveBeenCalledWith(expect.anything(), 3, true);
    expect(json).toContain('"type":14,"divider":true');
    expect(json).toContain("1. e4 e5");
    expect(json).toContain("2. Nf3 --");
    expect(json).toContain("chess-live:watch-id:next:m:3");
    expect(message.flags).toBe(PUBLIC_FLAGS);

    const link = message.components.at(-1)?.toJSON().components[0];
    expect(link).toMatchObject({
      type: 2,
      style: 5,
      label: "live.site",
      url: "https://lichess.org/abcdefgh",
    });
  });

  it("replays UCI moves from a custom starting FEN", async () => {
    const fen = "4k3/8/8/8/8/4P3/8/4K3 w - - 0 1";
    renderBoard.mockClear();
    await liveMessage(
      { ...game, startFen: fen, moves: ["e3e4"], ply: 1 },
      t,
      1,
      true
    );

    const parsed = renderBoard.mock.calls[0]?.[0];
    expect(parsed.headers.get("FEN")).toBe(fen);
    expect(parsed.steps.map((step: { san: string }) => step.san)).toEqual([
      "e4",
    ]);
  });

  it("uses ephemeral buttons and no live status on a private copy", async () => {
    const message = await liveMessage(game, t, 3, true);
    const json = JSON.stringify(message.components[0]?.toJSON());
    const all = JSON.stringify(message.components.map((part) => part.toJSON()));

    expect(message.components).toHaveLength(2);
    expect(json).toContain("chess-live:watch-id:prev:e:3");
    expect(json).not.toContain(":m:3");
    expect(all).not.toContain("live.started");
    expect(all).toContain("live.site");
  });

  it("puts the status under the board and the result when finished", async () => {
    const live = await liveMessage(game, t, 3, false);
    const liveJson = JSON.stringify(
      live.components.map((part) => part.toJSON())
    );

    expect(live.components).toHaveLength(3);
    expect(liveJson).toContain("live.started");

    const done = await liveMessage(
      { ...game, finished: true, result: "white" },
      t,
      3,
      false
    );
    const doneJson = JSON.stringify(
      done.components.map((part) => part.toJSON())
    );

    expect(doneJson).toContain("## live.finished");
    expect(doneJson).toContain("**🏆 live.result.white**");
    expect(doneJson).toContain('"accent_color":15658734');
    expect(doneJson).not.toContain("chess-live:");

    const draw = await liveMessage(
      { ...game, finished: true, result: "draw" },
      t,
      3,
      false
    );
    const drawJson = JSON.stringify(
      draw.components.map((part) => part.toJSON())
    );

    expect(drawJson).toContain("**🤝 live.result.draw**");
    expect(drawJson).toContain('"accent_color":16753920');
  });

  it("offers to stop the watch on the public message only", async () => {
    const json = (message: Awaited<ReturnType<typeof liveMessage>>) =>
      JSON.stringify(message.components.map((part) => part.toJSON()));

    expect(json(await liveMessage(game, t, 3, false))).toContain(
      "chess-live-stop:watch-id"
    );
    expect(json(await liveMessage(game, t, 3, true))).not.toContain(
      "chess-live-stop"
    );
    expect(
      json(
        await liveMessage(
          { ...game, finished: true, result: "white" },
          t,
          3,
          false
        )
      )
    ).not.toContain("chess-live-stop");
  });

  it("shows a stopped watch without its buttons", async () => {
    const stopped = JSON.stringify(
      (await liveMessage(game, t, 3, false, true)).components.map((part) =>
        part.toJSON()
      )
    );
    expect(stopped).toContain("live.stopped");
    expect(stopped).not.toContain("chess-live:");
    expect(stopped).not.toContain("chess-live-stop");
    expect(stopped).not.toContain("live.started");
  });
});
