import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestConfig, silenceLogs } from "#lib/testing.js";
import { reportsConfigSchema } from "../reports.config.js";

vi.mock("#lib/database.js", () => ({ default: {}, Prisma: {} }));

const report = vi.hoisted(() => vi.fn(async () => "created"));
vi.mock("../services/report.service.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/report.service.js")>();
  return { ...actual, default: { report } };
});

const { default: listener } = await import("./reaction-add.listener.js");

beforeAll(() => silenceLogs());

const order: string[] = [];

function fakeMessage(overrides: Record<string, any> = {}) {
  return {
    id: "m1",
    guildId: "g1",
    channelId: "c1",
    partial: false,
    author: { id: "author", bot: false },
    system: false,
    content: "insult",
    createdAt: new Date(),
    attachments: new Map(),
    stickers: new Map(),
    client: {},
    channel: { isThread: () => false },
    inGuild: () => true,
    ...overrides,
  };
}

function fakeReaction(
  options: { emoji?: string; removeFails?: boolean; message?: any } = {}
) {
  const message = options.message ?? fakeMessage();
  return {
    emoji: { id: null, name: options.emoji ?? "🚩" },
    message,
    users: {
      remove: vi.fn(async () => {
        order.push("remove");
        if (options.removeFails) throw new Error("Missing Permissions");
      }),
    },
  } as any;
}

const user = { id: "reporter", bot: false } as any;

function config(values: Record<string, unknown> = {}) {
  return makeTestConfig("reports", reportsConfigSchema, {
    alertChannel: { id: "alerts", isSendable: () => true } as any,
    ...values,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
});

describe("messageReactionAdd", () => {
  it("removes the reaction before reading the message, then reports it", async () => {
    const message = fakeMessage({
      partial: true,
      fetch: vi.fn(async () => {
        order.push("fetch");
        return fakeMessage();
      }),
    });
    const reaction = fakeReaction({ message });

    await listener.execute(reaction, user, {} as any, config());

    expect(order).toEqual(["remove", "fetch"]);
    expect(report).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ messageId: "m1", authorId: "author" }),
      { userId: "reporter", source: "reaction", reason: null },
      false
    );
  });

  it("still reports when the reaction cannot be removed, flagging it", async () => {
    const reaction = fakeReaction({ removeFails: true });

    await listener.execute(reaction, user, {} as any, config());

    expect(report.mock.calls[0]![4]).toBe(true);
  });

  it("leaves other emojis alone", async () => {
    const reaction = fakeReaction({ emoji: "👍" });

    await listener.execute(reaction, user, {} as any, config());

    expect(reaction.users.remove).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("honours a configured custom emoji", async () => {
    const reaction = fakeReaction();
    reaction.emoji = { id: "123456789012345678", name: "flag" };

    await listener.execute(
      reaction,
      user,
      {} as any,
      config({ emoji: "<:flag:123456789012345678>" })
    );

    expect(reaction.users.remove).toHaveBeenCalledWith("reporter");
    expect(report).toHaveBeenCalledOnce();
  });

  it("does not touch reactions while no alert channel is set", async () => {
    const reaction = fakeReaction();

    await listener.execute(
      reaction,
      user,
      {} as any,
      makeTestConfig("reports", reportsConfigSchema, {})
    );

    expect(reaction.users.remove).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("removes but does not report your own message", async () => {
    const reaction = fakeReaction({
      message: fakeMessage({ author: { id: "reporter", bot: false } }),
    });

    await listener.execute(reaction, user, {} as any, config());

    expect(reaction.users.remove).toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("gives up quietly when the message is already gone", async () => {
    const message = fakeMessage({
      partial: true,
      fetch: vi.fn(async () => {
        throw new Error("Unknown Message");
      }),
    });

    await listener.execute(
      fakeReaction({ message }),
      user,
      {} as any,
      config()
    );

    expect(report).not.toHaveBeenCalled();
  });

  it("ignores reactions from bots", async () => {
    const reaction = fakeReaction();

    await listener.execute(
      reaction,
      { id: "b", bot: true } as any,
      {} as any,
      config()
    );

    expect(reaction.users.remove).not.toHaveBeenCalled();
  });
});
