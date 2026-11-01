import type { ButtonInteraction } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initTestI18n, makeTestConfig, silenceLogs } from "#lib/testing.js";
import { birthdayConfigSchema } from "#modules/birthday/birthday.config.js";
import en from "#modules/birthday/i18n/en.json" with { type: "json" };
import fr from "#modules/birthday/i18n/fr.json" with { type: "json" };

const service = vi.hoisted(() => ({ list: vi.fn(), set: vi.fn() }));
vi.mock("#modules/birthday/services/birthday.service.js", () => ({
  default: service,
}));
const dropBirthdayRole = vi.hoisted(() => vi.fn());
vi.mock("#modules/birthday/services/role.js", () => ({ dropBirthdayRole }));

const { default: button } = await import("./announce.button.js");

const config = () => makeTestConfig("birthday", birthdayConfigSchema, {}, "fr");

function click() {
  const editReply = vi.fn(async () => ({}));
  const interaction = {
    inGuild: () => true,
    inCachedGuild: () => true,
    guildId: "guild",
    guild: { members: { fetch: vi.fn(async () => new Map()) } },
    user: { id: "me" },
    deferUpdate: vi.fn(async () => ({})),
    editReply,
  } as unknown as ButtonInteraction;
  return { interaction, editReply };
}

type Reply = { content: string; components: { toJSON(): unknown }[] };
const replyOf = (editReply: ReturnType<typeof vi.fn>) =>
  (editReply.mock.calls[0] as [Reply])[0];
const buttonId = (reply: Reply) =>
  (reply.components[0]!.toJSON() as { components: { custom_id: string }[] })
    .components[0]!.custom_id;

beforeAll(async () => {
  silenceLogs();
  await initTestI18n("birthday", { en, fr });
});

beforeEach(() => {
  vi.clearAllMocks();
  dropBirthdayRole.mockResolvedValue(undefined);
});

describe("announce button", () => {
  it("hides an announced birthday and drops the role", async () => {
    service.list.mockResolvedValue([
      { userId: "me", day: 14, month: 3, announce: true },
    ]);
    const { interaction, editReply } = click();
    await button.execute(interaction, ["off"], config());

    expect(service.set).toHaveBeenCalledWith("guild", {
      userId: "me",
      day: 14,
      month: 3,
      announce: false,
    });
    expect(dropBirthdayRole).toHaveBeenCalledWith(
      expect.anything(),
      "guild",
      "me"
    );
    const reply = replyOf(editReply);
    expect(reply.content).toContain("Il n'est pas annoncé");
    expect(buttonId(reply)).toBe("birthday-announce:on");
  });

  it("announces a hidden birthday", async () => {
    service.list.mockResolvedValue([
      { userId: "me", day: 14, month: 3, announce: false },
    ]);
    const { interaction, editReply } = click();
    await button.execute(interaction, ["on"], config());

    expect(service.set).toHaveBeenCalledWith(
      "guild",
      expect.objectContaining({ announce: true })
    );
    expect(dropBirthdayRole).not.toHaveBeenCalled();
    expect(buttonId(replyOf(editReply))).toBe("birthday-announce:off");
  });

  it("writes nothing when the state already matches", async () => {
    service.list.mockResolvedValue([
      { userId: "me", day: 14, month: 3, announce: true },
    ]);
    const { interaction } = click();
    await button.execute(interaction, ["on"], config());
    expect(service.set).not.toHaveBeenCalled();
  });

  it("says so when the birthday was removed meanwhile", async () => {
    service.list.mockResolvedValue([]);
    const { interaction, editReply } = click();
    await button.execute(interaction, ["off"], config());
    expect(service.set).not.toHaveBeenCalled();
    expect(replyOf(editReply)).toMatchObject({
      content: "Vous n'avez pas enregistré votre anniversaire sur ce serveur.",
      components: [],
    });
  });
});
