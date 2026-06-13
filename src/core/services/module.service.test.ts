import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Module } from "../../lib/module.js";

// The service pulls `client`/`modules` from the bot entrypoint and the Prisma
// client; stub both so importing it never boots the bot or hits a database.
vi.mock("../../index.js", () => ({ modules: [], client: {} }));

const { findMany, update } = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
}));
vi.mock("../../lib/database.js", () => ({
  default: { moduleActivation: { findMany, update } },
  Prisma: {},
}));

const { default: moduleService } = await import("./module.service.js");

const module = { id: "thread-creator", version: "2.0.0" } as unknown as Module;

describe("reconcileActivatedVersions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue(undefined);
  });

  it("bumps activatedVersion to the live version for every drifted guild", async () => {
    findMany.mockResolvedValue([
      { guildId: "guild-a", activatedVersion: "1.0.0" },
      { guildId: "guild-b", activatedVersion: "1.5.0" },
    ]);

    await moduleService.reconcileActivatedVersions(module);

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith({
      where: {
        moduleId_guildId: { moduleId: "thread-creator", guildId: "guild-a" },
      },
      data: { activatedVersion: "2.0.0" },
    });
    expect(update).toHaveBeenCalledWith({
      where: {
        moduleId_guildId: { moduleId: "thread-creator", guildId: "guild-b" },
      },
      data: { activatedVersion: "2.0.0" },
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

    expect(update).not.toHaveBeenCalled();
  });
});
