import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { silenceLogs } from "#lib/testing.js";

const store = vi.hoisted(() => ({
  ownedBy: vi.fn(),
  preference: vi.fn(),
  createChannel: vi.fn(),
  touchPreference: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  updateChannel: vi.fn(),
}));
const panel = vi.hoisted(() => ({ postPanel: vi.fn() }));

vi.mock("#lib/database.js", () => ({ default: {} }));
vi.mock("./store.js", () => ({ default: store }));
vi.mock("./panel.js", () => panel);

const { joinHub, memberLeft } = await import("./lifecycle.js");

silenceLogs();

const config = { t: (key: string) => key } as any;
const hub = { channelId: "hub", nameTemplate: "Salon de {user}", userLimit: 0 };

function permissions(bits: bigint) {
  return {
    bitfield: bits,
    has: (b: bigint) => (bits & b) === b,
    missing: () => [],
  };
}

function setup({ createFails = false, overwriteFails = false } = {}) {
  const created = {
    id: "temp",
    permissionOverwrites: {
      cache: { map: () => [] },
      create: vi.fn(async () => {
        if (overwriteFails) throw new Error("Missing Permissions");
      }),
      delete: vi.fn(),
    },
    parent: null,
    guild: undefined as any,
    delete: vi.fn(async () => undefined),
  };
  const me = { id: "bot", permissions: permissions(PermissionsBitField.All) };
  const moderator = {
    id: "mod",
    permissions: permissions(0n),
    permissionsIn: () => permissions(PermissionFlagsBits.MoveMembers),
    client: { user: { id: "bot" } },
  };
  const guild: any = {
    id: "g1",
    members: { me, cache: new Map([["mod", moderator]]) },
    channels: {
      cache: new Map(),
      create: vi.fn(async () => {
        if (createFails) throw new Error("Maximum channels");
        return created;
      }),
    },
  };
  created.guild = guild;
  const hubChannel: any = {
    id: "hub",
    parent: null,
    bitrate: 64000,
    rtcRegion: null,
    permissionsFor: () => permissions(PermissionsBitField.All),
    send: vi.fn(async () => ({ delete: vi.fn(async () => undefined) })),
  };
  const member: any = {
    id: "alice",
    guild,
    displayName: "Alice",
    user: { bot: false, username: "alice" },
    voice: { channelId: "hub", setChannel: vi.fn() },
  };
  return { guild, hubChannel, member, created };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.ownedBy.mockResolvedValue(null);
  store.preference.mockResolvedValue(null);
  store.createChannel.mockImplementation(async (row) => ({
    ...row,
    panelMessageId: null,
    createdAt: new Date(),
  }));
});

describe("joinHub", () => {
  it("creates the channel, moves the member and posts the panel", async () => {
    const { hubChannel, member, created, guild } = setup();
    await joinHub(member, hubChannel, hub, config);
    expect(guild.channels.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Salon de Alice" })
    );
    expect(member.voice.setChannel).toHaveBeenCalledWith(created);
    expect(panel.postPanel).toHaveBeenCalled();
  });

  it("deletes the channel and warns the member when it cannot be set up", async () => {
    const { hubChannel, member, created } = setup({ overwriteFails: true });
    member.id = "bob";
    await joinHub(member, hubChannel, hub, config);
    expect(created.delete).toHaveBeenCalled();
    expect(store.createChannel).not.toHaveBeenCalled();
    expect(member.voice.setChannel).not.toHaveBeenCalled();
    expect(hubChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({ content: "<@bob> hub.unavailable" })
    );
  });

  it("drops remembered blocks of members who became moderators", async () => {
    const { hubChannel, member } = setup();
    member.id = "carol";
    store.preference.mockResolvedValue({
      name: null,
      userLimit: null,
      locked: false,
      hidden: false,
      trusted: [],
      blocked: ["mod", "troll"],
    });
    await joinHub(member, hubChannel, hub, config);
    expect(store.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ blocked: ["troll"] })
    );
  });
});

describe("memberLeft", () => {
  it("deletes the channel once no human is left", async () => {
    const row = { channelId: "temp", guildId: "g1", ownerId: "alice" };
    store.channel.mockResolvedValue(row);
    const channel: any = {
      id: "temp",
      members: { filter: () => ({ size: 0 }) },
      delete: vi.fn(async () => undefined),
    };
    await memberLeft(channel);
    expect(channel.delete).toHaveBeenCalled();
    expect(store.removeChannel).toHaveBeenCalledWith("temp");
  });

  it("keeps a channel with people inside", async () => {
    store.channel.mockResolvedValue({ channelId: "temp2", ownerId: "alice" });
    const channel: any = {
      id: "temp2",
      members: { filter: () => ({ size: 1 }) },
      delete: vi.fn(),
    };
    await memberLeft(channel);
    expect(channel.delete).not.toHaveBeenCalled();
  });
});
