import type { ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";

vi.mock("#lib/database.js", () => ({ default: {} }));

const { describeLines, parseEmoji } = await import("./autoreact.command.js");

const hype = { id: "111111111111111111", name: "hype", animated: false };

function fakeInteraction(
  guildEmojis: (typeof hype)[],
  clientEmojiIds: string[] = []
) {
  return {
    guild: {
      emojis: {
        fetch: async () => new Map(guildEmojis.map((e) => [e.id, e])),
      },
    },
    client: {
      emojis: {
        resolve: (id: string) => (clientEmojiIds.includes(id) ? {} : null),
      },
    },
  } as unknown as ChatInputCommandInteraction<"cached">;
}

describe("parseEmoji", () => {
  it("accepts a Unicode emoji", async () => {
    expect(await parseEmoji(fakeInteraction([]), " 👍 ")).toBe("👍");
  });

  it("resolves a fetched guild emoji by name", async () => {
    expect(await parseEmoji(fakeInteraction([hype]), "hype")).toBe(
      `<:hype:${hype.id}>`
    );
  });

  it("accepts a guild emoji missing from the client cache", async () => {
    expect(
      await parseEmoji(fakeInteraction([hype]), `<:hype:${hype.id}>`)
    ).toBe(`<:hype:${hype.id}>`);
  });

  it("accepts an emoji from another server the bot is in", async () => {
    const id = "222222222222222222";
    expect(await parseEmoji(fakeInteraction([], [id]), `<:other:${id}>`)).toBe(
      `<:other:${id}>`
    );
  });

  it("rejects a custom emoji the bot cannot use", async () => {
    expect(
      await parseEmoji(fakeInteraction([]), "<:other:333333333333333333>")
    ).toBeNull();
  });

  it("rejects text that is not an emoji", async () => {
    expect(await parseEmoji(fakeInteraction([]), "hello world")).toBeNull();
  });
});

describe("describeLines", () => {
  const more = (count: number) => `+${count}`;

  it("joins the lines when they fit", () => {
    expect(describeLines(["a", "b"], more)).toBe("a\nb");
  });

  it("stops on a whole line and counts the hidden ones", () => {
    const lines = Array.from({ length: 100 }, () => "x".repeat(99));
    const description = describeLines(lines, more);
    expect(description.length).toBeLessThanOrEqual(4096);
    const shown = description.split("\n");
    const footer = shown.pop()!;
    expect(shown.every((line) => line === "x".repeat(99))).toBe(true);
    expect(footer).toBe(`+${100 - shown.length}`);
  });

  it("counts a single hidden line", () => {
    const lines = Array.from({ length: 41 }, () => "x".repeat(99));
    expect(describeLines(lines, more).split("\n").at(-1)).toBe("+1");
  });
});
