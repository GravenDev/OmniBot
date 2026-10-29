import {
  Collection,
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
  type PermissionOverwriteOptions,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { silenceLogs } from "#lib/testing.js";

const store = vi.hoisted(() => ({
  ownedBy: vi.fn(),
  preference: vi.fn(),
  createChannel: vi.fn(),
  touchPreference: vi.fn(),
  channel: vi.fn(),
  channels: vi.fn(),
  hubs: vi.fn(),
  removeHub: vi.fn(),
  removeChannel: vi.fn(),
  updateChannel: vi.fn(),
}));
const panel = vi.hoisted(() => ({ postPanel: vi.fn(), refreshPanel: vi.fn() }));

vi.mock("#lib/database.js", () => ({ default: {} }));
vi.mock("./store.js", () => ({ default: store }));
vi.mock("./panel.js", () => panel);

const { applyAccess, joinHub, memberLeft, ownerMoved, reconcile } =
  await import("./lifecycle.js");

silenceLogs();

const config = { t: (key: string) => key } as any;
const hub = { channelId: "hub", nameTemplate: "Salon de {user}", userLimit: 0 };
const CONNECT = PermissionFlagsBits.Connect;

function permissions(bits: bigint, missing: string[] = []) {
  return {
    bitfield: bits,
    has: (b: bigint) => (bits & b) === b,
    any: (b: bigint) => (bits & b) !== 0n,
    missing: () => missing,
  };
}

function bitsOf(options: PermissionOverwriteOptions, value: boolean): bigint {
  return PermissionsBitField.resolve(
    Object.entries(options)
      .filter(([, set]) => set === value)
      .map(([name]) => name as keyof typeof PermissionFlagsBits)
  );
}

function fakeOverwrites(
  reject: (id: string, options: PermissionOverwriteOptions) => boolean
) {
  const cache = new Collection<string, any>();
  return {
    cache,
    create: vi.fn(
      async (
        id: string,
        options: PermissionOverwriteOptions,
        { type }: { type: OverwriteType }
      ) => {
        if (reject(id, options)) {
          throw new Error("Missing Permissions");
        }
        cache.set(id, {
          id,
          type,
          allow: { bitfield: bitsOf(options, true) },
          deny: { bitfield: bitsOf(options, false) },
        });
      }
    ),
    delete: vi.fn(async (id: string) => {
      cache.delete(id);
    }),
  };
}

function setup({
  reject = (_id: string, _options: PermissionOverwriteOptions) => false,
  missing = [] as string[],
} = {}) {
  const created: any = {
    id: "temp",
    parent: null,
    permissionOverwrites: fakeOverwrites(reject),
    delete: vi.fn(async () => undefined),
  };
  created.fetch = vi.fn(async () => created);
  const me = { id: "bot", permissions: permissions(PermissionsBitField.All) };
  const moderator = {
    id: "mod",
    permissions: permissions(0n),
    permissionsIn: () => permissions(PermissionFlagsBits.MoveMembers),
    client: { user: { id: "bot" } },
  };
  const member: any = {
    id: "alice",
    displayName: "Alice",
    permissions: permissions(PermissionsBitField.All),
    user: { bot: false, username: "alice" },
    voice: { channelId: "hub", setChannel: vi.fn() },
  };
  const guild: any = {
    id: "g1",
    roles: { cache: new Collection() },
    members: {
      me,
      cache: new Map<string, any>([
        ["mod", moderator],
        ["alice", member],
      ]),
      fetch: vi.fn(async () => {
        throw new Error("Unknown Member");
      }),
    },
    channels: {
      cache: new Map(),
      create: vi.fn(async () => created),
    },
  };
  member.guild = guild;
  created.guild = guild;
  const hubChannel: any = {
    id: "hub",
    parent: null,
    bitrate: 64000,
    rtcRegion: null,
    permissionsFor: () => permissions(PermissionsBitField.All, missing),
    send: vi.fn(async () => ({ delete: vi.fn(async () => undefined) })),
  };
  guild.channels.cache.set("hub", hubChannel);
  return { guild, hubChannel, member, created };
}

function preference(change: Record<string, unknown>) {
  return {
    name: null,
    userLimit: null,
    locked: false,
    hidden: false,
    trusted: [],
    blocked: [],
    ...change,
  };
}

let nextMember = 0;

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

function freshMember(member: any) {
  member.id = `member-${nextMember++}`;
  member.guild.members.cache.set(member.id, member);
  return member;
}

describe("joinHub", () => {
  it("creates the channel, moves the member and posts the panel", async () => {
    const { hubChannel, member, created, guild } = setup();
    await joinHub(freshMember(member), hubChannel, hub, config);
    expect(guild.channels.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Salon de Alice" })
    );
    expect(
      created.permissionOverwrites.cache.get(member.id).allow.bitfield
    ).toBe(PermissionFlagsBits.ViewChannel | CONNECT);
    expect(member.voice.setChannel).toHaveBeenCalledWith(created);
    expect(panel.postPanel).toHaveBeenCalled();
  });

  it("creates nothing and warns the member when the bot lacks a permission", async () => {
    const { hubChannel, member, guild } = setup({ missing: ["MoveMembers"] });
    await joinHub(freshMember(member), hubChannel, hub, config);
    expect(guild.channels.create).not.toHaveBeenCalled();
    expect(hubChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({ content: `<@${member.id}> hub.unavailable` })
    );
  });

  it("deletes the channel and warns the member when it cannot be set up", async () => {
    const { hubChannel, member, created } = setup({ reject: () => true });
    await joinHub(freshMember(member), hubChannel, hub, config);
    expect(created.delete).toHaveBeenCalled();
    expect(store.createChannel).not.toHaveBeenCalled();
    expect(member.voice.setChannel).not.toHaveBeenCalled();
  });

  it("opens the channel when a remembered lock is refused, instead of failing forever", async () => {
    const { hubChannel, member, created } = setup({
      reject: (_id, options) => options.Connect === false,
    });
    store.preference.mockResolvedValue(preference({ locked: true }));
    await joinHub(freshMember(member), hubChannel, hub, config);
    expect(created.delete).not.toHaveBeenCalled();
    expect(store.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ locked: false })
    );
    expect(member.voice.setChannel).toHaveBeenCalled();
  });

  it("drops remembered blocks of members who became moderators", async () => {
    const { hubChannel, member } = setup();
    store.preference.mockResolvedValue(
      preference({ blocked: ["mod", "troll"] })
    );
    await joinHub(freshMember(member), hubChannel, hub, config);
    expect(store.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ blocked: ["troll"] })
    );
  });

  it("gives no access to a trusted member it cannot find", async () => {
    const { hubChannel, member, created } = setup();
    store.preference.mockResolvedValue(preference({ trusted: ["ghost"] }));
    await joinHub(freshMember(member), hubChannel, hub, config);
    expect(created.permissionOverwrites.cache.has("ghost")).toBe(false);
  });
});

describe("applyAccess", () => {
  it("undoes what it already wrote when Discord refuses an overwrite", async () => {
    const { created } = setup({ reject: (id) => id === "troll" });
    const state = {
      ownerId: "alice",
      locked: true,
      hidden: false,
      trusted: [],
      blocked: ["troll"],
    };
    await expect(applyAccess(created, "hub", state)).rejects.toThrow();
    expect(created.permissionOverwrites.create).toHaveBeenCalled();
    expect([...created.permissionOverwrites.cache.keys()]).toEqual([]);
  });

  it("diffs against the channel fetched from Discord, not a stale cache", async () => {
    const { created } = setup();
    const state = {
      ownerId: "alice",
      locked: false,
      hidden: false,
      trusted: ["friend"],
      blocked: [],
    };
    created.guild.members.cache.set("friend", {
      id: "friend",
      permissions: permissions(PermissionsBitField.All),
    });
    const stale = created.permissionOverwrites.cache;
    created.fetch = vi.fn(async () => {
      stale.set("friend", {
        id: "friend",
        type: OverwriteType.Member,
        allow: { bitfield: PermissionFlagsBits.ViewChannel | CONNECT },
        deny: { bitfield: 0n },
      });
      return created;
    });
    await applyAccess(created, "hub", { ...state, trusted: [] }, state);
    expect(created.permissionOverwrites.delete).toHaveBeenCalledWith("friend");
  });
});

describe("memberLeft", () => {
  function channelWith(...members: { id: string; bot: boolean }[]) {
    return {
      id: "temp",
      members: new Collection(
        members.map(({ id, bot }) => [id, { id, user: { bot } }])
      ),
      delete: vi.fn(async () => undefined),
    } as any;
  }

  it("deletes the channel when only bots are left", async () => {
    store.channel.mockResolvedValue({ channelId: "temp", ownerId: "alice" });
    const channel = channelWith({ id: "music", bot: true });
    await memberLeft(channel, "alice", config.t);
    expect(channel.delete).toHaveBeenCalled();
    expect(panel.refreshPanel).not.toHaveBeenCalled();
    expect(store.removeChannel).toHaveBeenCalledWith("temp");
  });

  it("keeps a channel with a human inside", async () => {
    store.channel.mockResolvedValue({ channelId: "temp", ownerId: "alice" });
    const channel = channelWith(
      { id: "music", bot: true },
      { id: "bob", bot: false }
    );
    await memberLeft(channel, "carol", config.t);
    expect(channel.delete).not.toHaveBeenCalled();
    expect(panel.refreshPanel).not.toHaveBeenCalled();
    await memberLeft(channel, "alice", config.t);
    expect(panel.refreshPanel).toHaveBeenCalledTimes(1);
  });
});

describe("ownerMoved", () => {
  it("redraws the panel only when the owner comes or goes", async () => {
    const channel = { id: "c1" } as any;
    store.channel.mockResolvedValue({ channelId: "c1", ownerId: "owner" });
    await ownerMoved(channel, "guest", config.t);
    expect(panel.refreshPanel).not.toHaveBeenCalled();
    await ownerMoved(channel, "owner", config.t);
    expect(panel.refreshPanel).toHaveBeenCalledTimes(1);
  });
});

describe("reconcile", () => {
  it("forgets hubs deleted while the module was disabled", async () => {
    const { guild } = setup();
    store.hubs.mockResolvedValue([
      { channelId: "hub" },
      { channelId: "deleted-hub" },
    ]);
    store.channels.mockResolvedValue([]);
    guild.channels.cache.get("hub").isVoiceBased = () => true;
    await reconcile(guild);
    expect(store.removeHub).toHaveBeenCalledTimes(1);
    expect(store.removeHub).toHaveBeenCalledWith("g1", "deleted-hub");
  });
});
