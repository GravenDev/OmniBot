import { ApplicationFlags, GatewayIntentBits, Partials } from "discord.js";
import { describe, expect, it, vi } from "vitest";

const { get, restOptions } = vi.hoisted(() => ({
  get: vi.fn(),
  restOptions: [] as unknown[],
}));
vi.mock("discord.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("discord.js")>()),
  REST: class {
    constructor(options: unknown) {
      restOptions.push(options);
    }
    setToken() {
      return this;
    }
    get = get;
  },
}));

const {
  fetchApplicationFlags,
  findMissingIntents,
  keepModulesWithGrantedIntents,
  planGateway,
} = await import("./intent-guard.js");

function fakeModule(id: string, intents: GatewayIntentBits[]) {
  return { id, intents } as never;
}

describe("findMissingIntents", () => {
  const members = fakeModule("stats", [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ]);

  it("reports a privileged intent the application lacks", () => {
    expect(findMissingIntents(members, 0)).toEqual([
      GatewayIntentBits.GuildMembers,
    ]);
  });

  it("accepts the full flag", () => {
    expect(
      findMissingIntents(members, ApplicationFlags.GatewayGuildMembers)
    ).toEqual([]);
  });

  it("accepts the limited flag", () => {
    expect(
      findMissingIntents(members, ApplicationFlags.GatewayGuildMembersLimited)
    ).toEqual([]);
  });

  it("does not take one privileged flag for another", () => {
    const content = fakeModule("quote", [GatewayIntentBits.MessageContent]);
    expect(
      findMissingIntents(content, ApplicationFlags.GatewayGuildMembers)
    ).toEqual([GatewayIntentBits.MessageContent]);
  });

  it("checks presences", () => {
    const presences = fakeModule("live", [GatewayIntentBits.GuildPresences]);
    expect(findMissingIntents(presences, 0)).toEqual([
      GatewayIntentBits.GuildPresences,
    ]);
    expect(
      findMissingIntents(presences, ApplicationFlags.GatewayPresenceLimited)
    ).toEqual([]);
  });

  it("never reports a non-privileged intent", () => {
    const plain = fakeModule("plain", [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
    ]);
    expect(findMissingIntents(plain, 0)).toEqual([]);
  });

  it("treats a module without intents as satisfied", () => {
    expect(findMissingIntents({ id: "bare" } as never, 0)).toEqual([]);
  });
});

describe("keepModulesWithGrantedIntents", () => {
  it("drops only the modules missing a privileged intent", () => {
    const quote = fakeModule("quote", [GatewayIntentBits.MessageContent]);
    const stats = fakeModule("stats", [GatewayIntentBits.GuildMembers]);
    const games = fakeModule("games", [GatewayIntentBits.Guilds]);

    expect(
      keepModulesWithGrantedIntents(
        [quote, stats, games],
        ApplicationFlags.GatewayMessageContentLimited
      )
    ).toEqual([quote, games]);
  });

  it("keeps every module when the flags are unknown", () => {
    const stats = fakeModule("stats", [GatewayIntentBits.GuildMembers]);

    expect(keepModulesWithGrantedIntents([stats], null)).toEqual([stats]);
  });
});

describe("planGateway", () => {
  const core = { intents: [GatewayIntentBits.Guilds], partials: [] };
  const quote = {
    id: "quote",
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent],
    partials: [Partials.Message],
  } as never;
  const stats = {
    id: "stats",
    intents: [GatewayIntentBits.GuildMembers],
    partials: [Partials.GuildMember],
  } as never;

  it("requests only the intents and partials of the kept modules", () => {
    expect(
      planGateway(
        core,
        [quote, stats],
        ApplicationFlags.GatewayMessageContentLimited
      )
    ).toEqual({
      coreMissing: [],
      modules: [quote],
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent],
      partials: [Partials.Message],
    });
  });

  it("requests every module's intents when the flags are unknown", () => {
    expect(planGateway(core, [quote, stats], null)).toEqual({
      coreMissing: [],
      modules: [quote, stats],
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
      partials: [Partials.Message, Partials.GuildMember],
    });
  });

  it("reports a privileged intent the core lacks", () => {
    const privilegedCore = {
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    };

    expect(planGateway(privilegedCore, [], 0).coreMissing).toEqual([
      GatewayIntentBits.GuildMembers,
    ]);
  });
});

describe("fetchApplicationFlags", () => {
  it("returns the application flags", async () => {
    get.mockResolvedValueOnce({ flags: ApplicationFlags.GatewayGuildMembers });

    await expect(fetchApplicationFlags("token")).resolves.toBe(
      ApplicationFlags.GatewayGuildMembers
    );
  });

  it("returns 0 when the application has no flags", async () => {
    get.mockResolvedValueOnce({});

    await expect(fetchApplicationFlags("token")).resolves.toBe(0);
  });

  it("returns null when the request fails", async () => {
    get.mockRejectedValueOnce(new Error("network down"));

    await expect(fetchApplicationFlags("token")).resolves.toBeNull();
  });

  it("returns null without a request when there is no token", async () => {
    get.mockClear();

    await expect(fetchApplicationFlags(undefined)).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it("bounds the request so a slow or rate-limited API cannot stall the boot", async () => {
    get.mockResolvedValueOnce({});

    await fetchApplicationFlags("token");

    const options = restOptions.at(-1) as {
      timeout: number;
      retries: number;
      rejectOnRateLimit: () => boolean;
    };
    expect(options).toMatchObject({ timeout: 5_000, retries: 0 });
    expect(options.rejectOnRateLimit()).toBe(true);
  });
});
