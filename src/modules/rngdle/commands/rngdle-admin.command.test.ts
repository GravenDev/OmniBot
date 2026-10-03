import type { ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import type { RngdleConfigSchema } from "#modules/rngdle/rngdle.config.js";

const order = vi.hoisted(() => [] as string[]);

vi.mock("#core/utils/require-admin.js", () => ({
  requireAdmin: async () => true,
}));
vi.mock("#modules/rngdle/services/store.js", () => ({
  default: {
    unregister: async () => {
      order.push("unregister");
      return true;
    },
  },
}));
vi.mock("#modules/rngdle/services/sync.js", () => ({
  default: {
    exclusive: async (_guildId: string, task: () => Promise<unknown>) => {
      order.push("queue");
      return task();
    },
  },
  FullSyncCooldownError: class extends Error {},
}));
vi.mock("#modules/rngdle/services/api.js", () => ({
  fetchUserRolls: vi.fn(),
  RngdleUserNotFoundError: class extends Error {},
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
