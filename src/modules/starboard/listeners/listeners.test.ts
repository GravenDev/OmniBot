import { Collection } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestConfig } from "#lib/testing.js";
import { starboardConfigSchema } from "#modules/starboard/starboard.config.js";

vi.mock("#lib/database.js", () => ({ default: {}, Prisma: {} }));

const mocks = vi.hoisted(() => ({
  starboard: {
    refresh: vi.fn(),
    refreshIfStarred: vi.fn(),
    handleDeletions: vi.fn(),
    handleChannelDeletion: vi.fn(),
  },
}));

vi.mock(
  "#modules/starboard/services/starboard.service.js",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("#modules/starboard/services/starboard.service.js")
    >()),
    default: mocks.starboard,
  })
);

const { default: reactionAdd } = await import("./reaction-add.listener.js");
const {
  reactionRemoveListener,
  reactionRemoveEmojiListener,
  reactionRemoveAllListener,
} = await import("./reaction-remove.listener.js");
const { messageDeleteBulkListener } =
  await import("./message-changes.listener.js");
const { channelDeleteListener, threadDeleteListener } =
  await import("./channel-delete.listener.js");

const config = makeTestConfig("starboard", starboardConfigSchema);
const message = { id: "m1" };

function reaction(name: string) {
  return { emoji: { id: null, name }, message } as never;
}

const member = { bot: false } as never;
const bot = { bot: true } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("messageReactionAdd", () => {
  it("refreshes the message for a counted emoji", async () => {
    await reactionAdd.execute(reaction("⭐"), member, {} as never, config);

    expect(mocks.starboard.refresh).toHaveBeenCalledWith(message, config);
  });

  it("ignores other emojis, bots and guilds without the module", async () => {
    await reactionAdd.execute(reaction("👍"), member, {} as never, config);
    await reactionAdd.execute(reaction("⭐"), bot, {} as never, config);
    await reactionAdd.execute(reaction("⭐"), member, {} as never, undefined);

    expect(mocks.starboard.refresh).not.toHaveBeenCalled();
  });
});

describe("reaction removals", () => {
  it("only refresh messages already on the starboard", async () => {
    await reactionRemoveListener.execute(
      reaction("⭐"),
      member,
      {} as never,
      config
    );
    await reactionRemoveEmojiListener.execute(reaction("⭐"), config);
    await reactionRemoveAllListener.execute(
      message as never,
      new Collection(),
      config
    );

    expect(mocks.starboard.refreshIfStarred).toHaveBeenCalledTimes(3);
    expect(mocks.starboard.refresh).not.toHaveBeenCalled();
  });

  it("ignore emojis that are not counted", async () => {
    await reactionRemoveListener.execute(
      reaction("👍"),
      member,
      {} as never,
      config
    );
    await reactionRemoveEmojiListener.execute(reaction("👍"), config);

    expect(mocks.starboard.refreshIfStarred).not.toHaveBeenCalled();
  });
});

describe("messageDeleteBulk", () => {
  it("hands every deleted message to the service at once", async () => {
    const channel = { client: {} };

    await messageDeleteBulkListener.execute(
      new Collection([
        ["a", {}],
        ["b", {}],
      ]) as never,
      channel as never,
      config
    );

    expect(mocks.starboard.handleDeletions).toHaveBeenCalledWith(
      ["a", "b"],
      channel.client
    );
  });
});

describe("channel and thread deletion", () => {
  it("hands the deleted channel to the service", async () => {
    const client = {};
    await channelDeleteListener.execute(
      { id: "c1", guildId: "g1", client, isDMBased: () => false } as never,
      config as never
    );
    await threadDeleteListener.execute(
      { id: "t1", guildId: "g1", client } as never,
      config as never
    );

    expect(mocks.starboard.handleChannelDeletion).toHaveBeenCalledWith(
      "g1",
      "c1",
      client
    );
    expect(mocks.starboard.handleChannelDeletion).toHaveBeenCalledWith(
      "g1",
      "t1",
      client
    );
  });
});
