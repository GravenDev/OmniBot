import { ChannelType, type Guild, type PermissionsString } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const poster = vi.hoisted(() => ({ set: vi.fn(), unstick: vi.fn() }));
const store = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn() }));

vi.mock("./poster.js", () => ({ default: poster }));
vi.mock("./store.js", () => ({ default: store }));

const { stickyRecords } = await import("./stickies.js");

function fakeGuild(
  granted: PermissionsString[] = ["ViewChannel", "SendMessages"]
) {
  const channel = {
    id: "c1",
    type: ChannelType.GuildText,
    permissionsFor: () => ({
      missing: (required: PermissionsString[]) =>
        required.filter((permission) => !granted.includes(permission)),
    }),
  };
  return {
    id: "g1",
    members: { me: {} },
    channels: {
      cache: new Map([["c1", channel]]),
      fetch: async () => {
        throw new Error("Unknown Channel");
      },
    },
  } as unknown as Guild;
}

const context = {
  t: (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key} ${JSON.stringify(vars)}` : key,
  userId: "admin",
};

beforeEach(() => {
  vi.clearAllMocks();
  poster.set.mockResolvedValue(true);
  poster.unstick.mockResolvedValue({ removed: true, leftover: false });
  store.remove.mockResolvedValue(1);
});

describe("stickyRecords", () => {
  it("lists each sticky as a channel record", async () => {
    store.list.mockResolvedValue([
      { channelId: "c1", content: "Read the rules", messageId: "m1" },
    ]);
    expect(await stickyRecords.list("g1")).toEqual([
      { channelId: "c1", values: { content: "Read the rules" } },
    ]);
  });

  it("saves and posts the trimmed content", async () => {
    const outcome = await stickyRecords.save(
      fakeGuild(),
      { channelId: "c1", values: { content: " Read the rules " } },
      context
    );
    expect(poster.set).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c1" }),
      "Read the rules"
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toContain("set.done");
  });

  it("refuses blank content", async () => {
    const outcome = await stickyRecords.save(
      fakeGuild(),
      { channelId: "c1", values: { content: "   " } },
      context
    );
    expect(poster.set).not.toHaveBeenCalled();
    expect(outcome).toEqual({ ok: false, message: "set.empty" });
  });

  it("refuses a channel that is not a text or announcement channel", async () => {
    const guild = fakeGuild();
    (guild.channels.cache as unknown as Map<string, { type: ChannelType }>).get(
      "c1"
    )!.type = ChannelType.GuildVoice;
    const outcome = await stickyRecords.save(
      guild,
      { channelId: "c1", values: { content: "Read the rules" } },
      context
    );
    expect(poster.set).not.toHaveBeenCalled();
    expect(outcome).toEqual({ ok: false, message: "set.unknownChannel" });
  });

  it("refuses a channel where the bot cannot post", async () => {
    const outcome = await stickyRecords.save(
      fakeGuild(["ViewChannel"]),
      { channelId: "c1", values: { content: "Read the rules" } },
      context
    );
    expect(poster.set).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("permission.SendMessages");
  });

  it("removes the sticky and its message", async () => {
    const outcome = await stickyRecords.remove(fakeGuild(), "c1", context);
    expect(poster.unstick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c1" })
    );
    expect(outcome.ok).toBe(true);
  });

  it("removes the entry of a deleted channel", async () => {
    const outcome = await stickyRecords.remove(fakeGuild(), "gone", context);
    expect(poster.unstick).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledWith("g1", "gone");
    expect(outcome.message).toContain("remove.done");
  });
});
