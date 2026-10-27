import { ChannelType } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  channel: vi.fn(),
  saveHub: vi.fn(),
  removeHub: vi.fn(),
}));
const permissions = vi.hoisted(() => ({ missingBotPermissions: vi.fn() }));

vi.mock("#lib/database.js", () => ({ default: {} }));
vi.mock("./store.js", () => ({ default: store }));
vi.mock("#lib/permissions.js", () => permissions);

const { saveHub } = await import("./hubs.js");

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
  permissions.missingBotPermissions.mockResolvedValue([]);
});

describe("saveHub", () => {
  it("saves a valid hub", async () => {
    const outcome = await saveHub(
      guildWith(),
      "hub",
      { name: " Salon de {user} ", limit: "5" },
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
    expect(await saveHub(guildWith(), "hub", values, context)).toEqual({
      ok: false,
      message,
    });
    expect(store.saveHub).not.toHaveBeenCalled();
  });

  it("rejects a text channel, a temporary channel and missing permissions", async () => {
    const values = { name: "x", limit: "0" };
    expect(
      (await saveHub(guildWith(ChannelType.GuildText), "hub", values, context))
        .message
    ).toBe("hub.unknownChannel");

    store.channel.mockResolvedValueOnce({ channelId: "hub" });
    expect((await saveHub(guildWith(), "hub", values, context)).message).toBe(
      "hub.isTemporary"
    );

    permissions.missingBotPermissions.mockResolvedValueOnce(["MoveMembers"]);
    expect((await saveHub(guildWith(), "hub", values, context)).message).toBe(
      "hub.missingPermissions"
    );
    expect(store.saveHub).not.toHaveBeenCalled();
  });
});
