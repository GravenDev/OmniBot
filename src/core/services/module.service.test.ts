import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";

// The service pulls `client`/`modules` from the bot entrypoint and the Prisma
// client; stub both so importing it never boots the bot or hits a database.
vi.mock("#core/runtime.js", () => ({ modules: [], client: {} }));

const { findMany, upsert } = vi.hoisted(() => ({
  findMany: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("#lib/database.js", () => ({
  default: { moduleActivation: { findMany, upsert } },
  Prisma: {},
}));

const { default: moduleService } = await import("./module.service.js");
const { modules } = await import("#core/runtime.js");

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

describe("enableModule / disableModule hook ordering", () => {
  const guild = { id: "guild-1" } as never;
  const onInstall = vi.fn();
  const onUninstall = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks keeps implementations: drop them so one test's throwing
    // hook does not leak into the next.
    onInstall.mockReset();
    onUninstall.mockReset();
    upsert.mockResolvedValue(undefined);
    (modules as unknown as Module[]).push({
      id: "mod-x",
      version: "1.0.0",
      registry: {},
      onInstall,
      onUninstall,
    } as unknown as Module);
  });

  afterEach(() => {
    modules.length = 0;
  });

  it("does not mark the module enabled when onInstall throws", async () => {
    onInstall.mockImplementation(() => {
      throw new Error("hook blew up");
    });

    await expect(moduleService.enableModule("mod-x", guild)).rejects.toThrow(
      "hook blew up"
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it("runs onInstall before flipping the DB state", async () => {
    await moduleService.enableModule("mod-x", guild);

    expect(onInstall).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledOnce();
    expect(vi.mocked(onInstall).mock.invocationCallOrder[0]).toBeLessThan(
      upsert.mock.invocationCallOrder[0]
    );
  });

  it("does not mark the module disabled when onUninstall throws", async () => {
    onUninstall.mockImplementation(() => {
      throw new Error("hook blew up");
    });

    await expect(moduleService.disableModule("mod-x", guild)).rejects.toThrow(
      "hook blew up"
    );
    expect(upsert).not.toHaveBeenCalled();
  });
});
