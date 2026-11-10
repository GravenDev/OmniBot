import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchNotReadyError } from "#lib/discord-polyfills/guild-message-search.js";
import { initTestI18n, makeTestConfig, silenceLogs } from "#lib/testing.js";
import en from "../i18n/en.json" with { type: "json" };
import fr from "../i18n/fr.json" with { type: "json" };
import { seniorityConfigSchema } from "../seniority.config.js";

const overrides = vi.hoisted(() => ({ recompute: vi.fn() }));
vi.mock("../services/overrides.js", () => overrides);
vi.mock("#core/utils/require-admin.js", () => ({
  requireAdmin: async () => true,
}));

const { default: command } = await import("./seniority-admin.command.js");

beforeAll(async () => {
  silenceLogs();
  await initTestI18n("seniority", { en, fr });
});

beforeEach(() => {
  vi.clearAllMocks();
});

const JOINED = new Date("2024-06-01T10:00:00Z");

function interaction({
  bot = false,
  member = { joinedAt: JOINED } as unknown,
  fetchError = null as Error | null,
} = {}) {
  const editReply = vi.fn();
  return {
    editReply,
    value: {
      inCachedGuild: () => true,
      guildId: "g",
      user: { id: "admin" },
      client: { rest: "rest" },
      options: { getUser: () => ({ id: "u", bot }) },
      guild: {
        members: {
          fetch: async () => {
            if (fetchError) {
              throw fetchError;
            }
            if (!member) {
              throw new DiscordAPIError(
                { code: RESTJSONErrorCodes.UnknownMember, message: "" },
                RESTJSONErrorCodes.UnknownMember,
                404,
                "GET",
                "/",
                {}
              );
            }
            return member;
          },
        },
      },
      deferReply: vi.fn(),
      editReply,
    } as never,
  };
}

const config = () =>
  makeTestConfig(
    "seniority",
    seniorityConfigSchema,
    { timeZone: "Europe/Paris" },
    "fr"
  );

const content = (editReply: ReturnType<typeof vi.fn>) =>
  (editReply.mock.calls[0]![0] as { content: string }).content;

describe("/seniority-admin recompute", () => {
  it("tells the date seniority now counts from, and the arrival", async () => {
    overrides.recompute.mockResolvedValue({
      since: new Date("2020-03-15T08:30:00Z"),
      corrected: true,
    });
    const { value, editReply } = interaction();
    await command.execute(value, config());
    expect(overrides.recompute).toHaveBeenCalledWith(
      "rest",
      "g",
      "u",
      JOINED,
      expect.any(Number)
    );
    expect(content(editReply)).toBe(
      "L'ancienneté de <@u> part désormais du 15 mars 2020, avant son arrivée actuelle du 1er juin 2024. Ses prochaines fêtes d'ancienneté en tiennent compte."
    );
  });

  it("keeps the arrival when no message is older", async () => {
    overrides.recompute.mockResolvedValue({ since: JOINED, corrected: false });
    const { value, editReply } = interaction();
    await command.execute(value, config());
    expect(content(editReply)).toContain(
      "part de son arrivée, le 1er juin 2024"
    );
  });

  it("only recomputes a present member, never a bot", async () => {
    for (const options of [{ member: null }, { bot: true }]) {
      const { value, editReply } = interaction(options);
      await command.execute(value, config());
      expect(content(editReply)).toMatch(/n'est pas membre|bots ne sont pas/);
    }
    expect(overrides.recompute).not.toHaveBeenCalled();
  });

  it("does not take a Discord failure for a member who left", async () => {
    const { value, editReply } = interaction({
      fetchError: new Error("503 Service Unavailable"),
    });
    await command.execute(value, config());
    expect(content(editReply)).toContain("a échoué");
    expect(overrides.recompute).not.toHaveBeenCalled();
  });

  it("does not blame the search for a refused member lookup", async () => {
    const { value, editReply } = interaction({
      fetchError: new DiscordAPIError(
        { code: RESTJSONErrorCodes.MissingAccess, message: "" },
        RESTJSONErrorCodes.MissingAccess,
        403,
        "GET",
        "/",
        {}
      ),
    });
    await command.execute(value, config());
    expect(content(editReply)).toContain("a échoué");
    expect(overrides.recompute).not.toHaveBeenCalled();
  });

  it("says an older message may still be indexed", async () => {
    overrides.recompute.mockResolvedValue({
      since: new Date("2020-03-15T08:30:00Z"),
      corrected: true,
      partial: true,
    });
    const { value, editReply } = interaction();
    await command.execute(value, config());
    expect(content(editReply)).toContain("part désormais du 15 mars 2020");
    expect(content(editReply)).toContain("historique ancien");
  });

  it("says when Discord refuses the search, which no retry fixes", async () => {
    overrides.recompute.mockRejectedValue(
      new DiscordAPIError(
        { code: RESTJSONErrorCodes.MissingAccess, message: "" },
        RESTJSONErrorCodes.MissingAccess,
        403,
        "GET",
        "/",
        {}
      )
    );
    const { value, editReply } = interaction();
    await command.execute(value, config());
    expect(content(editReply)).toContain("Message Content");
  });

  it("asks to retry while Discord indexes the guild", async () => {
    overrides.recompute.mockRejectedValue(new SearchNotReadyError());
    const { value, editReply } = interaction();
    await command.execute(value, config());
    expect(content(editReply)).toContain("indexe encore");
  });

  it("says so when the search fails", async () => {
    overrides.recompute.mockRejectedValue(new Error("403"));
    const { value, editReply } = interaction();
    await command.execute(value, config());
    expect(content(editReply)).toContain("a échoué");
  });
});
