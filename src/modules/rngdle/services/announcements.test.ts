import { MessageFlags } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredRoll } from "./store.js";

const mocks = vi.hoisted(() => ({
  activated: vi.fn(async (): Promise<string[]> => ["g1"]),
  config: vi.fn(),
  mentionable: vi.fn(async (_guildId: string, ids: string[]) => ids),
  syncGuild: vi.fn(async () => undefined),
  render: vi.fn(async () => Buffer.from("png")),
  fetchBadges: vi.fn(async () => null),
  store: {
    claimAnnouncement: vi.fn(async () => true),
    releaseAnnouncement: vi.fn(async () => undefined),
    announcedUsers: vi.fn(async () => new Set<string>()),
    announcementOptOuts: vi.fn(async () => new Set<string>()),
    pruneAnnouncements: vi.fn(async () => undefined),
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
vi.mock("#core/services/module.service.js", () => ({
  default: { getActivatedGuildIds: mocks.activated },
}));
vi.mock("#core/services/config.service.js", () => ({
  default: { getConfigForModuleIn: mocks.config },
}));
vi.mock("#core/services/mention.service.js", () => ({
  default: { mentionable: mocks.mentionable },
}));
vi.mock("#lib/players.js", () => ({
  resolvePlayers: async () => new Map(),
}));
vi.mock("#modules/rngdle/rendering/roll-card.js", () => ({
  renderRollCard: mocks.render,
}));
vi.mock("./badges.js", () => ({ fetchRollBadges: mocks.fetchBadges }));
vi.mock("./store.js", () => ({ default: mocks.store }));
vi.mock("./sync.js", () => ({ default: { syncGuild: mocks.syncGuild } }));

import {
  announceRolls,
  answerShare,
  computeHighlights,
} from "./announcements.js";

const NOW = new Date("2026-10-22T12:00:00Z");
const DAY = new Date("2026-10-22T00:00:00Z");
const SHARE = "RNGdle 🎲 111883\n\n🟧 ANOMALY • Top 4%\n\n41 731 EP";

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

function roll(
  userId: string,
  score: number,
  rolledAt = new Date("2026-10-22T11:00:00Z")
): StoredRoll {
  return { userId, number: score, score, badgeCount: 3, rolledAt };
}

function configWith(values: Record<string, unknown>) {
  return { get: (key: string) => values[key], t, locale: "fr" };
}

function leaderboardChannel() {
  return { id: "c1", isSendable: () => true, send: vi.fn(async () => ({})) };
}

function shareMessage(content = SHARE) {
  return {
    content,
    author: { id: "u1", bot: false },
    guildId: "g1",
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
  mocks.store.claimAnnouncement.mockResolvedValue(true);
  mocks.store.announcedUsers.mockResolvedValue(new Set());
  mocks.store.announcementOptOuts.mockResolvedValue(new Set());
  mocks.store.rolls.mockResolvedValue([]);
  mocks.store.account.mockResolvedValue(null);
});

describe("computeHighlights", () => {
  const today = roll("me", 5000);

  it("celebrates a personal best above every previous roll", () => {
    const highlights = computeHighlights(t, today, [roll("me", 4000)], []);
    expect(highlights.map((h) => h.text)).toEqual(["card.personalBest"]);
  });

  it("does not call the first roll a personal best", () => {
    expect(computeHighlights(t, today, [], [])).toEqual([]);
  });

  it("ranks the roll among the other players of the day", () => {
    const highlights = computeHighlights(
      t,
      today,
      [],
      [today, roll("a", 9000), roll("b", 100)]
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
    const below = computeHighlights(t, roll("me", 2000), previous, []);
    expect(below.at(-1)?.text).toBe('card.vsAverage {"delta":"−1 000"}');
    expect(
      computeHighlights(t, today, previous.slice(1), []).map((h) => h.text)
    ).not.toContain(expect.stringContaining("vsAverage"));
  });
});

describe("answerShare", () => {
  it("replies to a shared result with a card, without pinging", async () => {
    const message = shareMessage();
    await answerShare(
      message as never,
      configWith({ shareCards: true }) as never
    );

    expect(mocks.store.claimAnnouncement).toHaveBeenCalledWith(
      "g1",
      "u1",
      DAY,
      111883
    );
    expect(message.reply).toHaveBeenCalledWith({
      files: [expect.objectContaining({ name: "rngdle-roll.png" })],
      allowedMentions: { parse: [], repliedUser: false },
    });
  });

  it("stays silent when the roll was already shown today", async () => {
    mocks.store.claimAnnouncement.mockResolvedValue(false);
    const message = shareMessage();
    await answerShare(
      message as never,
      configWith({ shareCards: true }) as never
    );

    expect(message.reply).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it.each([
    ["the feature is off", configWith({ shareCards: false }), shareMessage()],
    [
      "the message is not a result",
      configWith({ shareCards: true }),
      shareMessage("bonjour"),
    ],
    [
      "a bot posted it",
      configWith({ shareCards: true }),
      { ...shareMessage(), author: { id: "u1", bot: true } },
    ],
  ])("ignores the message when %s", async (_, config, message) => {
    await answerShare(message as never, config as never);
    expect(mocks.store.claimAnnouncement).not.toHaveBeenCalled();
    expect(message.reply).not.toHaveBeenCalled();
  });

  it("frees the day when the reply fails", async () => {
    const message = shareMessage();
    message.reply.mockRejectedValue(new Error("boom"));

    await expect(
      answerShare(message as never, configWith({ shareCards: true }) as never)
    ).rejects.toThrow("boom");
    expect(mocks.store.releaseAnnouncement).toHaveBeenCalledWith(
      "g1",
      "u1",
      DAY
    );
  });

  it("leaves the highlights out for a member who is not linked", async () => {
    mocks.store.rolls.mockResolvedValue([roll("u1", 100)]);
    await answerShare(
      shareMessage() as never,
      configWith({ shareCards: true }) as never
    );

    expect(mocks.store.rolls).not.toHaveBeenCalled();
    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({ highlights: [] }),
      expect.anything()
    );
  });

  it("adds the highlights for a linked member", async () => {
    mocks.store.account.mockResolvedValue({ userId: "u1" });
    mocks.store.rolls.mockImplementation(async (_guildId, filter) =>
      filter?.userId ? [roll("u1", 100)] : []
    );
    await answerShare(
      shareMessage() as never,
      configWith({ shareCards: true }) as never
    );

    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({
        highlights: [expect.objectContaining({ text: "card.personalBest" })],
      }),
      expect.anything()
    );
  });
});

describe("announceRolls", () => {
  it("posts each new roll once, with a silent mention", async () => {
    const channel = leaderboardChannel();
    mocks.config.mockResolvedValue(configWith({ leaderboardChannel: channel }));
    mocks.store.rolls.mockResolvedValue([roll("u1", 10), roll("u2", 20)]);
    mocks.store.announcedUsers.mockResolvedValue(new Set(["u2"]));
    mocks.mentionable.mockResolvedValue([]);

    await announceRolls({} as never, { id: "rngdle" } as never, NOW);

    expect(mocks.syncGuild).toHaveBeenCalledWith("g1");
    expect(mocks.store.rolls).toHaveBeenCalledWith("g1", {
      from: new Date("2026-10-22T09:00:00Z"),
    });
    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'announce.message {"user":"<@u1>"}',
        flags: MessageFlags.SuppressNotifications,
        allowedMentions: { users: [] },
      })
    );
  });

  it("skips the members who turned their announcements off", async () => {
    const channel = leaderboardChannel();
    mocks.config.mockResolvedValue(configWith({ leaderboardChannel: channel }));
    mocks.store.rolls.mockResolvedValue([roll("u1", 10)]);
    mocks.store.announcementOptOuts.mockResolvedValue(new Set(["u1"]));

    await announceRolls({} as never, { id: "rngdle" } as never, NOW);

    expect(mocks.store.claimAnnouncement).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it("does nothing on a server without a daily leaderboard channel", async () => {
    mocks.config.mockResolvedValue(configWith({}));

    await announceRolls({} as never, { id: "rngdle" } as never, NOW);

    expect(mocks.syncGuild).not.toHaveBeenCalled();
    expect(mocks.store.rolls).not.toHaveBeenCalled();
  });

  it("frees the day when the post fails, so the next run retries", async () => {
    const channel = leaderboardChannel();
    channel.send.mockRejectedValue(new Error("boom"));
    mocks.config.mockResolvedValue(configWith({ leaderboardChannel: channel }));
    mocks.store.rolls.mockResolvedValue([roll("u1", 10)]);

    await announceRolls({} as never, { id: "rngdle" } as never, NOW);

    expect(mocks.store.releaseAnnouncement).toHaveBeenCalledWith(
      "g1",
      "u1",
      DAY
    );
  });
});
