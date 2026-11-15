import { ChannelType } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  channel: vi.fn(),
  hubs: vi.fn(),
  saveHub: vi.fn(),
  removeHub: vi.fn(),
}));
const permissions = vi.hoisted(() => ({ missingBotPermissionNames: vi.fn() }));

vi.mock("#lib/database.js", () => ({ default: {} }));
vi.mock("./store.service.js", () => ({ default: store }));
vi.mock("#lib/permissions.js", () => permissions);

const { default: hubRecords } = await import("./hubs.service.js");

const context = { t: (key: string) => key, userId: "admin" };

function guildWith(type = ChannelType.GuildVoice) {
  const channel = { id: "hub", type, parent: null };
  return {
    id: "g1",
    channels: { cache: new Map([["hub", channel]]), fetch: vi.fn() },
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  store.channel.mockResolvedValue(null);
  permissions.missingBotPermissionNames.mockResolvedValue(null);
});

describe("save", () => {
  it("saves a valid hub", async () => {
    const outcome = await hubRecords.save(
      guildWith(),
      { channelId: "hub", values: { name: " Salon de {user} ", limit: "5" } },
      context
    );
    expect(outcome.ok).toBe(true);
    expect(store.saveHub).toHaveBeenCalledWith("g1", {
      channelId: "hub",
      nameTemplate: "Salon de {user}",
      userLimit: 5,
    });
  });

  it.each([
    [{ name: "x", limit: "100" }, "hub.invalidLimit"],
    [{ name: "x", limit: "abc" }, "hub.invalidLimit"],
    [{ name: "x".repeat(101), limit: "0" }, "hub.invalidName"],
  ])("rejects %o", async (values, message) => {
    expect(
      await hubRecords.save(guildWith(), { channelId: "hub", values }, context)
    ).toEqual({
      ok: false,
      message,
    });
    expect(store.saveHub).not.toHaveBeenCalled();
  });

  it("rejects a text channel, a temporary channel and missing permissions", async () => {
    const values = { name: "x", limit: "0" };
    expect(
      (
        await hubRecords.save(
          guildWith(ChannelType.GuildText),
          { channelId: "hub", values },
          context
        )
      ).message
    ).toBe("hub.unknownChannel");

    store.channel.mockResolvedValueOnce({ channelId: "hub" });
    expect(
      (
        await hubRecords.save(
          guildWith(),
          { channelId: "hub", values },
          context
        )
      ).message
    ).toBe("hub.isTemporary");

    permissions.missingBotPermissionNames.mockResolvedValueOnce(
      "permission.MoveMembers"
    );
    expect(
      (
        await hubRecords.save(
          guildWith(),
          { channelId: "hub", values },
          context
        )
      ).message
    ).toBe("hub.missingPermissions");
    expect(store.saveHub).not.toHaveBeenCalled();
  });
});

describe("list", () => {
  it("shows each hub's name template and limit as /config values", async () => {
    store.hubs.mockResolvedValueOnce([
      { channelId: "hub", nameTemplate: "Salon de {user}", userLimit: 0 },
    ]);
    expect(await hubRecords.list("g1")).toEqual([
      { channelId: "hub", values: { name: "Salon de {user}", limit: "0" } },
    ]);
  });
});

describe("save, channel not cached", () => {
  it("fetches it, and refuses one Discord does not know", async () => {
    const guild = guildWith();
    guild.channels.cache.clear();
    guild.channels.fetch.mockRejectedValueOnce(new Error("Unknown Channel"));
    expect(
      await hubRecords.save(
        guild,
        { channelId: "hub", values: { name: "x", limit: "0" } },
        context
      )
    ).toEqual({ ok: false, message: "hub.unknownChannel" });

    guild.channels.fetch.mockResolvedValueOnce({
      id: "hub",
      type: ChannelType.GuildVoice,
      parent: null,
    });
    expect(
      (
        await hubRecords.save(
          guild,
          { channelId: "hub", values: { name: "x", limit: "0" } },
          context
        )
      ).ok
    ).toBe(true);
  });
});

describe("remove", () => {
  it("removes a hub, or says there was none", async () => {
    store.removeHub.mockResolvedValueOnce(true);
    expect(await hubRecords.remove(guildWith(), "hub", context)).toEqual({
      ok: true,
      message: "hub.removed",
    });
    expect(store.removeHub).toHaveBeenCalledWith("g1", "hub");

    store.removeHub.mockResolvedValueOnce(false);
    expect(await hubRecords.remove(guildWith(), "hub", context)).toEqual({
      ok: false,
      message: "hub.none",
    });
  });
});
