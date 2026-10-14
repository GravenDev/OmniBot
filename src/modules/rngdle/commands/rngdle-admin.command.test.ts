import type { ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import type { RngdleConfigSchema } from "#modules/rngdle/rngdle.config.js";

const order = vi.hoisted(() => [] as string[]);
const linkAccount = vi.hoisted(() => vi.fn());

vi.mock("#lib/logger.js", () => {
  const logger = { info: vi.fn(), warn: vi.fn() };
  return { loggerMaker: () => logger };
});
vi.mock("#core/utils/require-admin.js", () => ({
  requireAdmin: async () => true,
}));
vi.mock("#modules/rngdle/services/store.service.js", () => ({
  default: {
    unregister: async () => {
      order.push("unregister");
      return true;
    },
  },
}));
vi.mock("#modules/rngdle/services/sync.service.js", () => ({
  default: {
    exclusive: async (_guildId: string, task: () => Promise<unknown>) => {
      order.push("queue");
      return task();
    },
  },
  FullSyncCooldownError: class extends Error {},
}));
vi.mock("#modules/rngdle/services/linking.service.js", () => ({
  default: { linkAccount },
}));

const { default: command } = await import("./rngdle-admin.command.js");

describe("/rngdle-admin delete", () => {
  it("defers the reply before waiting for the guild's sync queue", async () => {
    const interaction = {
      guildId: "guild",
      inGuild: () => true,
      user: { id: "admin" },
      options: {
        getSubcommand: () => "delete",
        getUser: () => ({ id: "member" }),
      },
      deferReply: vi.fn(async () => order.push("defer")),
      editReply: vi.fn(async () => order.push("edit")),
      reply: vi.fn(),
    };
    const config = {
      t: (key: string) => key,
    } as unknown as ConfigProvider<RngdleConfigSchema>;

    await command.execute(
      interaction as unknown as ChatInputCommandInteraction,
      config
    );

    expect(order).toEqual(["defer", "queue", "unregister", "edit"]);
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: "admin.delete.done" })
    );
  });
});

describe("/rngdle-admin register", () => {
  const config = {
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  } as unknown as ConfigProvider<RngdleConfigSchema>;

  function registerInteraction() {
    return {
      guildId: "guild",
      inGuild: () => true,
      user: { id: "admin" },
      options: {
        getSubcommand: () => "register",
        getUser: () => ({ id: "member" }),
        getString: () => " Alice ",
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
      reply: vi.fn(),
    };
  }

  it.each([
    [
      { kind: "created", count: 4 },
      {
        content:
          'admin.register.created {"user":"<@member>","username":"Alice","count":4}',
        allowedMentions: { parse: [] },
      },
    ],
    [
      { kind: "conflict", userId: "holder" },
      {
        content:
          'admin.register.conflict {"username":"Alice","user":"<@holder>"}',
        allowedMentions: { parse: [] },
      },
    ],
    [{ kind: "notFound" }, 'admin.register.notFound {"username":"Alice"}'],
    [
      { kind: "unreachable" },
      'admin.register.unreachable {"username":"Alice"}',
    ],
  ])(
    "links the member through the linking service (%o)",
    async (outcome, reply) => {
      linkAccount.mockResolvedValue(outcome);
      const interaction = registerInteraction();

      await command.execute(
        interaction as unknown as ChatInputCommandInteraction,
        config
      );

      expect(linkAccount).toHaveBeenCalledWith("guild", "member", "Alice");
      expect(interaction.editReply).toHaveBeenCalledWith(reply);
    }
  );
});
