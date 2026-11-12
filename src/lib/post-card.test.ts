import { AttachmentBuilder, DiscordAPIError, MessageFlags } from "discord.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loggerMaker } from "./logger.js";
import { celebrationMessage, postCard } from "./post-card.js";
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

  it("leaves the text when Discord refuses the card without a code", async () => {
    // @discordjs/rest takes the code from a JSON body's `error` when it has no
    // `code`: still Discord refusing, not a bug to rethrow.
    const codeless = new DiscordAPIError(
      { message: "refused" } as never,
      undefined as never,
      400,
      "POST",
      "/channels/chan/messages",
      {}
    );
    const post = vi.fn().mockRejectedValue(codeless);
    expect(
      await postCard(logger, "the card", () => Promise.resolve("png"), post)
    ).toBe(false);
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

describe("celebrationMessage", () => {
  const card = new AttachmentBuilder(Buffer.from("x"), {
    name: "seniority.webp",
    description: "Ancienneté du jour : Nora",
  });

  it("puts the heading above the card, full width, then the lines", () => {
    const message = celebrationMessage({
      heading: "🎉 **Ancienneté**",
      card,
      text: "**5 ans** · <@1>",
    });
    expect(message.flags).toBe(MessageFlags.IsComponentsV2);
    expect(message.files).toEqual([card]);
    expect(message.components.map((c) => c.toJSON())).toEqual([
      { type: 10, content: "🎉 **Ancienneté**" },
      {
        type: 12,
        items: [
          {
            media: { url: "attachment://seniority.webp" },
            description: "Ancienneté du jour : Nora",
          },
        ],
      },
      { type: 10, content: "**5 ans** · <@1>" },
    ]);
  });

  it("can mention without a push notification", () => {
    const message = celebrationMessage({ text: "<@1>", silent: true });
    expect(message.flags).toBe(
      MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications
    );
    expect(message).not.toHaveProperty("files");
    expect(message.components.map((c) => c.toJSON())).toEqual([
      { type: 10, content: "<@1>" },
    ]);
  });
});

describe("celebrationMessage, card name", () => {
  it("refuses a card without a name, which no gallery could show", () => {
    expect(() =>
      celebrationMessage({ card: new AttachmentBuilder(Buffer.from("x")) })
    ).toThrow("name");
  });
});
