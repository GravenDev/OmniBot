import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredRoll } from "./store.js";

const mocks = vi.hoisted(() => ({
  refreshAccount: vi.fn(async (_account: unknown): Promise<void> => undefined),
  render: vi.fn(async () => Buffer.from("png")),
  fetchBadges: vi.fn(async (): Promise<unknown> => null),
  store: {
    claimCard: vi.fn(async () => true),
    hasCard: vi.fn(async () => false),
    releaseCard: vi.fn(async () => undefined),
    pruneCardClaims: vi.fn(async () => undefined),
    rolls: vi.fn(async (): Promise<StoredRoll[]> => []),
    account: vi.fn(async (): Promise<unknown> => null),
    scoreTable: vi.fn(async () => ({
      percentOf: () => 96,
      tierOf: () => "ANOMALY",
    })),
  },
}));

vi.mock("#lib/logger.js", () => {
  const logger = { error: vi.fn(), warn: vi.fn() };
  return { loggerMaker: () => logger };
});
vi.mock("#lib/players.js", () => ({
  resolvePlayers: async () => new Map(),
}));
vi.mock("#modules/rngdle/rendering/roll-card.js", () => ({
  renderRollCard: mocks.render,
}));
vi.mock("./badges.js", () => ({ fetchRollBadges: mocks.fetchBadges }));
vi.mock("./store.js", () => ({ default: mocks.store }));
vi.mock("./sync.js", () => ({
  default: { refreshAccount: mocks.refreshAccount },
}));

import { answerShare, computeHighlights, pruneCards } from "./share-cards.js";

const ACCOUNT = { guildId: "g1", userId: "u1", username: "Alice" };
const NOW = new Date("2026-10-22T12:00:00Z");
const DAY = new Date("2026-10-22T00:00:00Z");
const SHARE = "RNGdle 🎲 111883\n\n🟧 ANOMALY • Top 4%\n\n41 731 EP";
const CALCULATOR = { number: 111883, score: 41731, badges: [] };
const MINUTE = 60 * 1000;

let clock = NOW.getTime();

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

function roll(
  userId: string,
  score: number,
  rolledAt = new Date("2026-10-22T11:00:00Z")
): StoredRoll {
  return { userId, number: score, score, badgeCount: 3, rolledAt };
}

const SHARING = { shareCards: true, leaderboardChannel: { id: "c1" } };

function configWith(values: Record<string, unknown>) {
  return { get: (key: string) => values[key], t, locale: "fr" };
}

function shareMessage(content = SHARE) {
  return {
    content,
    author: { id: "u1", bot: false },
    guildId: "g1",
    channelId: "c1",
    createdAt: NOW,
    client: { user: { id: "bot" } },
    inGuild: () => true,
    channel: {
      isThread: () => false,
      permissionsFor: () => ({ has: () => true }),
    },
    reply: vi.fn(async () => ({})),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Each test starts past the 10-minute check cooldown of the previous one.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime((clock += 60 * MINUTE));
  mocks.store.claimCard.mockResolvedValue(true);
  mocks.store.hasCard.mockResolvedValue(false);
  mocks.store.rolls.mockResolvedValue([]);
  mocks.store.account.mockResolvedValue(null);
  mocks.fetchBadges.mockResolvedValue(null);
  mocks.refreshAccount.mockResolvedValue(undefined);
});

describe("computeHighlights", () => {
  const today = roll("me", 5000);

  it("celebrates a personal best above every previous roll", () => {
    const highlights = computeHighlights(
      t,
      today,
      [roll("me", 4000)],
      [],
      "fr"
    );
    expect(highlights.map((h) => h.text)).toEqual(["card.personalBest"]);
  });

  it("does not call the first roll a personal best", () => {
    expect(computeHighlights(t, today, [], [], "fr")).toEqual([]);
  });

  it("ranks the roll among the other players of the day", () => {
    const highlights = computeHighlights(
      t,
      today,
      [],
      [today, roll("a", 9000), roll("b", 100)],
      "fr"
    );
    expect(highlights).toEqual([
      expect.objectContaining({
        icon: "🥈",
        text: 'card.rank {"rank":2,"count":3}',
      }),
    ]);
  });

  it("compares with the average once there are enough rolls", () => {
    const previous = [1000, 2000, 3000, 4000, 5000].map((score) =>
      roll("me", score)
    );
    const below = computeHighlights(t, roll("me", 2000), previous, [], "fr");
    expect(below.at(-1)?.text).toBe('card.vsAverage {"delta":"−1 000"}');
    expect(
      computeHighlights(t, today, previous.slice(1), [], "fr").map(
        (h) => h.text
      )
    ).not.toContain(expect.stringContaining("vsAverage"));
  });
});

describe("answerShare", () => {
  it("replies to a shared result with a card, without pinging", async () => {
    mocks.fetchBadges.mockResolvedValue(CALCULATOR);
    const message = shareMessage();
    await answerShare(message as never, configWith(SHARING) as never);

    expect(mocks.store.claimCard).toHaveBeenCalledWith("g1", "u1", DAY);
    expect(message.reply).toHaveBeenCalledWith({
      files: [expect.objectContaining({ name: "rngdle-roll.png" })],
      allowedMentions: { parse: [], repliedUser: false },
    });
  });

  it("draws a second card of the day from the pasted text alone", async () => {
    mocks.fetchBadges.mockResolvedValue(CALCULATOR);
    mocks.store.claimCard.mockResolvedValue(false);
    const message = shareMessage();
    await answerShare(message as never, configWith(SHARING) as never);

    expect(message.reply).toHaveBeenCalled();
    expect(mocks.store.releaseCard).not.toHaveBeenCalled();
  });

  it.each([
    ["the same score keeps its recorded data", 41731, 1],
    ["another score is drawn as pasted", 40000, 0],
  ])(
    "for a linked member's roll pasted again, %s",
    async (_, storedScore, badgeRequests) => {
      mocks.store.account.mockResolvedValue(ACCOUNT);
      mocks.store.claimCard.mockResolvedValue(false);
      mocks.store.rolls.mockImplementation(async (_guildId, filter) =>
        filter?.from && filter.userId
          ? [{ ...roll("u1", storedScore), number: 111883 }]
          : []
      );
      const message = shareMessage();
      await answerShare(message as never, configWith(SHARING) as never);

      expect(mocks.refreshAccount).not.toHaveBeenCalled();
      expect(mocks.fetchBadges).toHaveBeenCalledTimes(badgeRequests);
      expect(mocks.store.releaseCard).not.toHaveBeenCalled();
      expect(message.reply).toHaveBeenCalled();
    }
  );

  it("ranks a verified card from the recorded score, with the pasted badges when the calculator is down", async () => {
    mocks.store.account.mockResolvedValue(ACCOUNT);
    mocks.store.rolls.mockImplementation(async (_guildId, filter) =>
      filter?.from && filter.userId
        ? [{ ...roll("u1", 41731), number: 111883 }]
        : []
    );
    const altered =
      "RNGdle 🎲 111883\n\n🟧 ANOMALY • Top 1%\n\n🟧 🍀 Lucky\n\n41 731 EP";
    await answerShare(
      shareMessage(altered) as never,
      configWith(SHARING) as never
    );

    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({
        placement: 'card.top {"percent":"4%"}',
        badges: [expect.objectContaining({ label: "Lucky", ep: null })],
        badgeCount: 1,
      }),
      expect.anything()
    );
  });

  it("draws a card from the pasted text alone, placement included", async () => {
    mocks.store.hasCard.mockResolvedValue(true);
    const pasted =
      "RNGdle 🎲 111883\n\n🟧 ANOMALY • Top 1%\n\n🟧 🍀 Lucky\n\n41 731 EP";
    await answerShare(
      shareMessage(pasted) as never,
      configWith(SHARING) as never
    );

    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({
        placement: 'card.top {"percent":"1%"}',
        badges: [expect.objectContaining({ label: "Lucky" })],
        badgeCount: 1,
      }),
      expect.anything()
    );
  });

  it("sends no request once the member has a card today", async () => {
    mocks.store.account.mockResolvedValue(ACCOUNT);
    mocks.store.hasCard.mockResolvedValue(true);
    const message = shareMessage();
    await answerShare(message as never, configWith(SHARING) as never);

    expect(mocks.store.hasCard).toHaveBeenCalledWith("g1", "u1", DAY);
    expect(mocks.refreshAccount).not.toHaveBeenCalled();
    expect(mocks.fetchBadges).not.toHaveBeenCalled();
    expect(mocks.store.claimCard).not.toHaveBeenCalled();
    expect(message.reply).toHaveBeenCalled();
  });

  it("checks a member's results at most once every 10 minutes", async () => {
    mocks.store.account.mockResolvedValue(ACCOUNT);
    const config = configWith(SHARING) as never;
    await answerShare(shareMessage() as never, config);
    vi.setSystemTime(clock + 9 * MINUTE);
    await answerShare(shareMessage() as never, config);
    expect(mocks.refreshAccount).toHaveBeenCalledTimes(1);

    vi.setSystemTime(clock + 10 * MINUTE);
    await answerShare(shareMessage() as never, config);
    expect(mocks.refreshAccount).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      "the feature is off",
      configWith({ ...SHARING, shareCards: false }),
      shareMessage(),
    ],
    [
      "no leaderboard channel is set",
      configWith({ shareCards: true }),
      shareMessage(),
    ],
    [
      "it is posted outside the leaderboard channel",
      configWith(SHARING),
      { ...shareMessage(), channelId: "c2" },
    ],
    [
      "the message is not a result",
      configWith(SHARING),
      shareMessage("bonjour"),
    ],
    [
      "a bot posted it",
      configWith(SHARING),
      { ...shareMessage(), author: { id: "u1", bot: true } },
    ],
  ])("ignores the message when %s", async (_, config, message) => {
    await answerShare(message as never, config as never);
    expect(mocks.store.claimCard).not.toHaveBeenCalled();
    expect(message.reply).not.toHaveBeenCalled();
  });

  it("frees the day when the reply fails", async () => {
    mocks.fetchBadges.mockResolvedValue(CALCULATOR);
    const message = shareMessage();
    message.reply.mockRejectedValue(new Error("boom"));

    await expect(
      answerShare(message as never, configWith(SHARING) as never)
    ).rejects.toThrow("boom");
    expect(mocks.store.releaseCard).toHaveBeenCalledWith("g1", "u1", DAY);
  });

  it.each([
    ["an unlinked member's result", null, true],
    ["a linked member's recorded roll", ACCOUNT, false],
    ["a linked member's recorded roll pasted again", ACCOUNT, false, false],
  ])(
    "sets the not-connected mark right on %s",
    async (_, account, notLinked, firstOfTheDay = true) => {
      mocks.fetchBadges.mockResolvedValue(CALCULATOR);
      mocks.store.account.mockResolvedValue(account);
      mocks.store.claimCard.mockResolvedValue(firstOfTheDay);
      mocks.store.rolls.mockImplementation(async (_guildId, filter) =>
        filter?.userId ? [{ ...roll("u1", 41731), number: 111883 }] : []
      );
      await answerShare(shareMessage() as never, configWith(SHARING) as never);

      const [[data]] = mocks.render.mock.calls as unknown as [
        [{ subtitle: string }],
      ];
      expect(data.subtitle.endsWith(" · card.notLinked")).toBe(notLinked);
    }
  );

  it("leaves the highlights out for a member who is not linked", async () => {
    mocks.store.rolls.mockResolvedValue([roll("u1", 100)]);
    await answerShare(shareMessage() as never, configWith(SHARING) as never);

    expect(mocks.store.rolls).not.toHaveBeenCalled();
    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({ highlights: [] }),
      expect.anything()
    );
  });

  it("adds the highlights for a linked member", async () => {
    mocks.store.account.mockResolvedValue(ACCOUNT);
    mocks.store.rolls.mockImplementation(async (_guildId, filter) =>
      filter?.to
        ? [roll("u1", 100, new Date("2026-10-20T10:00:00Z"))]
        : filter?.userId
          ? [{ ...roll("u1", 41731), number: 111883 }]
          : []
    );
    await answerShare(shareMessage() as never, configWith(SHARING) as never);

    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({
        highlights: [expect.objectContaining({ text: "card.personalBest" })],
      }),
      expect.anything()
    );
  });

  it("files a linked member's result under the day of the stored roll", async () => {
    const lateNight = new Date("2026-10-21T23:58:00Z");
    mocks.store.account.mockResolvedValue(ACCOUNT);
    mocks.store.rolls.mockImplementation(async (_guildId, filter) =>
      filter?.from && filter.userId
        ? [{ ...roll("u1", 30000, lateNight), number: 111883 }]
        : []
    );
    await answerShare(shareMessage() as never, configWith(SHARING) as never);

    expect(mocks.store.claimCard).toHaveBeenCalledWith(
      "g1",
      "u1",
      new Date("2026-10-21T00:00:00Z")
    );
    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({ number: 111883, score: 30000 }),
      expect.anything()
    );
  });

  it("draws a linked member's result that is not today's roll as pasted", async () => {
    mocks.store.account.mockResolvedValue(ACCOUNT);
    mocks.store.rolls.mockImplementation(async (_guildId, filter) =>
      filter?.from && filter.userId ? [roll("u1", 500)] : []
    );
    const message = shareMessage();
    await answerShare(message as never, configWith(SHARING) as never);

    expect(mocks.store.claimCard).not.toHaveBeenCalled();
    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({ number: 111883, score: 41731, highlights: [] }),
      expect.anything()
    );
  });

  it("downloads a linked member's rolls before trusting a new result", async () => {
    let synced = false;
    mocks.refreshAccount.mockImplementation(async () => {
      synced = true;
    });
    mocks.store.account.mockResolvedValue(ACCOUNT);
    mocks.store.rolls.mockImplementation(async (_guildId, filter) =>
      synced && filter?.from && filter.userId
        ? [{ ...roll("u1", 41731), number: 111883 }]
        : []
    );
    const message = shareMessage();
    await answerShare(message as never, configWith(SHARING) as never);

    expect(mocks.refreshAccount).toHaveBeenCalledWith(ACCOUNT);
    expect(message.reply).toHaveBeenCalled();
  });

  it.each([
    ["rngdle.com does not know the roll", async () => undefined],
    [
      "rngdle.com cannot be reached",
      async () => {
        throw new Error("down");
      },
    ],
  ])(
    "draws a linked member's result as pasted when %s",
    async (_, refresh: () => Promise<void>) => {
      mocks.refreshAccount.mockImplementation(refresh);
      mocks.store.account.mockResolvedValue(ACCOUNT);
      const message = shareMessage();
      await answerShare(message as never, configWith(SHARING) as never);

      expect(mocks.store.claimCard).not.toHaveBeenCalled();
      expect(message.reply).toHaveBeenCalled();
    }
  );

  it("draws a result whose score does not match its number as pasted", async () => {
    mocks.fetchBadges.mockResolvedValue({ ...CALCULATOR, score: 41730 });
    const message = shareMessage();
    await answerShare(message as never, configWith(SHARING) as never);

    expect(mocks.store.claimCard).not.toHaveBeenCalled();
    expect(mocks.fetchBadges).toHaveBeenCalledTimes(1);
    expect(message.reply).toHaveBeenCalled();
  });

  it("accepts a result whose score matches the calculator", async () => {
    mocks.fetchBadges.mockResolvedValue(CALCULATOR);
    const message = shareMessage();
    await answerShare(message as never, configWith(SHARING) as never);

    expect(mocks.store.claimCard).toHaveBeenCalled();
    expect(message.reply).toHaveBeenCalled();
  });
});

describe("pruneCards", () => {
  it("keeps the cards of today and yesterday", async () => {
    await pruneCards(NOW);

    expect(mocks.store.pruneCardClaims).toHaveBeenCalledWith(
      new Date("2026-10-21T00:00:00Z")
    );
  });
});
