import { PermissionFlagsBits } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeyedQueue } from "#lib/keyed-queue.js";

const store = vi.hoisted(() => ({
  channel: vi.fn(),
  updateChannel: vi.fn(),
  savePreference: vi.fn(),
  preference: vi.fn(),
  ownedBy: vi.fn(),
}));
const lifecycle = vi.hoisted(() => ({
  applyAccess: vi.fn(),
  removeTempChannel: vi.fn(),
}));

vi.mock("#lib/database.js", () => ({ default: {} }));
vi.mock("./store.service.js", () => ({ default: store }));
vi.mock("./panel.service.js", () => ({ default: { refresh: vi.fn() } }));
vi.mock("./lifecycle.service.js", () => ({
  default: { ...lifecycle, queue: new KeyedQueue() },
}));

const { default: actions, MAX_ACCESS_ENTRIES } =
  await import("./actions.service.js");

function fakeMember(
  id: string,
  { permissions = 0n, voiceChannelId = null as string | null, bot = false } = {}
) {
  const has = (bits: bigint) => (permissions & bits) === bits;
  return {
    id,
    displayName: id,
    client: { user: { id: "bot" } },
    user: { bot },
    permissions: { has },
    permissionsIn: () => ({ has }),
    voice: { channelId: voiceChannelId, disconnect: vi.fn() },
  } as any;
}

function row(change: Record<string, unknown> = {}) {
  return {
    channelId: "c1",
    guildId: "g1",
    hubId: "h1",
    ownerId: "owner",
    locked: false,
    hidden: false,
    trusted: [] as string[],
    blocked: [] as string[],
    panelMessageId: null,
    createdAt: new Date(),
    ...change,
  };
}

function setup(memberIds: string[] = []) {
  const channel = {
    id: "c1",
    isVoiceBased: () => true,
    members: new Map(memberIds.map((id) => [id, {}])),
    setName: vi.fn(async () => undefined),
    setUserLimit: vi.fn(),
  };
  const guild = { id: "g1", channels: { cache: new Map([["c1", channel]]) } };
  return { guild: guild as any, channel };
}

const config = { t: (key: string) => key } as any;

beforeEach(() => {
  vi.clearAllMocks();
  store.updateChannel.mockImplementation(async (_id, change) => ({
    ...row(),
    ...change,
  }));
  store.ownedBy.mockResolvedValue(null);
  store.preference.mockResolvedValue(null);
});

describe("withChannel", () => {
  it("refuses members who are neither owner nor moderator", async () => {
    const { guild } = setup();
    store.channel.mockResolvedValue(row());
    const run = vi.fn();
    const outcome = await actions.withChannel(
      guild,
      "c1",
      fakeMember("someone"),
      config,
      run
    );
    expect(outcome).toEqual({ ok: false, key: "action.notOwner" });
    expect(run).not.toHaveBeenCalled();
  });

  it("lets moderators act", async () => {
    const { guild } = setup();
    store.channel.mockResolvedValue(row());
    const run = vi.fn(async () => ({ ok: true, key: "x" }));
    await actions.withChannel(
      guild,
      "c1",
      fakeMember("mod", { permissions: PermissionFlagsBits.ManageChannels }),
      config,
      run
    );
    expect(run).toHaveBeenCalled();
  });

  it("tells apart a non-temporary channel from a deleted one", async () => {
    const { guild } = setup();
    store.channel.mockResolvedValue(null);
    const run = vi.fn();
    expect(
      await actions.withChannel(guild, "c1", fakeMember("owner"), config, run)
    ).toEqual({ ok: false, key: "action.notTemporary" });
    expect(
      await actions.withChannel(guild, "zz", fakeMember("owner"), config, run)
    ).toEqual({ ok: false, key: "action.gone" });
  });
});

function ctx(actor: any, memberIds: string[] = [], change = {}) {
  const { guild, channel } = setup(memberIds);
  return { guild, channel, row: row(change), actor, config } as any;
}

describe("claim", () => {
  it("needs the owner to be gone and the claimer to be in the channel", async () => {
    const inside = fakeMember("guest", { voiceChannelId: "c1" });
    expect(await actions.claim(ctx(inside, ["owner", "guest"]))).toMatchObject({
      ok: false,
      key: "claim.ownerPresent",
    });
    expect(
      await actions.claim(ctx(fakeMember("guest"), ["guest"]))
    ).toMatchObject({ ok: false, key: "claim.notInChannel" });
  });

  it("refuses a member who already owns a channel", async () => {
    store.ownedBy.mockResolvedValue(row({ channelId: "c2" }));
    const inside = fakeMember("guest", { voiceChannelId: "c1" });
    expect(await actions.claim(ctx(inside, ["guest"]))).toMatchObject({
      ok: false,
      key: "claim.ownsAnother",
    });
  });

  it("hands the channel over and does not save preferences", async () => {
    const inside = fakeMember("guest", { voiceChannelId: "c1" });
    expect(await actions.claim(ctx(inside, ["guest"]))).toMatchObject({
      ok: true,
    });
    expect(store.updateChannel).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ ownerId: "guest" })
    );
    expect(lifecycle.applyAccess).toHaveBeenCalled();
    expect(store.savePreference).not.toHaveBeenCalled();
  });

  it("leaves the database untouched when Discord refuses the change", async () => {
    lifecycle.applyAccess.mockRejectedValueOnce(
      new Error("Missing Permissions")
    );
    const owner = fakeMember("owner");
    await expect(actions.setAccess(ctx(owner), "invite")).rejects.toThrow();
    expect(store.updateChannel).not.toHaveBeenCalled();
    expect(store.savePreference).not.toHaveBeenCalled();
  });
});

describe("block", () => {
  it("protects moderators and disconnects blocked members in the channel", async () => {
    const owner = fakeMember("owner");
    const mod = fakeMember("mod", {
      permissions: PermissionFlagsBits.MoveMembers,
    });
    const troll = fakeMember("troll", { voiceChannelId: "c1" });
    expect(await actions.block(ctx(owner), [mod])).toMatchObject({
      ok: false,
      key: "block.protected",
    });
    const outcome = await actions.block(
      ctx(owner, [], { trusted: ["troll"] }),
      [troll]
    );
    expect(outcome.ok).toBe(true);
    expect(store.updateChannel).toHaveBeenCalledWith("c1", {
      trusted: [],
      blocked: ["troll"],
    });
    expect(troll.voice.disconnect).toHaveBeenCalled();
    expect(store.savePreference).toHaveBeenCalledWith("g1", "owner", {
      trusted: [],
      blocked: ["troll"],
    });
  });
});

describe("trust", () => {
  it("caps the access lists", async () => {
    const owner = fakeMember("owner");
    const trusted = Array.from(
      { length: MAX_ACCESS_ENTRIES },
      (_, i) => `u${i}`
    );
    expect(
      await actions.trust(ctx(owner, [], { trusted }), [fakeMember("new")])
    ).toMatchObject({ ok: false, key: "access.full" });
  });
});

describe("commit rollback", () => {
  it("restores Discord when the database refuses the change", async () => {
    store.updateChannel.mockRejectedValueOnce(new Error("Unique constraint"));
    const inside = fakeMember("guest", { voiceChannelId: "c1" });
    await expect(actions.claim(ctx(inside, ["guest"]))).rejects.toThrow();
    expect(lifecycle.applyAccess).toHaveBeenCalledTimes(2);
    const [, , applied, previous] = lifecycle.applyAccess.mock.calls[0]!;
    const [, , restored, released] = lifecycle.applyAccess.mock.calls[1]!;
    expect(applied.ownerId).toBe("guest");
    expect(restored).toEqual(previous);
    expect(released).toEqual(applied);
  });
});

describe("rename failures", () => {
  it("frees the slot and remembers nothing when Discord rejects the name", async () => {
    const owner = fakeMember("owner");
    const context = ctx(owner, [], { channelId: "c9" });
    context.channel.id = "c9";
    context.channel.setName.mockRejectedValue(new Error("AutoMod"));
    await expect(actions.rename(context, "bad")).rejects.toThrow();
    await expect(actions.rename(context, "bad")).rejects.toThrow();
    context.channel.setName.mockResolvedValue(undefined);
    expect((await actions.rename(context, "good")).ok).toBe(true);
    expect(store.savePreference).toHaveBeenCalledTimes(1);
    expect(store.savePreference).toHaveBeenCalledWith("g1", "owner", {
      name: "good",
    });
  });
});

describe("remembered access", () => {
  it("saves only what the owner changed, not the lists inherited from a claim", async () => {
    store.preference.mockResolvedValue({
      trusted: ["kept"],
      blocked: ["old"],
    });
    const owner = fakeMember("owner");
    await actions.trust(
      ctx(owner, [], { trusted: ["inherited"], blocked: ["x", "y"] }),
      [fakeMember("z")]
    );
    expect(store.savePreference).toHaveBeenCalledWith("g1", "owner", {
      trusted: ["kept", "z"],
      blocked: ["old"],
    });
  });
});

describe("setAccess", () => {
  it("makes a private channel both locked and hidden, and remembers it", async () => {
    const owner = fakeMember("owner");
    expect(await actions.setAccess(ctx(owner), "private")).toMatchObject({
      ok: true,
      key: "mode.private.done",
    });
    expect(store.updateChannel).toHaveBeenCalledWith("c1", {
      locked: true,
      hidden: true,
    });
    expect(store.savePreference).toHaveBeenCalledWith("g1", "owner", {
      locked: true,
      hidden: true,
    });
  });

  it("touches nothing when the mode does not change", async () => {
    const owner = fakeMember("owner");
    await actions.setAccess(ctx(owner, [], { locked: true }), "invite");
    expect(lifecycle.applyAccess).not.toHaveBeenCalled();
    expect(store.updateChannel).not.toHaveBeenCalled();
  });
});

describe("edit", () => {
  it("only applies what changed", async () => {
    const owner = fakeMember("owner");
    const context = ctx(owner, [], { channelId: "c7" });
    Object.assign(context.channel, { id: "c7", name: "Salon", userLimit: 5 });
    expect(await actions.edit(context, "Salon", 5)).toMatchObject({
      key: "edit.unchanged",
    });
    expect(await actions.edit(context, " Salon ", 8)).toMatchObject({
      ok: true,
      key: "edit.done",
      params: { details: "limit.done" },
    });
    expect(context.channel.setUserLimit).toHaveBeenCalledWith(8);
    expect(context.channel.setName).not.toHaveBeenCalled();
  });

  it("renames before changing the limit, and reports both", async () => {
    const owner = fakeMember("owner");
    const context = ctx(owner, [], { channelId: "c8" });
    Object.assign(context.channel, { id: "c8", name: "Salon", userLimit: 5 });
    context.channel.setName.mockRejectedValueOnce(new Error("AutoMod"));
    await expect(actions.edit(context, "Bad", 8)).rejects.toThrow();
    expect(context.channel.setUserLimit).not.toHaveBeenCalled();

    expect(await actions.edit(context, "Good", 8)).toMatchObject({
      ok: true,
      params: { details: "rename.done\nlimit.done" },
    });
  });
});

describe("notify", () => {
  it("sends one DM per invited member, not one per click", async () => {
    const owner = fakeMember("owner");
    const target = { ...fakeMember("target-1"), send: vi.fn() };
    const stranger = { ...fakeMember("stranger"), send: vi.fn() };
    const context = ctx(owner, [], { trusted: ["target-1"] });
    context.guild.name = "Graven";
    context.channel.url = "https://discord.com/channels/g1/c1";
    expect(await actions.notify(context, [target, stranger])).toMatchObject({
      key: "notify.done",
      params: { users: "<@target-1>" },
    });
    expect(await actions.notify(context, [target])).toMatchObject({
      key: "notify.already",
    });
    expect(target.send).toHaveBeenCalledTimes(1);
    expect(stranger.send).not.toHaveBeenCalled();
  });

  it("forgets the members of an expired notice", () => {
    const { guild } = setup();
    guild.members = { cache: new Map([["a", fakeMember("a")]]) };
    actions.rememberNotice("token", ["a", "gone"]);
    expect(actions.noticeMembers(guild, "token").map((m) => m.id)).toEqual([
      "a",
    ]);
    expect(actions.noticeMembers(guild, "other")).toEqual([]);
  });
});

describe("authorize", () => {
  it("hands back the channel and row to the owner", async () => {
    const { guild, channel } = setup();
    const stored = row();
    store.channel.mockResolvedValue(stored);
    expect(await actions.authorize(guild, "c1", fakeMember("owner"))).toEqual({
      channel,
      row: stored,
    });
    expect(await actions.authorize(guild, "c1", fakeMember("someone"))).toEqual(
      { ok: false, key: "action.notOwner" }
    );
  });
});

describe("rename", () => {
  it("stops after two renames in 10 minutes", async () => {
    const owner = fakeMember("owner");
    const context = ctx(owner);
    expect((await actions.rename(context, "a")).ok).toBe(true);
    expect((await actions.rename(context, "b")).ok).toBe(true);
    expect(await actions.rename(context, "c")).toMatchObject({
      ok: false,
      key: "rename.rateLimited",
    });
    expect(context.channel.setName).toHaveBeenCalledTimes(2);
  });
});

describe("revoke", () => {
  it("removes members from both lists, and forgets them in the preferences", async () => {
    store.preference.mockResolvedValue({ trusted: ["a"], blocked: ["b"] });
    const owner = fakeMember("owner");
    const context = ctx(owner, [], { trusted: ["a", "c"], blocked: ["b"] });
    expect(await actions.revoke(context, ["a", "b"])).toEqual({
      ok: true,
      key: "revoke.done",
      params: { users: "<@a>, <@b>" },
    });
    expect(store.updateChannel).toHaveBeenCalledWith("c1", {
      trusted: ["c"],
      blocked: [],
    });
    expect(store.savePreference).toHaveBeenCalledWith("g1", "owner", {
      trusted: [],
      blocked: [],
    });
  });

  it("changes nothing for members on neither list", async () => {
    const context = ctx(fakeMember("owner"), [], { trusted: ["a"] });
    expect(await actions.revoke(context, ["z"])).toEqual({
      ok: false,
      key: "revoke.none",
    });
    expect(store.updateChannel).not.toHaveBeenCalled();
  });
});

describe("kick", () => {
  it("disconnects present members, sparing moderators and those elsewhere", async () => {
    const owner = fakeMember("owner");
    const guest = fakeMember("guest", { voiceChannelId: "c1" });
    const away = fakeMember("away", { voiceChannelId: "c2" });
    const mod = fakeMember("mod", {
      voiceChannelId: "c1",
      permissions: PermissionFlagsBits.MoveMembers,
    });
    expect(await actions.kick(ctx(owner), [guest, away, mod])).toEqual({
      ok: true,
      key: "kick.done",
      params: { users: "<@guest>" },
    });
    expect(guest.voice.disconnect).toHaveBeenCalled();
    expect(away.voice.disconnect).not.toHaveBeenCalled();
    expect(mod.voice.disconnect).not.toHaveBeenCalled();

    expect(await actions.kick(ctx(owner), [mod])).toMatchObject({
      ok: false,
      key: "kick.protected",
    });
    expect(await actions.kick(ctx(owner), [away])).toMatchObject({
      ok: false,
      key: "kick.none",
    });
  });

  it("reports a disconnection Discord refused", async () => {
    const guest = fakeMember("guest", { voiceChannelId: "c1" });
    guest.voice.disconnect.mockRejectedValueOnce(new Error("Missing Access"));
    expect(await actions.kick(ctx(fakeMember("owner")), [guest])).toEqual({
      ok: false,
      key: "kick.failed",
    });
  });
});

describe("transfer", () => {
  it("hands the channel to a present member, out of the access lists", async () => {
    const guest = fakeMember("guest", { voiceChannelId: "c1" });
    const context = ctx(fakeMember("owner"), [], {
      trusted: ["guest", "other"],
    });
    expect(await actions.transfer(context, guest)).toEqual({
      ok: true,
      key: "transfer.done",
      params: { user: "<@guest>" },
    });
    expect(store.updateChannel).toHaveBeenCalledWith("c1", {
      ownerId: "guest",
      trusted: ["other"],
      blocked: [],
    });
  });

  it("refuses the owner, a bot, an absent member and one owning a channel", async () => {
    const context = ctx(fakeMember("owner"));
    expect(await actions.transfer(context, fakeMember("owner"))).toMatchObject({
      key: "transfer.invalid",
    });
    expect(
      await actions.transfer(
        context,
        fakeMember("bot", { voiceChannelId: "c1", bot: true })
      )
    ).toMatchObject({ key: "transfer.invalid" });
    expect(await actions.transfer(context, fakeMember("away"))).toMatchObject({
      key: "transfer.notInChannel",
    });
    store.ownedBy.mockResolvedValueOnce(row({ channelId: "c2" }));
    expect(
      await actions.transfer(
        context,
        fakeMember("guest", { voiceChannelId: "c1" })
      )
    ).toMatchObject({ key: "transfer.ownsAnother" });
    expect(store.updateChannel).not.toHaveBeenCalled();
  });
});

describe("remove", () => {
  it("deletes the channel on the owner's behalf, or says it failed", async () => {
    const context = ctx(fakeMember("owner"));
    lifecycle.removeTempChannel.mockResolvedValueOnce(true);
    expect(await actions.remove(context)).toEqual({
      ok: true,
      key: "delete.done",
    });
    expect(lifecycle.removeTempChannel).toHaveBeenCalledWith(
      context.channel,
      context.row,
      "owner"
    );
    lifecycle.removeTempChannel.mockResolvedValueOnce(false);
    expect(await actions.remove(context)).toEqual({
      ok: false,
      key: "delete.failed",
    });
  });
});
