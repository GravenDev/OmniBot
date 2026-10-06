import { type Client, Routes, SlashCommandBuilder } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";

// Avoid booting the bot / Prisma when importing the command loader's module graph.
vi.mock("#core/runtime.js", () => ({
  modules: [],
  client: { user: { id: "app-1" }, token: "token", isReady: () => true },
}));
vi.mock("#lib/database.js", () => ({ default: {}, Prisma: {} }));

// Capture REST calls without any network I/O.
const { restPut, restPost } = vi.hoisted(() => ({
  restPut: vi.fn(),
  restPost: vi.fn(),
}));
vi.mock("discord.js", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("discord.js");
  class FakeREST {
    setToken() {
      return this;
    }
    put = restPut;
    post = restPost;
  }
  return { ...actual, REST: FakeREST };
});

vi.mock("#core/services/module.service.js", () => ({
  default: {
    getModuleStateFromGuildIdIn: vi.fn(),
    getModuleStateIn: vi.fn(),
    enableModule: vi.fn(),
    disableModule: vi.fn(),
    getGuildsWhereVersionDoesNotMatch: vi.fn(),
    updateModuleActivation: vi.fn(),
  },
}));

// Core module with a single known command so we can assert it is always included.
vi.mock("#core/core.module.js", () => ({
  default: {
    id: "core",
    registry: {
      commands: [{ data: { toJSON: () => ({ name: "core-cmd" }) } }],
    },
  },
}));

const {
  loadDevGuildCommands,
  installModuleCommandsIn,
  checkCommandsForVersionChange,
} = await import("./command-loader.js");
const { installModule, uninstallModule } =
  await import("./module-installer.js");
const { default: moduleService } =
  await import("#core/services/module.service.js");

const getState = vi.mocked(moduleService.getModuleStateFromGuildIdIn);

const originalGuildId = process.env["DEV_GUILD_ID"];

function fakeModule(id: string, commandNames: string[]): Module {
  const commands = commandNames.map((name) => ({
    data: new SlashCommandBuilder().setName(name).setDescription("a command"),
  }));
  return { id, registry: { commands } } as unknown as Module;
}

const client = {
  user: { id: "app-1" },
  token: "token",
} as unknown as Client<true>;

function putBodyNames(): string[] {
  const body = restPut.mock.calls[0]?.[1]?.body as { name: string }[];
  return body.map((command) => command.name);
}

describe("loadDevGuildCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restPut.mockResolvedValue(undefined);
    process.env["DEV_GUILD_ID"] = "guild-9";
  });

  afterEach(() => {
    if (originalGuildId === undefined) {
      delete process.env["DEV_GUILD_ID"];
    } else {
      process.env["DEV_GUILD_ID"] = originalGuildId;
    }
  });

  it("registers enabled modules' commands in a single PUT on the dev guild", async () => {
    getState.mockResolvedValue({ activated: true } as never);

    await loadDevGuildCommands(client, [fakeModule("mod-a", ["alpha"])]);

    expect(restPut).toHaveBeenCalledTimes(1);
    expect(restPut).toHaveBeenCalledWith(
      Routes.applicationGuildCommands("app-1", "guild-9"),
      expect.anything()
    );
    expect(putBodyNames()).toContain("core-cmd");
    expect(putBodyNames()).toContain("alpha");
  });

  it("always registers the core commands, even with no modules", async () => {
    await loadDevGuildCommands(client, []);

    expect(getState).not.toHaveBeenCalled();
    expect(restPut).toHaveBeenCalledTimes(1);
    expect(putBodyNames()).toEqual(["core-cmd"]);
  });

  it("excludes commands of modules disabled on the dev guild", async () => {
    getState.mockImplementation(
      (id: string) => ({ activated: id === "mod-a" }) as never
    );

    await loadDevGuildCommands(client, [
      fakeModule("mod-a", ["alpha"]),
      fakeModule("mod-b", ["beta"]),
    ]);

    expect(restPut).toHaveBeenCalledTimes(1);
    expect(putBodyNames()).toContain("alpha");
    expect(putBodyNames()).not.toContain("beta");
  });

  it("does not consult module state for modules without commands", async () => {
    await loadDevGuildCommands(client, [fakeModule("mod-empty", [])]);

    expect(getState).not.toHaveBeenCalled();
    expect(restPut).toHaveBeenCalledTimes(1);
  });

  it("skips registration entirely when DEV_GUILD_ID is missing", async () => {
    delete process.env["DEV_GUILD_ID"];

    await loadDevGuildCommands(client, [fakeModule("mod-a", ["alpha"])]);

    expect(restPut).not.toHaveBeenCalled();
  });
});

function fakeGuild(id: string) {
  return {
    id,
    commands: { fetch: async () => [], delete: vi.fn() },
  } as unknown as Parameters<typeof installModule>[1];
}

describe("installModuleCommandsIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restPost.mockResolvedValue(undefined);
  });

  it("rethrows Discord failures instead of swallowing them", async () => {
    restPost.mockRejectedValue(new Error("discord is down"));

    await expect(
      installModuleCommandsIn(
        client,
        fakeModule("mod-a", ["alpha"]),
        fakeGuild("guild-1")
      )
    ).rejects.toThrow("discord is down");
  });
});

describe("installModule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restPost.mockResolvedValue(undefined);
    vi.mocked(moduleService.getModuleStateIn).mockResolvedValue({
      activated: false,
    } as never);
  });

  it("does not flip the DB state when command registration fails", async () => {
    restPost.mockRejectedValue(new Error("discord is down"));

    await expect(
      installModule(fakeModule("mod-a", ["alpha"]), fakeGuild("guild-1"))
    ).rejects.toThrow("discord is down");
    expect(moduleService.enableModule).not.toHaveBeenCalled();
  });

  it("touches neither Discord nor the DB when onInstall throws", async () => {
    const module = {
      ...fakeModule("mod-a", ["alpha"]),
      onInstall: () => {
        throw new Error("hook blew up");
      },
    } as unknown as Module;

    await expect(installModule(module, fakeGuild("guild-1"))).rejects.toThrow(
      "hook blew up"
    );
    expect(restPost).not.toHaveBeenCalled();
    expect(moduleService.enableModule).not.toHaveBeenCalled();
  });

  it("enables the module when registration succeeds", async () => {
    await installModule(fakeModule("mod-a", ["alpha"]), fakeGuild("guild-1"));

    expect(moduleService.enableModule).toHaveBeenCalledWith(
      "mod-a",
      expect.objectContaining({ id: "guild-1" })
    );
  });
});

describe("checkCommandsForVersionChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restPost.mockResolvedValue(undefined);
    vi.mocked(
      moduleService.getGuildsWhereVersionDoesNotMatch
    ).mockResolvedValue([
      { guildId: "guild-1", currentVersion: "1.0.0" },
      { guildId: "guild-2", currentVersion: "1.0.0" },
    ] as never);
  });

  function versionedClient() {
    return {
      ...client,
      guilds: { fetch: async (id: string) => fakeGuild(id) },
    } as unknown as Client;
  }

  function versionedModule() {
    return {
      ...fakeModule("mod-a", ["alpha"]),
      version: "2.0.0",
    } as unknown as Module;
  }

  it("queues guilds with a missing version instead of throwing", async () => {
    vi.mocked(
      moduleService.getGuildsWhereVersionDoesNotMatch
    ).mockResolvedValue([{ guildId: "guild-1", currentVersion: "" }] as never);

    await checkCommandsForVersionChange(versionedClient(), versionedModule());

    expect(restPost).toHaveBeenCalled();
    expect(moduleService.updateModuleActivation).toHaveBeenCalledWith(
      "mod-a",
      "guild-1",
      "2.0.0"
    );
  });

  it("resyncs downgraded guilds instead of leaving them behind", async () => {
    vi.mocked(
      moduleService.getGuildsWhereVersionDoesNotMatch
    ).mockResolvedValue([
      { guildId: "guild-1", currentVersion: "3.0.0" },
    ] as never);

    await checkCommandsForVersionChange(versionedClient(), versionedModule());

    expect(restPost).toHaveBeenCalled();
    expect(moduleService.updateModuleActivation).toHaveBeenCalledWith(
      "mod-a",
      "guild-1",
      "2.0.0"
    );
  });

  it("bumps activatedVersion only for guilds whose update succeeded", async () => {
    restPost.mockRejectedValueOnce(new Error("discord is down"));

    await checkCommandsForVersionChange(versionedClient(), versionedModule());

    expect(moduleService.updateModuleActivation).toHaveBeenCalledTimes(1);
    expect(moduleService.updateModuleActivation).toHaveBeenCalledWith(
      "mod-a",
      "guild-2",
      "2.0.0"
    );
  });

  it("skips guilds the bot can no longer reach and updates the others", async () => {
    const fetchingClient = {
      ...client,
      guilds: {
        fetch: async (id: string) => {
          if (id === "guild-1") throw new Error("Unknown Guild");
          return fakeGuild(id);
        },
      },
    } as unknown as Client;

    await checkCommandsForVersionChange(fetchingClient, versionedModule());

    expect(moduleService.updateModuleActivation).toHaveBeenCalledTimes(1);
    expect(moduleService.updateModuleActivation).toHaveBeenCalledWith(
      "mod-a",
      "guild-2",
      "2.0.0"
    );
  });
});

describe("uninstallModule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(moduleService.getModuleStateIn).mockResolvedValue({
      activated: true,
    } as never);
  });

  it("keeps commands and DB state when onUninstall throws", async () => {
    const guild = fakeGuild("guild-1");
    const fetchCommands = vi.spyOn(guild.commands, "fetch");
    const module = {
      ...fakeModule("mod-a", ["alpha"]),
      onUninstall: () => {
        throw new Error("hook blew up");
      },
    } as unknown as Module;

    await expect(uninstallModule(module, guild)).rejects.toThrow(
      "hook blew up"
    );
    expect(fetchCommands).not.toHaveBeenCalled();
    expect(moduleService.disableModule).not.toHaveBeenCalled();
  });
});
