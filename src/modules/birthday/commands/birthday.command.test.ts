import {
  Collection,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
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

const renderStatsCard = vi.hoisted(() => vi.fn());
vi.mock("#modules/birthday/rendering/stats-card.js", () => ({
  renderStatsCard,
}));

const { default: command } = await import("./birthday.command.js");

interface Options {
  subcommand: string;
  integers?: Record<string, number>;
  booleans?: Record<string, boolean>;
  roles?: Record<string, { id: string }>;
  channels?: Record<string, { id: string }>;
  guild?: unknown;
  // Members still on the guild; everyone by default.
  present?: (userId: string) => boolean;
}

function interaction({
  subcommand,
  integers = {},
  booleans = {},
  roles = {},
  channels = {},
  present = () => true,
  guild,
}: Options) {
  const reply = vi.fn(async (_options: unknown) => ({}));
  // A deferred reply is then edited: edits also land in `reply`.
  const editReply = vi.fn(async (options: unknown) => reply(options));
  const fetch = vi.fn(async ({ user }: { user: string[] }) => {
    return new Map(
      user.filter(present).map((userId) => [userId, { id: userId }])
    );
  });
  const i = {
    inGuild: () => true,
    inCachedGuild: () => true,
    guildId: "guild",
    guild: guild ?? { iconURL: () => null, members: { fetch } },
    user: { id: "me" },
    deferred: false,
    reply,
    editReply,
    deferReply: vi.fn(async () => {
      i.deferred = true;
    }),
    options: {
      getSubcommand: () => subcommand,
      getInteger: (name: string) => integers[name] ?? null,
      getBoolean: (name: string) => booleans[name] ?? null,
      getRole: (name: string) => roles[name] ?? null,
      getChannel: (name: string) => channels[name] ?? null,
    },
  };
  return {
    reply,
    fetch,
    deferReply: i.deferReply,
    editReply,
    interaction: i as unknown as ChatInputCommandInteraction,
  };
}

function members(...ids: string[]) {
  return new Collection(
    ids.map((id) => [id, { id, user: { bot: id.startsWith("bot") } }] as const)
  );
}

/** A server whose member cache holds `cached` of its `memberCount` members. */
function guild({
  role = members(),
  voice = members(),
  cached = 50,
  memberCount = 50,
}: {
  role?: ReturnType<typeof members>;
  voice?: ReturnType<typeof members>;
  cached?: number;
  memberCount?: number;
} = {}) {
  const cache = { size: cached, sweep: () => 0 };
  return {
    memberCount,
    iconURL: () => null,
    members: {
      cache,
      fetch: vi.fn(async () => {
        cache.size = memberCount;
        return new Collection();
      }),
    },
    roles: {
      cache: new Map([["mods", { id: "mods", name: "mods", members: role }]]),
    },
    channels: {
      cache: new Map([
        [
          "voice",
          {
            id: "voice",
            name: "voice",
            isVoiceBased: () => true,
            members: voice,
          },
        ],
      ]),
    },
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
  service.list.mockResolvedValue([]);
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
    const {
      interaction: i,
      reply,
      deferReply,
    } = interaction({
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
    expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
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

const entry = (
  userId: string,
  day: number,
  month: number,
  announce = true
) => ({ userId, day, month, announce });

describe("birthday twins in /birthday set and show", () => {
  it("says nothing when nobody shares the date", async () => {
    service.list.mockResolvedValue([entry("me", 14, 3), entry("a", 15, 3)]);
    const {
      interaction: i,
      reply,
      fetch,
    } = interaction({
      subcommand: "show",
    });
    await command.execute(i, config());
    expect(content(reply)).toContain("**14 mars**");
    expect(content(reply)).not.toContain("partagez");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("names a twin, without pinging", async () => {
    service.list.mockResolvedValue([entry("me", 14, 3), entry("a", 14, 3)]);
    const {
      interaction: i,
      reply,
      deferReply,
    } = interaction({ subcommand: "show" });
    await command.execute(i, config());
    expect(content(reply)).toContain("👯 Vous partagez votre date avec <@a>.");
    expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { parse: [] } })
    );
    expect(service.get).not.toHaveBeenCalled();
  });

  it("names the twins of a date just set", async () => {
    service.list.mockResolvedValue([
      entry("me", 14, 3),
      entry("a", 14, 3),
      entry("b", 14, 3),
    ]);
    const { interaction: i, reply } = interaction({
      subcommand: "set",
      integers: { day: 14, month: 3 },
    });
    await command.execute(i, config());
    expect(content(reply)).toContain(
      "👯 Vous partagez votre date avec <@a> et <@b>."
    );
  });

  it("names ten twins, then counts the others", async () => {
    service.list.mockResolvedValue([
      entry("me", 14, 3),
      ...Array.from({ length: 13 }, (_, index) =>
        entry(`m${String(index).padStart(2, "0")}`, 14, 3)
      ),
    ]);
    const { interaction: i, reply } = interaction({ subcommand: "show" });
    await command.execute(i, config());
    const text = content(reply);
    expect((text.match(/<@/g) ?? []).length).toBe(10);
    expect(text).toContain("<@m09> et 3 autres membres.");
    expect(text).not.toContain("<@m10>");
  });

  it("never reveals nor counts a hidden twin", async () => {
    service.list.mockResolvedValue([
      entry("me", 14, 3),
      entry("a", 14, 3),
      entry("hidden", 14, 3, false),
    ]);
    const {
      interaction: i,
      reply,
      fetch,
    } = interaction({
      subcommand: "show",
    });
    await command.execute(i, config());
    expect(content(reply)).toContain("avec <@a>.");
    expect(content(reply)).not.toContain("hidden");
    expect(content(reply)).not.toContain("autre");
    expect(fetch).toHaveBeenCalledWith({ user: ["a"] });
  });

  it("leaves out a twin who left the server", async () => {
    service.list.mockResolvedValue([
      entry("me", 14, 3),
      entry("a", 14, 3),
      entry("gone", 14, 3),
    ]);
    const { interaction: i, reply } = interaction({
      subcommand: "show",
      present: (userId) => userId !== "gone",
    });
    await command.execute(i, config());
    expect(content(reply)).toContain("avec <@a>.");
    expect(content(reply)).not.toContain("gone");
  });

  it("says nothing when every twin left the server", async () => {
    service.list.mockResolvedValue([entry("me", 14, 3), entry("gone", 14, 3)]);
    const { interaction: i, reply } = interaction({
      subcommand: "show",
      present: () => false,
    });
    await command.execute(i, config());
    expect(content(reply)).not.toContain("partagez");
  });

  it("shows a hidden member their announced twins", async () => {
    service.list.mockResolvedValue([
      entry("me", 14, 3, false),
      entry("a", 14, 3),
    ]);
    const { interaction: i, reply } = interaction({
      subcommand: "set",
      integers: { day: 14, month: 3 },
      booleans: { announce: false },
    });
    await command.execute(i, config());
    expect(content(reply)).toContain("Il ne sera pas annoncé");
    expect(content(reply)).toContain("avec <@a>.");
  });

  it("pairs 29 February with 29 February only, not the 28th", async () => {
    service.list.mockResolvedValue([
      entry("me", 29, 2),
      entry("leap", 29, 2),
      entry("eve", 28, 2),
    ]);
    const { interaction: i, reply } = interaction({ subcommand: "show" });
    await command.execute(i, config());
    expect(content(reply)).toContain("avec <@leap>.");
    expect(content(reply)).not.toContain("eve");
  });

  it("says nothing when the members cannot be fetched", async () => {
    service.list.mockResolvedValue([entry("me", 14, 3), entry("a", 14, 3)]);
    const {
      interaction: i,
      reply,
      fetch,
    } = interaction({
      subcommand: "show",
    });
    fetch.mockRejectedValue(new Error("timeout"));
    await command.execute(i, config());
    expect(content(reply)).toContain("**14 mars**");
    expect(content(reply)).not.toContain("<@a>");
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
  const ENTRIES = [
    { userId: "a", day: 14, month: 3, announce: true },
    { userId: "b", day: 14, month: 3, announce: true },
    { userId: "c", day: 2, month: 11, announce: true },
    { userId: "d", day: 2, month: 11, announce: false },
    { userId: "e", day: 5, month: 5, announce: false },
  ];

  interface Edit {
    content: string;
    files: { name: string; description: string }[];
  }
  const edit = (editReply: ReturnType<typeof vi.fn>) =>
    (editReply.mock.calls[0] as [Edit])[0];

  it("replies with the card and its summary in the text", async () => {
    service.list.mockResolvedValue(ENTRIES);
    renderStatsCard.mockResolvedValue(Buffer.from("png"));
    const {
      interaction: i,
      deferReply,
      editReply,
    } = interaction({
      subcommand: "stats",
    });
    await command.execute(i, config());

    expect(deferReply).toHaveBeenCalled();
    const { content: text, files } = edit(editReply);
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe("birthday-stats.png");
    expect(files[0]!.description).toContain("Le paradoxe des anniversaires");
    expect(text).toContain("**5 anniversaires enregistrés**");
    expect(text).toContain("**2 dates partagées**");
    expect(text).toContain("Partagées : 14 mars.");
    expect(text).not.toContain("novembre");
    expect(text).toContain("1 date partagée n'est pas affichée");
    expect(text).toContain("Encore 18 inscriptions");
    expect(text).not.toMatch(/<@/);
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { parse: [] } })
    );
  });

  it("falls back to the text when the card cannot be drawn", async () => {
    service.list.mockResolvedValue(ENTRIES);
    renderStatsCard.mockRejectedValue(new Error("no canvas"));
    const { interaction: i, editReply } = interaction({ subcommand: "stats" });
    await command.execute(i, config());

    const { content: text, files } = edit(editReply);
    expect(files).toEqual([]);
    expect(text).toContain("**5 anniversaires enregistrés**");
    expect(text).toContain("Partagées : 14 mars.");
  });

  const registered = [
    { userId: "a", day: 14, month: 3, announce: true },
    { userId: "b", day: 14, month: 3, announce: true },
    { userId: "c", day: 2, month: 11, announce: true },
    { userId: "d", day: 2, month: 11, announce: false },
    { userId: "e", day: 5, month: 5, announce: false },
  ];

  it("computes the paradox for a role's registered members only", async () => {
    service.list.mockResolvedValue(registered);
    const server = guild({
      role: members("a", "b", "e", "x", "bot-1"),
      cached: 10,
      memberCount: 50,
    });
    const { interaction: i, editReply } = interaction({
      subcommand: "stats",
      roles: { role: { id: "mods" } },
      guild: server,
    });
    await command.execute(i, config());

    // The cache is incomplete: the members are fetched first.
    expect(server.members.fetch).toHaveBeenCalled();
    const text = content(editReply);
    expect(text).toContain("parmi les membres de <@&mods>");
    expect(text).toContain(
      "3 anniversaires enregistrés sur 4 membres du rôle."
    );
    expect(text).toContain("**3 anniversaires enregistrés**");
    expect(text).toContain("Dans ce groupe : **1 date partagée**.");
    expect(text).toContain("Partagées : 14 mars.");
    // The countdown is the group's; the first shared date, the server's only.
    expect(text).toContain("Encore 20 inscriptions");
    expect(text).not.toContain("première date partagée");
    expect(service.getState).not.toHaveBeenCalled();
    // The card names the role in plain text: it cannot show a mention.
    expect(renderStatsCard).toHaveBeenCalledWith(
      expect.objectContaining({ group: "@mods", count: 3 }),
      expect.anything(),
      null
    );
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { parse: [] } })
    );
  });

  it("computes the paradox for the people in a voice channel", async () => {
    service.list.mockResolvedValue(registered);
    const server = guild({ voice: members("a", "c", "y") });
    const { interaction: i, editReply } = interaction({
      subcommand: "stats",
      channels: { channel: { id: "voice" } },
      guild: server,
    });
    await command.execute(i, config());

    expect(server.members.fetch).not.toHaveBeenCalled();
    const text = content(editReply);
    expect(text).toContain("dans le salon <#voice>");
    expect(text).toContain(
      "2 anniversaires enregistrés sur 3 personnes dans le salon."
    );
    expect(text).toContain("Dans ce groupe : aucune date partagée");
  });

  it("refuses a role and a channel together", async () => {
    const { interaction: i, reply } = interaction({
      subcommand: "stats",
      roles: { role: { id: "mods" } },
      channels: { channel: { id: "voice" } },
      guild: guild(),
    });
    await command.execute(i, config());

    expect(service.list).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral })
    );
    expect(content(reply)).toBe(
      "Choisissez un rôle ou un salon vocal, pas les deux."
    );
  });

  it.each([
    [members("x", "y"), "0 anniversaire enregistré", "Aucun anniversaire"],
    [members("a", "y"), "1 anniversaire enregistré", "Un seul anniversaire"],
  ])(
    "explains a group with fewer than two birthdays",
    async (voice, count, why) => {
      service.list.mockResolvedValue(registered);
      const { interaction: i, editReply } = interaction({
        subcommand: "stats",
        channels: { channel: { id: "voice" } },
        guild: guild({ voice }),
      });
      await command.execute(i, config());

      const text = content(editReply);
      expect(text).toContain(`${count} sur 2 personnes dans le salon.`);
      expect(text).toContain(why);
      expect(text).not.toContain("probabilité");
    }
  );

  it("does not name a date a hidden member shares within the group", async () => {
    service.list.mockResolvedValue(registered);
    const { interaction: i, editReply } = interaction({
      subcommand: "stats",
      roles: { role: { id: "mods" } },
      guild: guild({ role: members("a", "b", "c", "d") }),
    });
    await command.execute(i, config());

    const text = content(editReply);
    expect(text).toContain("Dans ce groupe : **2 dates partagées**.");
    expect(text).toContain("Partagées : 14 mars.");
    expect(text).not.toContain("novembre");
    expect(text).toContain("1 date partagée n'est pas affichée");
    expect(text).not.toMatch(/<@[^&]/);
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
