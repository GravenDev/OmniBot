import { DiscordAPIError, RESTJSONErrorCodes, type Guild } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initTestI18n, makeTestConfig, silenceLogs } from "#lib/testing.js";
import { honeypotConfigSchema } from "#modules/honeypot/honeypot.config.js";
import en from "#modules/honeypot/i18n/en.json" with { type: "json" };

interface Row {
  guildId: string;
  count: number;
  lastAt: Date | null;
  channelId: string | null;
  messageId: string | null;
}

const db = vi.hoisted(() => {
  const state = { row: null as Row | null, fail: false, failUpdate: false };
  const prisma = {
    honeypotCounter: {
      upsert: async ({
        create,
        update,
      }: {
        create: { guildId: string; count: number; lastAt: Date };
        update: { count: { increment: number }; lastAt: Date };
      }) => {
        if (state.fail) throw new Error("database");
        state.row = state.row
          ? {
              ...state.row,
              count: state.row.count + update.count.increment,
              lastAt: update.lastAt,
            }
          : {
              guildId: create.guildId,
              count: create.count,
              lastAt: create.lastAt,
              channelId: null,
              messageId: null,
            };
        return { ...state.row };
      },
      update: async ({ data }: { data: Partial<Row> }) => {
        if (state.failUpdate) throw new Error("database");
        Object.assign(state.row!, data);
      },
    },
  };
  return { state, prisma };
});
vi.mock("#lib/database.js", () => ({ default: db.prisma }));

const { counterEmbed, recordCatch } = await import("./counter.js");

silenceLogs();

beforeAll(async () => {
  await initTestI18n("honeypot", { en });
});

beforeEach(() => {
  db.state.row = null;
  db.state.fail = false;
  db.state.failUpdate = false;
});

function unknownMessage() {
  return new DiscordAPIError(
    { code: RESTJSONErrorCodes.UnknownMessage, message: "Unknown Message" },
    RESTJSONErrorCodes.UnknownMessage,
    404,
    "PATCH",
    "/messages",
    {}
  );
}

let nextMessage = 0;

function fakeChannel(id: string, options: { allowed?: boolean } = {}) {
  return {
    id,
    isSendable: () => true,
    isDMBased: () => false,
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => options.allowed ?? true }),
    send: vi.fn(async (_payload: any) => ({ id: `m${++nextMessage}` })),
    messages: {
      edit: vi.fn(async (_id: string, _payload: any) => ({})),
      delete: vi.fn(async (_id: string) => undefined),
    },
  };
}

function fakeGuild(...channels: ReturnType<typeof fakeChannel>[]) {
  return {
    id: "g1",
    members: { me: { id: "bot" } },
    channels: {
      cache: new Map(channels.map((channel) => [channel.id, channel])),
    },
  } as unknown as Guild;
}

function config(counterChannel?: ReturnType<typeof fakeChannel>) {
  return makeTestConfig("honeypot", honeypotConfigSchema, {
    counterChannel,
  } as never);
}

const t = makeTestConfig("honeypot", honeypotConfigSchema).t;

describe("counterEmbed", () => {
  it("counts the bees, singular then plural", () => {
    const lastAt = new Date("2026-10-31T12:00:00Z");
    expect(counterEmbed(t, 1, lastAt).data.description).toBe(
      "🐝 **1** little bee fell into the trap.\n" +
        "Latest sweet tooth: <t:1793448000:R>"
    );
    expect(counterEmbed(t, 42, lastAt).data.description).toContain(
      "**42** little bees fell into the trap."
    );
  });
});

describe("recordCatch", () => {
  it("posts the counter on the first catch, then edits it", async () => {
    const channel = fakeChannel("counter");
    const guild = fakeGuild(channel);

    await recordCatch(guild, config(channel));
    expect(channel.send).toHaveBeenCalledOnce();
    expect(channel.send.mock.calls[0]![0].embeds[0].data.description).toContain(
      "**1** little bee"
    );
    const messageId = db.state.row!.messageId;
    expect(db.state.row).toMatchObject({ count: 1, channelId: "counter" });

    await recordCatch(guild, config(channel));
    expect(channel.send).toHaveBeenCalledOnce();
    expect(channel.messages.edit).toHaveBeenCalledWith(messageId, {
      embeds: [expect.anything()],
    });
    expect(
      channel.messages.edit.mock.calls[0]![1].embeds[0].data.description
    ).toContain("**2** little bees");
  });

  it("posts a new counter when the previous one was deleted", async () => {
    const channel = fakeChannel("counter");
    const guild = fakeGuild(channel);
    await recordCatch(guild, config(channel));
    channel.messages.edit.mockRejectedValueOnce(unknownMessage());

    await recordCatch(guild, config(channel));
    expect(channel.send).toHaveBeenCalledTimes(2);
    expect(db.state.row!.messageId).toBe(
      (await channel.send.mock.results[1]!.value).id
    );
  });

  it("moves the counter when the channel changes", async () => {
    const before = fakeChannel("before");
    const after = fakeChannel("after");
    const guild = fakeGuild(before, after);
    await recordCatch(guild, config(before));
    const oldId = db.state.row!.messageId;

    await recordCatch(guild, config(after));
    expect(after.send).toHaveBeenCalledOnce();
    expect(before.messages.delete).toHaveBeenCalledWith(oldId);
    expect(db.state.row).toMatchObject({ count: 2, channelId: "after" });
  });

  it("updates once for a burst of catches", async () => {
    const channel = fakeChannel("counter");
    const guild = fakeGuild(channel);
    await recordCatch(guild, config(channel));

    await Promise.all([
      recordCatch(guild, config(channel)),
      recordCatch(guild, config(channel)),
      recordCatch(guild, config(channel)),
    ]);
    expect(db.state.row!.count).toBe(4);
    expect(channel.messages.edit.mock.calls.length).toBeLessThan(3);
    expect(
      channel.messages.edit.mock.calls.at(-1)![1].embeds[0].data.description
    ).toContain("**4** little bees");
  });

  it("deletes a new counter it could not save", async () => {
    const channel = fakeChannel("counter");
    db.state.failUpdate = true;

    await recordCatch(fakeGuild(channel), config(channel));
    const sentId = (await channel.send.mock.results[0]!.value).id;
    expect(channel.messages.delete).toHaveBeenCalledWith(sentId);
    expect(db.state.row!.messageId).toBeNull();
  });

  it("removes the counter when its channel is unset", async () => {
    const channel = fakeChannel("counter");
    const guild = fakeGuild(channel);
    await recordCatch(guild, config(channel));
    const messageId = db.state.row!.messageId;

    await recordCatch(guild, config());
    expect(channel.messages.delete).toHaveBeenCalledWith(messageId);
    expect(db.state.row).toMatchObject({
      count: 2,
      channelId: null,
      messageId: null,
    });
  });

  it("keeps counting while no counter channel is set", async () => {
    await recordCatch(fakeGuild(), config());
    await recordCatch(fakeGuild(), config());
    expect(db.state.row).toMatchObject({ count: 2, messageId: null });
  });

  it("posts nothing without the permissions it needs", async () => {
    const channel = fakeChannel("counter", { allowed: false });
    await recordCatch(fakeGuild(channel), config(channel));
    expect(channel.send).not.toHaveBeenCalled();
    expect(db.state.row!.count).toBe(1);
  });

  it("never throws", async () => {
    db.state.fail = true;
    const channel = fakeChannel("counter");
    await expect(
      recordCatch(fakeGuild(channel), config(channel))
    ).resolves.toBeUndefined();
    expect(channel.send).not.toHaveBeenCalled();
  });
});
