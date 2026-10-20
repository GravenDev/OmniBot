import type { ButtonInteraction } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  historyCard: vi.fn(),
}));

vi.mock("#modules/rngdle/services/store.js", () => ({
  default: { account: mocks.account },
}));
vi.mock("#modules/rngdle/services/views.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  historyCard: mocks.historyCard,
}));

const { default: handler } = await import("./history-page.button.js");

const t = ((key: string) => key) as ConfigProvider<{}>["t"];
const bob = { guildId: "guild", userId: "bob", username: "Bob" };

async function click(args: string[]) {
  const interaction = {
    inGuild: () => true,
    guildId: "guild",
    client: {},
    user: { id: "caller" },
    deferReply: vi.fn(),
    deferUpdate: vi.fn(),
    editReply: vi.fn(),
  };
  const config = { t, locale: "en" } as unknown as ConfigProvider<{}>;
  await handler.execute(
    interaction as unknown as ButtonInteraction,
    args,
    config
  );
  return interaction;
}

const customIds = (interaction: Awaited<ReturnType<typeof click>>) => {
  const [reply] = interaction.editReply.mock.calls[0]! as [
    { components: { toJSON(): { components: { custom_id?: string }[] } }[] },
  ];
  return reply.components.flatMap((row) =>
    row.toJSON().components.map((button) => button.custom_id)
  );
};

beforeEach(() => {
  mocks.account.mockReset().mockResolvedValue(bob);
  mocks.historyCard.mockReset().mockResolvedValue({
    image: Buffer.from("png"),
    page: 2,
    pageCount: 3,
  });
});

describe("history page button", () => {
  it("opens a private copy of a public history on the requested page", async () => {
    const interaction = await click(["2", "bob", "15", "public", "20745"]);

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
    expect(interaction.deferUpdate).not.toHaveBeenCalled();
    expect(mocks.account).toHaveBeenCalledWith("guild", "bob");
    expect(mocks.historyCard).toHaveBeenCalledWith(
      expect.anything(),
      bob,
      15,
      new Date(20745 * 86_400_000),
      2
    );
    expect(customIds(interaction).slice(0, 3)).toEqual([
      "rngdle-history:1:bob:15:private:20745",
      "rngdle-history:indicator:bob:15:private:20745",
      "rngdle-history:3:bob:15:private:20745",
    ]);
  });

  it("updates a private history in place, with the default count", async () => {
    const interaction = await click(["3", "bob", "", "private", "20745"]);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(mocks.historyCard).toHaveBeenCalledWith(
      expect.anything(),
      bob,
      undefined,
      expect.any(Date),
      3
    );
  });

  it("clears the previous image when the player has unlinked since", async () => {
    mocks.account.mockResolvedValue(null);

    const interaction = await click(["2", "caller", "", "private", "20745"]);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "profile.notRegisteredSelf",
      files: [],
      attachments: [],
      components: [],
    });
  });

  it("ignores a malformed page", async () => {
    const interaction = await click(["indicator", "bob", "", "private", "1"]);

    expect(interaction.deferUpdate).not.toHaveBeenCalled();
    expect(mocks.historyCard).not.toHaveBeenCalled();
  });
});
