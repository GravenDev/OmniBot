import type { ButtonInteraction } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  account: vi.fn(),
  unregister: vi.fn(),
}));

vi.mock("#lib/logger.js", () => {
  const logger = { info: vi.fn(), warn: vi.fn() };
  return { loggerMaker: () => logger };
});
vi.mock("#modules/rngdle/services/store.js", () => ({
  default: { account: mocks.account, unregister: mocks.unregister },
}));
vi.mock("#modules/rngdle/services/sync.js", () => ({
  default: {
    exclusive: async (_guildId: string, task: () => Promise<unknown>) => {
      mocks.order.push("queue");
      return task();
    },
  },
}));

const { default: handler, unlinkConfirmMessage } =
  await import("./unlink-confirm.button.js");

const config = {
  t: (key: string) => key,
} as unknown as Parameters<typeof handler.execute>[2];

function click(userId: string) {
  return {
    guildId: "guild",
    inGuild: () => true,
    user: { id: userId },
    reply: vi.fn(),
    update: vi.fn(),
    deferUpdate: vi.fn(async () => mocks.order.push("defer")),
    editReply: vi.fn(async () => mocks.order.push("edit")),
  };
}

async function run(interaction: ReturnType<typeof click>, args: string[]) {
  await handler.execute(
    interaction as unknown as ButtonInteraction,
    args,
    config
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.length = 0;
  mocks.account.mockResolvedValue({
    guildId: "guild",
    userId: "user",
    username: "Alice",
  });
  mocks.unregister.mockImplementation(async () => {
    mocks.order.push("unregister");
    return true;
  });
});

describe("unlinkConfirmMessage", () => {
  it("carries the user id in both buttons, confirm in red", () => {
    const [row] = unlinkConfirmMessage(
      (key) => key,
      "user",
      "Alice"
    ).components;
    const [confirm, cancel] = row!.toJSON().components as {
      custom_id: string;
      style: number;
    }[];
    expect(confirm).toMatchObject({
      custom_id: "rngdle-unlink:confirm:user:2bd806c9",
      style: 4,
    });
    expect(cancel).toMatchObject({ custom_id: "rngdle-unlink:cancel:user" });
  });
});

describe("rngdle-unlink button", () => {
  it("is open to everyone and only reacts to buttons", () => {
    expect(handler.customId).toBe("rngdle-unlink");
    expect(handler.access).toBe("everyone");
  });

  it("unlinks the clicking user under the guild's sync queue", async () => {
    const interaction = click("user");
    await run(interaction, ["confirm", "user", "2bd806c9"]);

    expect(mocks.order).toEqual(["defer", "queue", "unregister", "edit"]);
    expect(mocks.unregister).toHaveBeenCalledWith("guild", "user");
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "unlink.done",
      components: [],
    });
  });

  it("keeps an account linked after the confirmation was shown", async () => {
    mocks.account.mockResolvedValue({
      guildId: "guild",
      userId: "user",
      username: "Bob",
    });
    const interaction = click("user");
    await run(interaction, ["confirm", "user", "2bd806c9"]);

    expect(mocks.unregister).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "unlink.stale",
      components: [],
    });
  });

  it("says so when the account was already gone", async () => {
    mocks.account.mockResolvedValue(null);
    const interaction = click("user");
    await run(interaction, ["confirm", "user", "2bd806c9"]);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "unlink.none",
      components: [],
    });
  });

  it("keeps the account on cancel", async () => {
    const interaction = click("user");
    await run(interaction, ["cancel", "user"]);

    expect(mocks.unregister).not.toHaveBeenCalled();
    expect(interaction.update).toHaveBeenCalledWith({
      content: "unlink.cancelled",
      components: [],
    });
  });

  it.each([["someone-else"], [undefined]])(
    "refuses a click from another user (button for %s)",
    async (owner) => {
      const interaction = click("user");
      await run(interaction, owner ? ["confirm", owner] : ["confirm"]);

      expect(mocks.unregister).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: "unlink.notYours" })
      );
    }
  );
});
