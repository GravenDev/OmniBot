import { MessageFlags, type ButtonInteraction } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initTestI18n,
  makeTestConfig,
  messageText,
  silenceLogs,
} from "#lib/testing.js";
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

type Reply = {
  content?: string;
  flags?: number;
  components: { toJSON(): unknown }[];
};
const replyOf = (editReply: ReturnType<typeof vi.fn>) =>
  (editReply.mock.calls[0] as [Reply])[0];
// The button sits beside the date, in the sheet's section.
const buttonId = (reply: Reply) =>
  JSON.stringify(reply.components[0]!.toJSON()).match(
    /"custom_id":"([^"]+)"/
  )![1];

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
    expect(messageText(reply)).toContain("Non annoncé");
    // Laid out with components, as the reply it edits.
    expect(reply.flags).toBe(MessageFlags.IsComponentsV2);
    // A reply sent before the sheets had content: the edit clears it.
    expect(reply.content).toBe("");
    expect(buttonId(reply)).toBe("birthday-announce:on");
    expect(messageText(reply)).toContain("Votre anniversaire");
  });

  it("keeps the title of the /birthday set sheet it edits", async () => {
    service.list.mockResolvedValue([
      { userId: "me", day: 14, month: 3, announce: true },
    ]);
    const { interaction, editReply } = click();
    await button.execute(interaction, ["off", "set"], config());
    const reply = replyOf(editReply);
    expect(messageText(reply)).toContain("Anniversaire enregistré");
    expect(buttonId(reply)).toBe("birthday-announce:on:set");
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
    const reply = replyOf(editReply);
    expect(messageText(reply)).toBe(
      "Vous n'avez pas enregistré votre anniversaire sur ce serveur."
    );
    // An edit of a sheet must stay one: Discord refuses plain content there.
    expect(reply.flags).toBe(MessageFlags.IsComponentsV2);
    expect(reply.content).toBe("");
  });
});
