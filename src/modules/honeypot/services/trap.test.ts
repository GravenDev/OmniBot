import { DiscordAPIError, RESTJSONErrorCodes, type Message } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_BAN_PURGE_SECONDS } from "#lib/moderation.js";
import { initTestI18n, makeTestConfig, silenceLogs } from "#lib/testing.js";
import { honeypotConfigSchema } from "#modules/honeypot/honeypot.config.js";
import en from "#modules/honeypot/i18n/en.json" with { type: "json" };

const log = vi.hoisted(() => ({ logTrap: vi.fn() }));
vi.mock("./log.js", () => log);

const { springTrap, purgeSecondsOf } = await import("./trap.js");

silenceLogs();

beforeAll(async () => {
  await initTestI18n("honeypot", { en });
});

let nextUser = 0;

function config(values: Record<string, unknown> = {}) {
  return makeTestConfig("honeypot", honeypotConfigSchema, {
    trapChannels: [{ id: "trap" }],
    ...values,
  } as never);
}

interface MemberOptions {
  manageMessages?: boolean;
  roleIds?: string[];
  bannable?: boolean;
  owner?: boolean;
}

function apiError(code: number, status: number) {
  return new DiscordAPIError(
    { code, message: "error" },
    code,
    status,
    "GET",
    "/members",
    {}
  );
}

function fakeMessage(
  options: {
    channelId?: string;
    threadOf?: string;
    bot?: boolean;
    webhookId?: string | null;
    member?: MemberOptions | "left" | Error;
    banError?: Error;
    unbanError?: Error;
    deleteError?: Error;
    alreadyBanned?: boolean;
  } = {}
) {
  const userId = `user-${++nextUser}`;
  const memberOptions =
    typeof options.member === "object" && !(options.member instanceof Error)
      ? options.member
      : {};
  const guild: any = {
    id: "g1",
    ownerId: "owner",
    bans: {
      create: vi.fn(async () => {
        if (options.banError) throw options.banError;
      }),
      remove: vi.fn(async () => {
        if (options.unbanError) throw options.unbanError;
      }),
      fetch: vi.fn(async () => {
        if (!options.alreadyBanned) {
          throw apiError(RESTJSONErrorCodes.UnknownBan, 404);
        }
        return {};
      }),
    },
  };
  const member = {
    id: memberOptions.owner ? "owner" : userId,
    guild,
    bannable: memberOptions.bannable ?? true,
    roles: {
      cache: {
        some: (fn: (role: { id: string }) => boolean) =>
          (memberOptions.roleIds ?? []).some((id) => fn({ id })),
      },
    },
  };
  guild.members = {
    fetch: vi.fn(async () => {
      if (options.member === "left") {
        throw apiError(RESTJSONErrorCodes.UnknownMember, 404);
      }
      if (options.member instanceof Error) {
        throw options.member;
      }
      return member;
    }),
  };
  const channel = {
    id: options.channelId ?? "trap",
    name: "piege",
    parentId: options.threadOf ?? null,
    isThread: () => options.threadOf !== undefined,
    parent: options.threadOf ? { name: "trap-parent" } : null,
    permissionsFor: () => ({
      has: () => memberOptions.manageMessages ?? false,
    }),
  };
  return {
    id: "m1",
    guild,
    guildId: "g1",
    channelId: channel.id,
    channel,
    author: { id: userId, bot: options.bot ?? false },
    webhookId: options.webhookId ?? null,
    system: false,
    inGuild: () => true,
    delete: vi.fn(async () => {
      if (options.deleteError) throw options.deleteError;
    }),
  };
}

async function run(
  message: ReturnType<typeof fakeMessage>,
  values: Record<string, unknown> = {}
) {
  await springTrap(message as unknown as Message, config(values));
}

function expectLogged(
  message: ReturnType<typeof fakeMessage>,
  outcome: string,
  messageKept = false
) {
  expect(log.logTrap).toHaveBeenCalledWith(
    message,
    expect.anything(),
    { outcome, messageKept },
    3600
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("springTrap", () => {
  it("softbans and logs a member posting in a trap channel", async () => {
    const message = fakeMessage();
    await run(message);
    expect(message.guild.bans.create).toHaveBeenCalledWith(message.author.id, {
      reason: "Honeypot: message in #piege",
      deleteMessageSeconds: 3600,
    });
    expect(message.guild.bans.remove).toHaveBeenCalledWith(
      message.author.id,
      "Honeypot: message in #piege"
    );
    expectLogged(message, "softbanned");
  });

  it("ignores other channels", async () => {
    const message = fakeMessage({ channelId: "general" });
    await run(message);
    expect(message.guild.bans.create).not.toHaveBeenCalled();
    expect(log.logTrap).not.toHaveBeenCalled();
  });

  it("catches a post in a thread of a trap channel", async () => {
    const message = fakeMessage({ channelId: "thread", threadOf: "trap" });
    await run(message);
    expect(message.guild.bans.create).toHaveBeenCalledWith(message.author.id, {
      reason: "Honeypot: message in #trap-parent",
      deleteMessageSeconds: 3600,
    });
    expectLogged(message, "softbanned");
  });

  it("ignores threads of other channels", async () => {
    const message = fakeMessage({ channelId: "thread", threadOf: "general" });
    await run(message);
    expect(message.guild.bans.create).not.toHaveBeenCalled();
  });

  it("does nothing while no trap channel is set", async () => {
    const message = fakeMessage();
    await run(message, { trapChannels: undefined });
    expect(message.guild.bans.create).not.toHaveBeenCalled();
  });

  it.each([
    ["bots", { bot: true }],
    ["webhooks", { webhookId: "hook" }],
    ["moderators of the channel", { member: { manageMessages: true } }],
    ["the owner", { member: { owner: true } }],
  ])("spares %s", async (_label, options) => {
    const message = fakeMessage(options);
    await run(message);
    expect(message.guild.bans.create).not.toHaveBeenCalled();
    expect(log.logTrap).not.toHaveBeenCalled();
  });

  it("spares members with an exempt role", async () => {
    const message = fakeMessage({ member: { roleIds: ["vip"] } });
    await run(message, { exemptRoles: [{ id: "vip" }] });
    expect(message.guild.bans.create).not.toHaveBeenCalled();
  });

  it("still softbans an author who already left", async () => {
    const message = fakeMessage({ member: "left" });
    await run(message);
    expectLogged(message, "softbanned");
  });

  it("leaves alone an author who left and is already banned", async () => {
    const message = fakeMessage({ member: "left", alreadyBanned: true });
    await run(message);
    expect(message.guild.bans.create).not.toHaveBeenCalled();
    expect(message.guild.bans.remove).not.toHaveBeenCalled();
    expect(log.logTrap).not.toHaveBeenCalled();
  });

  it("retries on the next message when the member cannot be fetched", async () => {
    const failing = fakeMessage({ member: apiError(0, 503) });
    await expect(run(failing)).rejects.toBeInstanceOf(DiscordAPIError);
    expect(failing.guild.bans.create).not.toHaveBeenCalled();

    const next = { ...fakeMessage(), author: failing.author };
    await run(next);
    expect(next.guild.bans.create).toHaveBeenCalled();
  });

  it("only deletes the message of a member the bot cannot ban", async () => {
    const message = fakeMessage({ member: { bannable: false } });
    await run(message);
    expect(message.guild.bans.create).not.toHaveBeenCalled();
    expect(message.delete).toHaveBeenCalled();
    expectLogged(message, "notBannable");
  });

  it("says when the trap message could not be deleted", async () => {
    const message = fakeMessage({
      member: { bannable: false },
      deleteError: new Error("Missing Permissions"),
    });
    await run(message);
    expectLogged(message, "notBannable", true);
  });

  it("keeps deleting the burst of a member the bot cannot ban", async () => {
    const first = fakeMessage({ member: { bannable: false } });
    const second = { ...fakeMessage(), author: first.author };
    await run(first);
    await run(second);
    expect(second.delete).toHaveBeenCalled();
    expect(log.logTrap).toHaveBeenCalledTimes(1);
  });

  it("does not delete the burst again after a softban", async () => {
    const first = fakeMessage();
    const second = { ...fakeMessage(), author: first.author };
    await run(first);
    await run(second);
    expect(second.delete).not.toHaveBeenCalled();
    expect(second.guild.bans.create).not.toHaveBeenCalled();
  });

  it("reports a failed ban", async () => {
    const message = fakeMessage({ banError: new Error("Missing Permissions") });
    await run(message);
    expect(message.guild.bans.remove).not.toHaveBeenCalled();
    expect(message.delete).toHaveBeenCalled();
    expectLogged(message, "failed");
  });

  it("reports a member left banned", async () => {
    const message = fakeMessage({ unbanError: new Error("boom") });
    await run(message);
    expectLogged(message, "stillBanned");
  });

  it("sanctions a burst of messages only once", async () => {
    const first = fakeMessage();
    const second = { ...fakeMessage(), author: first.author };
    await Promise.all([run(first), run(second)]);
    expect(
      first.guild.bans.create.mock.calls.length +
        second.guild.bans.create.mock.calls.length
    ).toBe(1);
    expect(log.logTrap).toHaveBeenCalledTimes(1);
  });
});

describe("purgeSecondsOf", () => {
  it("caps the window at Discord's 7 days", () => {
    expect(purgeSecondsOf(config({ purgeWindow: 30 * 24 * 60 * 60 }))).toBe(
      MAX_BAN_PURGE_SECONDS
    );
  });

  it("keeps a shorter window", () => {
    expect(purgeSecondsOf(config({ purgeWindow: 120 }))).toBe(120);
  });
});
