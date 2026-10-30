import {
  MessageFlags,
  PermissionFlagsBits,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import type { ServerStatsConfigSchema } from "#modules/server-stats/server-stats.config.js";

const mocks = vi.hoisted(() => ({
  startedAt: vi.fn(),
  statsReport: vi.fn(),
}));
vi.mock("#modules/server-stats/services/store.js", () => ({
  default: { startedAt: mocks.startedAt },
}));
vi.mock("#modules/server-stats/services/views.js", () => ({
  statsReport: mocks.statsReport,
}));

const { default: command } = await import("./server-stats.command.js");

// Friday 30 October 2026, 14:32 in Paris.
const now = new Date("2026-10-30T13:32:00Z");
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const guild = { id: "guild-1" };

const config = {
  get: (key: string) => (key === "showTopMembers" ? false : undefined),
  t: (key: string, options?: Record<string, unknown>) =>
    options ? `${key} ${JSON.stringify(options)}` : key,
  locale: "fr",
} as unknown as ConfigProvider<ServerStatsConfigSchema>;

function run(
  subcommand: string,
  options: Record<string, string | number> = {}
) {
  const interaction = {
    inGuild: () => true,
    guildId: "guild-1",
    guild,
    options: {
      getSubcommand: () => subcommand,
      getString: (name: string) => options[name] ?? null,
      getInteger: (name: string) => options[name] ?? null,
    },
    reply: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
  };
  return {
    interaction,
    done: command.execute(
      interaction as unknown as ChatInputCommandInteraction,
      config
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now });
  mocks.startedAt.mockResolvedValue(new Date("2026-10-01T10:00:00Z"));
  mocks.statsReport.mockResolvedValue({
    content: "Server stats",
    image: Buffer.from("png"),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("/server-stats access", () => {
  it("is for administrators, checked by the dispatcher too", () => {
    expect(command.requiresAdmin).toBe(true);
    expect(command.data.toJSON()).toMatchObject({
      default_member_permissions: String(PermissionFlagsBits.Administrator),
    });
  });
});

describe("/server-stats", () => {
  it("shows today so far, to the admin only, without pinging anyone", async () => {
    const { interaction, done } = run("today");
    await done;

    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(mocks.statsReport).toHaveBeenCalledWith(
      guild,
      { from: day("2026-10-30"), to: day("2026-10-30") },
      { now, showTopMembers: false, t: config.t, locale: "fr" }
    );
    const [reply] = interaction.editReply.mock.calls[0]!;
    expect(reply.content).toBe("Server stats");
    expect(reply.files[0]).toMatchObject({ name: "server-stats.png" });
    expect(reply.allowedMentions).toEqual({ parse: [] });
  });

  it("shows a given day", async () => {
    const { done } = run("day", { date: "2026-10-12" });
    await done;
    expect(mocks.statsReport).toHaveBeenCalledWith(
      guild,
      { from: day("2026-10-12"), to: day("2026-10-12") },
      expect.anything()
    );
  });

  it("shows a period, from the day counting started", async () => {
    mocks.startedAt.mockResolvedValue(new Date("2026-10-25T08:00:00Z"));
    const { done } = run("period", { days: 7 });
    await done;
    expect(mocks.statsReport).toHaveBeenCalledWith(
      guild,
      { from: day("2026-10-25"), to: day("2026-10-29") },
      expect.anything()
    );
  });

  it("explains a date it cannot use, before deferring", async () => {
    const { interaction, done } = run("day", { date: "2026-09-01" });
    await done;

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'command.tooOld {"count":30,"date":"30 septembre 2026"}',
      allowedMentions: { parse: [] },
      flags: MessageFlags.Ephemeral,
    });
  });

  it("escapes the text it repeats", async () => {
    const { interaction, done } = run("day", { date: "**hier**" });
    await done;
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'command.invalidDate {"value":"\\\\*\\\\*hier\\\\*\\\\*"}',
      })
    );
  });

  it("refuses a number of days together with dates", async () => {
    const { interaction, done } = run("period", { days: 7, from: "20/10" });
    await done;
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: "command.daysAndDates" })
    );
  });

  it("says when counting started, for days before it", async () => {
    mocks.startedAt.mockResolvedValue(new Date("2026-10-29T23:30:00Z"));
    const { interaction, done } = run("day", { date: "2026-10-28" });
    await done;

    expect(mocks.statsReport).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'command.beforeStart {"date":"30 octobre 2026"}',
    });
  });

  it("says nothing was counted yet", async () => {
    mocks.startedAt.mockResolvedValue(null);
    const { interaction, done } = run("today");
    await done;
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "command.notStarted",
    });
  });
});

describe("/server-stats autocomplete", () => {
  async function complete(focused: string) {
    const respond = vi.fn();
    await command.complete!(
      {
        options: { getFocused: () => focused },
        respond,
      } as unknown as AutocompleteInteraction,
      config
    );
    return respond.mock.calls[0]![0] as { name: string; value: string }[];
  }

  it("lists the kept days, most recent first, within Discord's limit", async () => {
    const choices = await complete("");
    expect(choices).toHaveLength(25);
    expect(choices[0]).toEqual({
      name: 'command.today {"date":"vendredi 30 octobre 2026"}',
      value: "2026-10-30",
    });
    expect(choices[1]).toEqual({
      name: 'command.yesterday {"date":"jeudi 29 octobre 2026"}',
      value: "2026-10-29",
    });
  });

  it("finds a day by its name or as typed", async () => {
    expect((await complete("septembre")).map((choice) => choice.value)).toEqual(
      ["2026-09-30"]
    );
    expect((await complete("12/10")).map((choice) => choice.value)).toEqual([
      "2026-10-12",
    ]);
  });
});
