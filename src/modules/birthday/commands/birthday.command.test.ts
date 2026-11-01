import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { ConfigData } from "#lib/config.js";
import { initTestI18n, makeTestConfig, silenceLogs } from "#lib/testing.js";
import {
  birthdayConfigSchema,
  type BirthdayConfigSchema,
} from "#modules/birthday/birthday.config.js";
import en from "#modules/birthday/i18n/en.json" with { type: "json" };
import fr from "#modules/birthday/i18n/fr.json" with { type: "json" };

const service = vi.hoisted(() => ({
  set: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  getState: vi.fn(),
}));
vi.mock("#modules/birthday/services/birthday.service.js", () => ({
  default: service,
}));

const checkMilestones = vi.hoisted(() => vi.fn());
vi.mock("#modules/birthday/services/milestones.js", () => ({
  checkMilestones,
}));

const { default: command } = await import("./birthday.command.js");

interface Options {
  subcommand: string;
  integers?: Record<string, number>;
  booleans?: Record<string, boolean>;
}

function interaction({ subcommand, integers = {}, booleans = {} }: Options) {
  const reply = vi.fn(async () => ({}));
  return {
    reply,
    interaction: {
      inGuild: () => true,
      guildId: "guild",
      user: { id: "me" },
      reply,
      options: {
        getSubcommand: () => subcommand,
        getInteger: (name: string) => integers[name] ?? null,
        getBoolean: (name: string) => booleans[name] ?? null,
      },
    } as unknown as ChatInputCommandInteraction,
  };
}

function config(values: Partial<ConfigData<BirthdayConfigSchema>> = {}) {
  return makeTestConfig(
    "birthday",
    birthdayConfigSchema,
    values as Partial<ConfigData<BirthdayConfigSchema>>,
    "fr"
  );
}

function content(reply: ReturnType<typeof vi.fn>): string {
  return (reply.mock.calls[0] as [{ content: string }])[0].content;
}

beforeAll(async () => {
  silenceLogs();
  await initTestI18n("birthday", { en, fr });
});

beforeEach(() => {
  vi.clearAllMocks();
  checkMilestones.mockResolvedValue(undefined);
  service.getState.mockResolvedValue({
    lastDay: null,
    milestones: [],
    firstCollisionCount: null,
  });
});

describe("/birthday set", () => {
  it("refuses a date that does not exist", async () => {
    const { interaction: i, reply } = interaction({
      subcommand: "set",
      integers: { day: 30, month: 2 },
    });
    await command.execute(i, config());
    expect(service.set).not.toHaveBeenCalled();
    expect(content(reply)).toBe("Cette date n'existe pas.");
  });

  it("stores the day and the month, privately confirmed", async () => {
    const { interaction: i, reply } = interaction({
      subcommand: "set",
      integers: { day: 14, month: 3 },
    });
    const provider = config({
      channel: { id: "chan" },
    } as unknown as Partial<ConfigData<BirthdayConfigSchema>>);
    await command.execute(i, provider);

    expect(service.set).toHaveBeenCalledWith("guild", {
      userId: "me",
      day: 14,
      month: 3,
      announce: true,
    });
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral })
    );
    expect(content(reply)).toContain("**14 mars**");
    expect(content(reply)).toContain("Il sera annoncé dans <#chan>.");
    expect(checkMilestones).toHaveBeenCalledWith("guild", provider);
  });

  it("can keep it out of the announcements", async () => {
    const { interaction: i, reply } = interaction({
      subcommand: "set",
      integers: { day: 14, month: 3 },
      booleans: { announce: false },
    });
    await command.execute(i, config());
    expect(service.set).toHaveBeenCalledWith(
      "guild",
      expect.objectContaining({ announce: false })
    );
    expect(content(reply)).toContain("Il ne sera pas annoncé");
  });
});

describe("/birthday remove", () => {
  it("deletes the member's own birthday", async () => {
    service.remove.mockResolvedValue(true);
    const { interaction: i, reply } = interaction({ subcommand: "remove" });
    await command.execute(i, config());
    expect(service.remove).toHaveBeenCalledWith("guild", "me");
    expect(content(reply)).toBe("Votre anniversaire est supprimé.");
  });

  it("takes the birthday role back the same day", async () => {
    service.remove.mockResolvedValue(true);
    const remove = vi.fn(async () => undefined);
    const role = {
      id: "role",
      members: new Map([["me", { roles: { remove } }]]),
    };
    const { interaction: i } = interaction({ subcommand: "remove" });
    await command.execute(
      i,
      config({ role } as unknown as Partial<ConfigData<BirthdayConfigSchema>>)
    );
    expect(remove).toHaveBeenCalledWith(role);
  });
});

describe("/birthday stats", () => {
  it("names a shared date only when all its members are announced", async () => {
    service.list.mockResolvedValue([
      { userId: "a", day: 14, month: 3, announce: true },
      { userId: "b", day: 14, month: 3, announce: true },
      { userId: "c", day: 2, month: 11, announce: true },
      { userId: "d", day: 2, month: 11, announce: false },
      { userId: "e", day: 5, month: 5, announce: false },
    ]);
    const { interaction: i, reply } = interaction({ subcommand: "stats" });
    await command.execute(i, config());

    const text = content(reply);
    expect(text).toContain("**5 anniversaires enregistrés**");
    expect(text).toContain("**2 dates partagées**");
    expect(text).toContain("Partagées : 14 mars.");
    expect(text).not.toContain("novembre");
    expect(text).toContain("1 date partagée n'est pas affichée");
    expect(text).toContain("Encore 18 inscrits");
    expect(text).not.toMatch(/<@/);
  });
});

describe("/birthday upcoming", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a 29 February on the day it is celebrated", async () => {
    vi.useFakeTimers({ now: new Date("2027-02-27T12:00:00Z") });
    service.list.mockResolvedValue([
      { userId: "leap", day: 29, month: 2, announce: true },
    ]);
    const { interaction: i, reply } = interaction({ subcommand: "upcoming" });
    await command.execute(i, config({ timeZone: "UTC" }));
    expect(content(reply)).toContain("**28 février** · <@leap> · demain");
  });

  it("counts the birthdays left out past Discord's limit", async () => {
    vi.useFakeTimers({ now: new Date("2027-03-14T12:00:00Z") });
    service.list.mockResolvedValue(
      Array.from({ length: 200 }, (_, index) => ({
        userId: `member-${index}`,
        day: 14,
        month: 3,
        announce: true,
      }))
    );
    const { interaction: i, reply } = interaction({ subcommand: "upcoming" });
    await command.execute(i, config({ timeZone: "UTC" }));
    const text = content(reply);
    expect(text.length).toBeLessThanOrEqual(2000);
    const shown = (text.match(/<@/g) ?? []).length;
    expect(text).toContain(`… et ${200 - shown} autres anniversaires`);
  });

  it("only lists the announced birthdays", async () => {
    const today = new Date();
    const entry = (userId: string, announce: boolean) => ({
      userId,
      day: today.getUTCDate(),
      month: today.getUTCMonth() + 1,
      announce,
    });
    service.list.mockResolvedValue([
      entry("shown", true),
      entry("hidden", false),
    ]);
    const { interaction: i, reply } = interaction({ subcommand: "upcoming" });
    await command.execute(i, config({ timeZone: "UTC" }));

    expect(content(reply)).toContain("<@shown>");
    expect(content(reply)).not.toContain("hidden");
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { parse: [] } })
    );
  });
});
