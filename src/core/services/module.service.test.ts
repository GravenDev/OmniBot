import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";

// The service pulls `client`/`modules` from the bot entrypoint and the Prisma
// client; stub both so importing it never boots the bot or hits a database.
vi.mock("#core/context.js", () => ({ modules: [], client: {} }));

const { findMany, findFirst, upsert } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("#lib/database.js", () => ({
  default: { moduleActivation: { findMany, findFirst, upsert } },
  Prisma: {},
}));

const { default: moduleService } = await import("./module.service.js");
const { modules } = await import("#core/context.js");

const module = { id: "thread-creator", version: "2.0.0" } as unknown as Module;

describe("reconcileActivatedVersions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsert.mockResolvedValue(undefined);
  });

  it("bumps activatedVersion to the live version for every drifted guild", async () => {
    findMany.mockResolvedValue([
      { guildId: "guild-a", activatedVersion: "1.0.0" },
      { guildId: "guild-b", activatedVersion: "1.5.0" },
    ]);

    await moduleService.reconcileActivatedVersions(module);

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith({
      where: {
        moduleId_guildId: { moduleId: "thread-creator", guildId: "guild-a" },
      },
      create: {
        moduleId: "thread-creator",
        guildId: "guild-a",
        activated: true,
        activatedVersion: "2.0.0",
      },
      update: { activatedVersion: "2.0.0" },
    });
    expect(upsert).toHaveBeenCalledWith({
      where: {
        moduleId_guildId: { moduleId: "thread-creator", guildId: "guild-b" },
      },
      create: {
        moduleId: "thread-creator",
        guildId: "guild-b",
        activated: true,
        activatedVersion: "2.0.0",
      },
      update: { activatedVersion: "2.0.0" },
    });
  });

  it("only queries activated guilds whose version differs from the live one", async () => {
    findMany.mockResolvedValue([]);

    await moduleService.reconcileActivatedVersions(module);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          moduleId: "thread-creator",
          activated: true,
          activatedVersion: { not: "2.0.0" },
        }),
      })
    );
  });

  it("writes nothing when no guild has drifted", async () => {
    findMany.mockResolvedValue([]);

    await moduleService.reconcileActivatedVersions(module);

    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("getActivatedGuildIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists the guilds where the module is activated", async () => {
    findMany.mockResolvedValue([
      { guildId: "guild-a" },
      { guildId: "guild-b" },
    ]);

    expect(await moduleService.getActivatedGuildIds("four-hour-game")).toEqual([
      "guild-a",
      "guild-b",
    ]);
    expect(findMany).toHaveBeenCalledWith({
      select: { guildId: true },
      where: { moduleId: "four-hour-game", activated: true },
    });
  });
});

describe("module state cache", () => {
  const guild = { id: "guild-1" } as never;

  beforeEach(() => {
    vi.clearAllMocks();
    moduleService.clearStateCache();
    upsert.mockResolvedValue(undefined);
    findFirst.mockResolvedValue({
      moduleId: "mod-x",
      guildId: "guild-1",
      activated: true,
    });
    (modules as unknown as Module[]).push({
      id: "mod-x",
      version: "1.0.0",
      registry: {},
    } as unknown as Module);
  });

  afterEach(() => {
    modules.length = 0;
  });

  it("queries the database once for repeated reads", async () => {
    await moduleService.getModuleStateFromGuildIdIn("mod-x", "guild-1");
    await moduleService.getModuleStateFromGuildIdIn("mod-x", "guild-1");

    expect(findFirst).toHaveBeenCalledOnce();
  });

  it("re-reads the database after the module is disabled", async () => {
    await moduleService.getModuleStateFromGuildIdIn("mod-x", "guild-1");
    findFirst.mockResolvedValue({
      moduleId: "mod-x",
      guildId: "guild-1",
      activated: false,
    });

    await moduleService.disableModule("mod-x", guild);
    const state = await moduleService.getModuleStateFromGuildIdIn(
      "mod-x",
      "guild-1"
    );

    expect(state.activated).toBe(false);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed read in cache", async () => {
    findFirst.mockRejectedValueOnce(new Error("db down"));

    await expect(
      moduleService.getModuleStateFromGuildIdIn("mod-x", "guild-1")
    ).rejects.toThrow("db down");
    const state = await moduleService.getModuleStateFromGuildIdIn(
      "mod-x",
      "guild-1"
    );

    expect(state.activated).toBe(true);
  });
});
