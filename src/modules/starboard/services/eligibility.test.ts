import type { GuildTextBasedChannel, Message } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestConfig } from "#lib/testing.js";
import { starboardConfigSchema } from "#modules/starboard/starboard.config.js";

const audience = vi.hoisted(() => ({ widens: vi.fn(() => false) }));

vi.mock("#lib/channel-audience.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#lib/channel-audience.js")>()),
  widensAudience: audience.widens,
}));

const { ineligibility, starboardChannelOf, thresholdOf } =
  await import("./eligibility.js");

type Values = Parameters<
  typeof makeTestConfig<typeof starboardConfigSchema>
>[2];

function config(values: Values = {}) {
  return makeTestConfig("starboard", starboardConfigSchema, values);
}

function fakeStarboard(overrides: Record<string, unknown> = {}) {
  return {
    id: "board",
    nsfw: false,
    isThread: () => false,
    guild: { members: { me: { id: "me" } } },
    permissionsFor: () => ({ has: () => true }),
    ...overrides,
  } as unknown as GuildTextBasedChannel;
}

function fakeMessage(overrides: Record<string, unknown> = {}) {
  const { channel, author, ...rest } = overrides;
  return {
    system: false,
    webhookId: null,
    client: { user: { id: "me" } },
    author: { id: "author", bot: false, ...(author as object) },
    channel: {
      id: "general",
      parentId: "category",
      nsfw: false,
      isThread: () => false,
      ...(channel as object),
    },
    ...rest,
  } as unknown as Message<true>;
}

beforeEach(() => {
  audience.widens.mockReturnValue(false);
});

describe("ineligibility", () => {
  it("accepts a regular member message", () => {
    expect(ineligibility(fakeMessage(), fakeStarboard(), config())).toBeNull();
  });

  it("refuses messages of the starboard itself and of its threads", () => {
    const board = fakeStarboard();
    expect(
      ineligibility(fakeMessage({ channel: { id: "board" } }), board, config())
    ).toBe("starboard");
    expect(
      ineligibility(
        fakeMessage({
          channel: { id: "thread", parentId: "board", isThread: () => true },
        }),
        board,
        config()
      )
    ).toBe("starboard");
  });

  it("refuses system messages", () => {
    expect(
      ineligibility(fakeMessage({ system: true }), fakeStarboard(), config())
    ).toBe("system");
  });

  it("never reposts the bot's own messages, such as old reposts", () => {
    const own = fakeMessage({ author: { id: "me", bot: true } });

    expect(
      ineligibility(own, fakeStarboard(), config({ ignoreBots: false }))
    ).toBe("bot");
  });

  it("refuses bots and webhooks unless configured otherwise", () => {
    const bot = fakeMessage({ author: { bot: true } });
    const webhook = fakeMessage({ webhookId: "hook" });

    expect(ineligibility(bot, fakeStarboard(), config())).toBe("bot");
    expect(ineligibility(webhook, fakeStarboard(), config())).toBe("bot");
    expect(
      ineligibility(bot, fakeStarboard(), config({ ignoreBots: false }))
    ).toBeNull();
  });

  it("only watches the listed channels and their threads", () => {
    const watched = config({
      allowedChannels: [{ id: "memes" }] as never,
    });

    expect(ineligibility(fakeMessage(), fakeStarboard(), watched)).toBe(
      "channel"
    );
    expect(
      ineligibility(
        fakeMessage({
          channel: { id: "thread", parentId: "memes", isThread: () => true },
        }),
        fakeStarboard(),
        watched
      )
    ).toBeNull();
  });

  it("skips excluded channels and categories", () => {
    expect(
      ineligibility(
        fakeMessage(),
        fakeStarboard(),
        config({ excludedCategories: [{ id: "category" }] as never })
      )
    ).toBe("channel");
  });

  it("does not move a NSFW message to a safe starboard", () => {
    const message = fakeMessage({ channel: { nsfw: true } });

    expect(ineligibility(message, fakeStarboard(), config())).toBe("nsfw");
    expect(
      ineligibility(message, fakeStarboard({ nsfw: true }), config())
    ).toBeNull();
  });

  it("does not show a message to people who cannot read its channel", () => {
    audience.widens.mockReturnValue(true);

    expect(ineligibility(fakeMessage(), fakeStarboard(), config())).toBe(
      "audience"
    );
  });

  it("needs to be able to post in the starboard", () => {
    const board = fakeStarboard({
      permissionsFor: () => ({ has: () => false }),
    });

    expect(ineligibility(fakeMessage(), board, config())).toBe("permissions");
  });
});

describe("starboardChannelOf", () => {
  it("returns nothing until a sendable guild channel is set", () => {
    expect(starboardChannelOf(config())).toBeNull();
    const board = { isSendable: () => true, isDMBased: () => false };
    expect(starboardChannelOf(config({ channel: board as never }))).toBe(board);
  });
});

describe("thresholdOf", () => {
  it("never goes below one", () => {
    expect(thresholdOf(config())).toBe(3);
    expect(thresholdOf(config({ threshold: 0 }))).toBe(1);
    expect(thresholdOf(config({ threshold: -4 }))).toBe(1);
  });
});
