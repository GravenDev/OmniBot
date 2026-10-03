import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigType } from "#lib/config.js";
import type { Module } from "#lib/module.js";

const { guildsFetch, channelsFetch } = vi.hoisted(() => ({
  guildsFetch: vi.fn(),
  channelsFetch: vi.fn(),
}));
vi.mock("#index.js", () => ({
  modules: [],
  client: { users: { fetch: vi.fn() }, guilds: { fetch: guildsFetch } },
}));
vi.mock("#core/core.module.js", () => ({
  default: { id: "core", config: {} },
}));

const rows = vi.hoisted(() => new Map<string, unknown>());
const writes = vi.hoisted(() => ({ count: 0 }));

vi.mock("#lib/database.js", () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
  return {
    default: {
      guildConfiguration: {
        async findUnique({ where }: { where: { guildId: string } }) {
          const data = rows.get(where.guildId);
          await settle();
          return data === undefined ? null : { guildId: where.guildId, data };
        },
        async create({ data }: { data: { guildId: string; data: unknown } }) {
          await settle();
          writes.count++;
          if (rows.has(data.guildId)) {
            throw Object.assign(new Error("Unique constraint failed"), {
              code: "P2002",
            });
          }
          rows.set(data.guildId, data.data);
          return data;
        },
        async upsert({
          where,
          create,
        }: {
          where: { guildId: string };
          create: { guildId: string; data: unknown };
          update: unknown;
        }) {
          await settle();
          writes.count++;
          if (!rows.has(where.guildId)) {
            rows.set(where.guildId, create.data);
          }
          return { guildId: where.guildId, data: rows.get(where.guildId) };
        },
      },
    },
  };
});

const { default: configService } = await import("./config.service.js");
const { modules } = await import("#index.js");

const coreModule = { id: "core", config: {} } as unknown as Module;

beforeEach(() => {
  rows.clear();
  writes.count = 0;
});

describe("ConfigService on a guild without stored configuration", () => {
  it("creates the configuration once when it is read concurrently", async () => {
    await expect(
      Promise.all([
        configService.getConfigForModuleIn(coreModule, "new-guild"),
        configService.getConfigForModuleIn(coreModule, "new-guild"),
      ])
    ).resolves.toHaveLength(2);

    expect(writes.count).toBe(1);
    expect(rows.has("new-guild")).toBe(true);
  });

  it("does not fail when another process created the row in the meantime", async () => {
    const first = configService.getConfigForModuleIn(
      coreModule,
      "racing-guild"
    );
    rows.set("racing-guild", { core: { locale: "fr" } });

    const provider = await first;

    expect(provider.locale).toBe("fr");
  });
});

const channelModule = {
  id: "mod-a",
  config: {
    channels: {
      name: "Channels",
      description: "Watched channels",
      type: [ConfigType.CHANNEL],
    },
  },
} as unknown as Module;

describe("getConfigForModuleIn", () => {
  beforeEach(() => {
    (modules as unknown as Module[]).push(channelModule);
    rows.set("guild-1", {
      "mod-a": { channels: ["chan-1", "chan-gone"] },
      core: {},
    });
    guildsFetch.mockResolvedValue({ channels: { fetch: channelsFetch } });
    channelsFetch.mockImplementation(async (id: string) => {
      if (id === "chan-gone") throw new Error("Unknown Channel");
      return { id };
    });
  });

  afterEach(() => {
    modules.length = 0;
  });

  it("drops deserialized entities that vanished instead of returning null", async () => {
    const config = await configService.getConfigForModuleIn(
      channelModule,
      "guild-1"
    );

    expect(config.get("channels")).toEqual([{ id: "chan-1" }]);
  });
});

describe("concurrent config writes", () => {
  const moduleA = { id: "mod-a", config: {} } as unknown as Module;
  const moduleB = { id: "mod-b", config: {} } as unknown as Module;

  beforeEach(() => {
    (modules as unknown as Module[]).push(moduleA, moduleB);
    rows.set("guild-w", { "mod-a": {}, "mod-b": {}, core: {} });
    guildsFetch.mockResolvedValue({ channels: { fetch: channelsFetch } });
  });

  afterEach(() => {
    modules.length = 0;
  });

  it("keeps both saves when two modules are updated at the same time", async () => {
    await configService.getFullConfigForGuild("guild-w");

    await Promise.all([
      configService.updateConfigForModuleIn(moduleA, "guild-w", {
        x: 1,
      } as never),
      configService.updateConfigForModuleIn(moduleB, "guild-w", {
        y: 2,
      } as never),
    ]);

    const full = await configService.getFullConfigForGuild("guild-w");
    expect(full["mod-a"]).toEqual({ x: 1 });
    expect(full["mod-b"]).toEqual({ y: 2 });
  });
});
