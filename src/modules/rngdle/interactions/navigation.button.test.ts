import type { ButtonInteraction } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  profileCard: vi.fn(),
  overallPage: vi.fn(),
  refreshIfStale: vi.fn(),
}));

vi.mock("#modules/rngdle/services/store.js", () => ({
  default: { account: mocks.account },
}));
vi.mock("#modules/rngdle/services/sync.js", () => ({
  default: { refreshIfStale: mocks.refreshIfStale },
}));
vi.mock("#modules/rngdle/services/views.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  profileCard: mocks.profileCard,
  overallPage: mocks.overallPage,
}));

const { default: handler, navigationRow } =
  await import("./navigation.button.js");

const t = ((key: string) => key) as Parameters<typeof navigationRow>[0];

async function click(target: string) {
  const interaction = {
    inGuild: () => true,
    guildId: "guild",
    client: {},
    user: { id: "caller" },
    deferReply: vi.fn(),
    editReply: vi.fn(),
  };
  const config = { t, locale: "en" } as unknown as ConfigProvider<{}>;
  await handler.execute(
    interaction as unknown as ButtonInteraction,
    [target],
    config
  );
  return interaction;
}

beforeEach(() => {
  mocks.account.mockReset().mockResolvedValue(null);
  mocks.profileCard.mockReset().mockResolvedValue(Buffer.from("png"));
  mocks.overallPage.mockReset().mockResolvedValue({
    image: Buffer.from("png"),
    page: 1,
    pageCount: 1,
  });
});

describe("navigationRow", () => {
  it("builds one button per target", () => {
    expect(
      navigationRow(t, ["profile", "overall"])
        .toJSON()
        .components.map((button) => [
          "custom_id" in button && button.custom_id,
          "label" in button && button.label,
        ])
    ).toEqual([
      ["rngdle-nav:profile", "nav.profile"],
      ["rngdle-nav:overall", "nav.overall"],
    ]);
  });
});

describe("navigation button", () => {
  it("tells an unlinked member privately how to link their account", async () => {
    const interaction = await click("profile");

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
    expect(mocks.account).toHaveBeenCalledWith("guild", "caller");
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "profile.notRegisteredSelf",
    });
  });

  it("shows the caller's own profile card", async () => {
    mocks.account.mockResolvedValue({
      guildId: "guild",
      userId: "caller",
      username: "Lucky",
    });

    const interaction = await click("profile");

    const [reply] = interaction.editReply.mock.calls[0]! as [
      {
        files: { name: string }[];
        components: { toJSON(): { components: { custom_id?: string }[] } }[];
      },
    ];
    expect(reply.files[0]!.name).toBe("profile-Lucky.png");
    expect(
      reply.components.flatMap((row) =>
        row.toJSON().components.map((button) => button.custom_id)
      )
    ).toEqual(["rngdle-nav:overall"]);
  });

  it("refreshes the guild's rolls before answering", async () => {
    await click("overall");

    expect(mocks.refreshIfStale).toHaveBeenCalledWith("guild");
  });

  it("opens the all-time leaderboard on page 1 for the caller", async () => {
    await click("overall");

    expect(mocks.overallPage).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "caller",
      "all"
    );
  });

  it("ignores unknown targets", async () => {
    const interaction = await click("nope");

    expect(interaction.deferReply).not.toHaveBeenCalled();
  });
});
