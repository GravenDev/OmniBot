import { type Client, Routes, SlashCommandBuilder } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Module } from "../../lib/module.js";

// Avoid booting the bot / Prisma when importing the command loader's module graph.
vi.mock("../../index.js", () => ({ modules: [], client: {} }));
vi.mock("../../lib/database.js", () => ({ default: {}, Prisma: {} }));

// Capture REST calls without any network I/O.
const { restPut } = vi.hoisted(() => ({ restPut: vi.fn() }));
vi.mock("discord.js", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("discord.js");
  class FakeREST {
    setToken() {
      return this;
    }
    put = restPut;
  }
  return { ...actual, REST: FakeREST };
});

vi.mock("../services/module.service.js", () => ({
  default: { getModuleStateFromGuildIdIn: vi.fn() },
}));

// Core module with a single known command so we can assert it is always included.
vi.mock("../core.module.js", () => ({
  default: {
    id: "core",
    registry: {
      commands: [{ data: { toJSON: () => ({ name: "core-cmd" }) } }],
    },
  },
}));

const { loadDevGuildCommands } = await import("./command-loader.js");
const { default: moduleService } =
  await import("../services/module.service.js");

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
} as unknown as Client;

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
