import { MessageFlags } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addTranslations, initI18n } from "#lib/i18n.js";

const { mockModules } = vi.hoisted(() => ({ mockModules: [] as any[] }));
vi.mock("#index.js", () => ({ modules: mockModules, client: {} }));

const {
  clearCacheForGuild,
  getFullConfigForGuild,
  getAllModulesStateIn,
  installModuleCommandsIn,
} = vi.hoisted(() => ({
  clearCacheForGuild: vi.fn(),
  getFullConfigForGuild: vi.fn(),
  getAllModulesStateIn: vi.fn(),
  installModuleCommandsIn: vi.fn(),
}));
vi.mock("#core/services/config.service.js", () => ({
  default: { clearCacheForGuild, getFullConfigForGuild },
}));
vi.mock("#core/services/module.service.js", () => ({
  default: { getAllModulesStateIn },
}));
vi.mock("#core/loaders/command-loader.js", () => ({
  installModuleCommandsIn,
}));

const { default: listener, resolveWelcomeChannel } =
  await import("./guild-create.listener.js");

function fakeChannel(sendImpl?: (args: unknown) => Promise<unknown>) {
  return {
    id: "chan-1",
    isTextBased: () => true,
    isSendable: () => true,
    send: vi.fn(sendImpl ?? (async () => ({}))),
  };
}

function fakeGuild(overrides: Record<string, any> = {}) {
  const channel = overrides.channel ?? fakeChannel();
  const ownerSend = overrides.ownerSend ?? vi.fn(async () => ({}));
  return {
    guild: {
      id: "guild-1",
      preferredLocale: "fr",
      systemChannelId: "chan-1",
      systemChannel: channel,
      channels: { fetch: vi.fn(async () => channel) },
      members: {
        me: {
          permissionsIn: vi.fn(() => ({ has: () => true })),
        },
      },
      fetchOwner: vi.fn(async () => ({ send: ownerSend })),
      client: { tag: "fake-client" },
      ...overrides.guild,
    } as any,
    channel,
    ownerSend,
  };
}

beforeAll(async () => {
  await initI18n();
  for (const lng of ["en", "fr"]) {
    addTranslations(lng, "core", {
      "guild.welcome.title": "title",
      "guild.welcome.body": "body",
      "guild.welcome.hint": "hint",
      "guild.welcome.dmPrefix": "prefix ",
    });
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  mockModules.length = 0;
  clearCacheForGuild.mockResolvedValue(undefined);
  getFullConfigForGuild.mockResolvedValue({});
  getAllModulesStateIn.mockResolvedValue([]);
  installModuleCommandsIn.mockResolvedValue(undefined);
});

describe("guildCreate", () => {
  it("initializes config data on first join even when nothing is enabled", async () => {
    const { guild, channel } = fakeGuild();

    await listener.execute(guild, undefined);

    expect(clearCacheForGuild).toHaveBeenCalledWith("guild-1");
    expect(getFullConfigForGuild).toHaveBeenCalledWith("guild-1");
    expect(
      (clearCacheForGuild as any).mock.invocationCallOrder[0]
    ).toBeLessThan((getFullConfigForGuild as any).mock.invocationCallOrder[0]);
    expect(installModuleCommandsIn).not.toHaveBeenCalled();
    expect(channel.send).toHaveBeenCalledOnce();
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.IsComponentsV2 })
    );
  });

  it("reinstalls commands only for enabled modules that declare commands", async () => {
    const withCommands = { id: "m1", registry: { commands: [{}, {}] } };
    const withoutCommands = { id: "m2", registry: { commands: [] } };
    mockModules.push(withCommands, withoutCommands);
    getAllModulesStateIn.mockResolvedValue([
      { module: { id: "m1" }, enabled: true },
      { module: { id: "m2" }, enabled: true },
      { module: { id: "unknown" }, enabled: true },
      { module: { id: "m1" }, enabled: false },
    ]);
    const { guild } = fakeGuild();

    await listener.execute(guild, undefined);

    expect(installModuleCommandsIn).toHaveBeenCalledTimes(1);
    expect(installModuleCommandsIn).toHaveBeenCalledWith(
      guild.client,
      withCommands,
      guild
    );
  });

  it("keeps reinstalling other modules when one install fails", async () => {
    const modA = { id: "a", registry: { commands: [{}] } };
    const modB = { id: "b", registry: { commands: [{}] } };
    mockModules.push(modA, modB);
    getAllModulesStateIn.mockResolvedValue([
      { module: { id: "a" }, enabled: true },
      { module: { id: "b" }, enabled: true },
    ]);
    installModuleCommandsIn.mockRejectedValueOnce(new Error("boom"));
    const { guild } = fakeGuild();

    await expect(listener.execute(guild, undefined)).resolves.toBeUndefined();
    expect(installModuleCommandsIn).toHaveBeenCalledTimes(2);
  });

  it("falls back to the owner DM when no system channel exists", async () => {
    const ownerSend = vi.fn(async () => ({}));
    const { guild } = fakeGuild({
      ownerSend,
      guild: { systemChannelId: null, systemChannel: null },
    });

    await listener.execute(guild, undefined);

    expect(ownerSend).toHaveBeenCalledOnce();
    expect(ownerSend).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.any(String),
        flags: MessageFlags.IsComponentsV2,
      })
    );
  });

  it("falls back to the owner DM when the system channel send is forbidden", async () => {
    const channel = fakeChannel(async () => {
      throw Object.assign(new Error("forbidden"), { code: 50013 });
    });
    const ownerSend = vi.fn(async () => ({}));
    const { guild } = fakeGuild({ channel, ownerSend });

    await listener.execute(guild, undefined);

    expect(channel.send).toHaveBeenCalledOnce();
    expect(ownerSend).toHaveBeenCalledOnce();
  });

  it("stays silent when the owner also blocks DMs", async () => {
    const ownerSend = vi.fn(async () => {
      throw Object.assign(new Error("no dm"), { code: 50007 });
    });
    const { guild } = fakeGuild({
      ownerSend,
      guild: { systemChannelId: null, systemChannel: null },
    });

    await expect(listener.execute(guild, undefined)).resolves.toBeUndefined();
  });
});

describe("resolveWelcomeChannel", () => {
  it("returns null without a system channel", async () => {
    const { guild } = fakeGuild({
      guild: { systemChannelId: null, systemChannel: null },
    });
    await expect(resolveWelcomeChannel(guild)).resolves.toBeNull();
  });

  it("returns null without send permission", async () => {
    const channel = fakeChannel();
    const { guild } = fakeGuild({
      channel,
      guild: {
        members: { me: { permissionsIn: () => ({ has: () => false }) } },
      },
    });
    await expect(resolveWelcomeChannel(guild)).resolves.toBeNull();
  });

  it("returns the channel when readable and writable", async () => {
    const { guild, channel } = fakeGuild();
    await expect(resolveWelcomeChannel(guild)).resolves.toBe(channel);
  });
});
