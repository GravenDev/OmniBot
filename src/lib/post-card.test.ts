import { DiscordAPIError } from "discord.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loggerMaker } from "./logger.js";
import { postCard } from "./post-card.js";
import { silenceLogs } from "./testing.js";

const logger = loggerMaker("test");
const refused = new DiscordAPIError(
  { code: 50013, message: "Missing Permissions" },
  50013,
  403,
  "POST",
  "/channels/chan/messages",
  {}
);

beforeAll(silenceLogs);

describe("postCard", () => {
  it("posts the card it drew", async () => {
    const post = vi.fn().mockResolvedValue(undefined);
    expect(
      await postCard(logger, "the card", () => Promise.resolve("png"), post)
    ).toBe(true);
    expect(post).toHaveBeenCalledWith("png");
  });

  it("leaves the text when the card cannot be drawn", async () => {
    const post = vi.fn();
    expect(
      await postCard(
        logger,
        "the card",
        () => Promise.reject(new Error("canvas")),
        post
      )
    ).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it("leaves the text when Discord refuses the card", async () => {
    expect(
      await postCard(
        logger,
        "the card",
        () => Promise.resolve("png"),
        () => Promise.reject(refused)
      )
    ).toBe(false);
  });

  it("throws any other error, which may come after the card was posted", async () => {
    await expect(
      postCard(
        logger,
        "the card",
        () => Promise.resolve("png"),
        () => Promise.reject(new Error("socket closed"))
      )
    ).rejects.toThrow("socket closed");
  });
});
