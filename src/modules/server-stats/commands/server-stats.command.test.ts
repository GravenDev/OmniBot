import {
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField,
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

const guild = { id: "guild-1", channels: { cache: new Map() } };

const roles = (...ids: string[]) => ({
  cache: new Map(ids.map((id) => [id, {}])),
});

const allowedRoles = [{ id: "role-stats" }];

const config = {
  get: (key: string) =>
    key === "showTopMembers"
      ? false
      : key === "allowedRoles"
        ? allowedRoles
        : undefined,
  t: (key: string, options?: Record<string, unknown>) =>
    options ? `${key} ${JSON.stringify(options)}` : key,
  locale: "fr",
} as unknown as ConfigProvider<ServerStatsConfigSchema>;

const admin = new PermissionsBitField(PermissionFlagsBits.Administrator);
const member = new PermissionsBitField(PermissionFlagsBits.SendMessages);

function run(
  subcommand: string,
  options: Record<string, string | number> = {},
  access: { permissions?: PermissionsBitField; roles?: string[] } = {}
) {
  const interaction = {
    inCachedGuild: () => true,
    memberPermissions: access.permissions ?? admin,
    member: { roles: roles(...(access.roles ?? [])) },
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
    deleteReply: vi.fn(async () => {}),
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
  it("is visible to every member, for the allowed roles to find it", () => {
    expect(command.requiresAdmin).toBeUndefined();
    expect(command.data.toJSON().default_member_permissions).toBeUndefined();
  });

  it("refuses a member with no allowed role, before anything else", async () => {
    const { interaction, done } = run("today", {}, { permissions: member });
    await done;
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "command.notAllowed",
      flags: MessageFlags.Ephemeral,
    });
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(mocks.statsReport).not.toHaveBeenCalled();
  });

  it("answers a member with an allowed role", async () => {
    const { interaction, done } = run(
      "today",
      {},
      { permissions: member, roles: ["other", "role-stats"] }
    );
    await done;
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(mocks.statsReport).toHaveBeenCalled();
  });
});

describe("/server-stats", () => {
  it("shows today so far, publicly, without pinging anyone", async () => {
    const { interaction, done } = run("today");
    await done;

    // Public: the command is there to show the statistics to others.
    expect(interaction.deferReply).toHaveBeenCalledWith();
    expect(mocks.statsReport).toHaveBeenCalledWith(
      guild,
      { from: day("2026-10-30"), to: day("2026-10-30") },
      {
        now,
        channelShown: expect.any(Function),
        showTopMembers: false,
        t: config.t,
        locale: "fr",
      }
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
    const { interaction, done } = run("day", { date: "2025-09-01" });
    await done;

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'command.tooOld {"count":365,"date":"30 octobre 2025"}',
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
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'command.beforeStart {"date":"30 octobre 2026"}',
      flags: MessageFlags.Ephemeral,
    });
  });

  it("takes its public placeholder back when the report fails", async () => {
    mocks.statsReport.mockRejectedValue(new Error("render failed"));
    const { interaction, done } = run("today");
    await expect(done).rejects.toThrow("render failed");
    expect(interaction.deleteReply).toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it("answers an admin while no role is allowed", async () => {
    allowedRoles.length = 0;
    try {
      const { interaction, done } = run("today");
      await done;
      expect(interaction.reply).not.toHaveBeenCalled();
      expect(mocks.statsReport).toHaveBeenCalled();
    } finally {
      allowedRoles.push({ id: "role-stats" });
    }
  });

  it("says nothing was counted yet", async () => {
    mocks.startedAt.mockResolvedValue(null);
    const { interaction, done } = run("today");
    await done;
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "command.notStarted",
      flags: MessageFlags.Ephemeral,
    });
  });
});

describe("/server-stats autocomplete", () => {
  async function complete(focused: string, permissions = admin) {
    const respond = vi.fn();
    await command.complete!(
      {
        options: { getFocused: () => focused },
        memberPermissions: permissions,
        inCachedGuild: () => true,
        member: { roles: roles() },
        respond,
      } as unknown as AutocompleteInteraction,
      config
    );
    return respond.mock.calls[0]![0] as { name: string; value: string }[];
  }

  it("suggests nothing to a member who may not see the statistics", async () => {
    expect(await complete("", member)).toEqual([]);
  });

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
    expect(
      (await complete("30 septembre")).map((choice) => choice.value)
    ).toEqual(["2026-09-30"]);
    expect((await complete("12/10")).map((choice) => choice.value)).toEqual([
      "2026-10-12",
    ]);
  });
});
