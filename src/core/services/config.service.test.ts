import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";

vi.mock("#index.js", () => ({
  modules: [],
  client: { guilds: { fetch: vi.fn() } },
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

const module = { id: "core", config: {} } as unknown as Module;

beforeEach(() => {
  rows.clear();
  writes.count = 0;
});

describe("ConfigService on a guild without stored configuration", () => {
  it("creates the configuration once when it is read concurrently", async () => {
    await expect(
      Promise.all([
        configService.getConfigForModuleIn(module, "new-guild"),
        configService.getConfigForModuleIn(module, "new-guild"),
      ])
    ).resolves.toHaveLength(2);

    expect(writes.count).toBe(1);
    expect(rows.has("new-guild")).toBe(true);
  });

  it("does not fail when another process created the row in the meantime", async () => {
    const first = configService.getConfigForModuleIn(module, "racing-guild");
    rows.set("racing-guild", { core: { locale: "fr" } });

    const provider = await first;

    expect(provider.locale).toBe("fr");
  });
});
