import type { Guild } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO_INSIGHTS } from "./insights.js";

const mocks = vi.hoisted(() => ({
  dailyStats: vi.fn(),
  periodStats: vi.fn(),
  history: vi.fn(async () => new Map()),
  renderReport: vi.fn(async () => ({
    content: "Server stats",
    image: Buffer.from("png"),
  })),
}));
vi.mock("./store.js", () => ({
  default: {
    dailyStats: mocks.dailyStats,
    periodStats: mocks.periodStats,
    history: mocks.history,
  },
}));
vi.mock("./report.js", () => ({ renderReport: mocks.renderReport }));

const { statsReport } = await import("./views.js");

const guild = { id: "guild-1" } as Guild;
// Friday 30 October 2026, 14:32 in Paris.
const now = new Date("2026-10-30T13:32:00Z");
const today = new Date("2026-10-30T00:00:00Z");
const yesterday = new Date("2026-10-29T00:00:00Z");
const options = {
  now,
  showTopMembers: true,
  t: (key: string) => key,
  locale: "fr",
};

const stats = {
  startedAt: new Date("2026-10-01T10:00:00Z"),
  joins: 0,
  activeNewcomers: 0,
  hours: Array.from({ length: 24 }, () => 0),
  leaves: 0,
  messages: 40,
  activeMembers: 6,
  activeChannels: 2,
  reactions: 0,
  topChannels: [],
  topMembers: [],
  topReactions: [],
};

const context = () =>
  (
    mocks.renderReport.mock.calls[0] as unknown as [unknown, unknown, object]
  )[2];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dailyStats.mockResolvedValue(stats);
  mocks.periodStats.mockResolvedValue(stats);
});

describe("statsReport", () => {
  it("compares a past day with the days counted before it", async () => {
    const totals = { joins: 0, messages: 10, activeMembers: 2, reactions: 0 };
    mocks.history.mockResolvedValueOnce(
      new Map(
        Array.from({ length: 7 }, (_, offset) => [
          new Date(yesterday.getTime() - (offset + 1) * 86_400_000).getTime(),
          totals,
        ])
      )
    );

    await statsReport(guild, { from: yesterday, to: yesterday }, options);

    expect(mocks.dailyStats).toHaveBeenCalledWith("guild-1", yesterday);
    expect(mocks.history).toHaveBeenCalledWith(
      "guild-1",
      new Date("2026-10-02T00:00:00Z"),
      new Date("2026-10-28T00:00:00Z")
    );
    expect(context()).toMatchObject({
      day: yesterday,
      lastDay: yesterday,
      until: null,
      comparedDays: 7,
      insights: { messages: { change: 3, record: true } },
    });
  });

  it("compares nothing on a day still going, and says until when it counts", async () => {
    await statsReport(guild, { from: today, to: today }, options);

    expect(mocks.dailyStats).toHaveBeenCalledWith("guild-1", today);
    expect(mocks.history).not.toHaveBeenCalled();
    expect(context()).toMatchObject({
      day: today,
      lastDay: today,
      until: now,
      insights: NO_INSIGHTS,
      comparedDays: 0,
    });
  });

  it("adds the days of a period up, without comparing them", async () => {
    const from = new Date("2026-10-23T00:00:00Z");
    await statsReport(guild, { from, to: yesterday }, options);

    expect(mocks.periodStats).toHaveBeenCalledWith("guild-1", from, yesterday);
    expect(mocks.dailyStats).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
    expect(context()).toMatchObject({
      day: from,
      lastDay: yesterday,
      until: null,
      insights: NO_INSIGHTS,
    });
  });

  it("counts a period ending today up to now", async () => {
    const from = new Date("2026-10-23T00:00:00Z");
    await statsReport(guild, { from, to: today }, options);
    expect(context()).toMatchObject({ until: now });
  });

  it("returns null before counting started", async () => {
    mocks.dailyStats.mockResolvedValueOnce(null);
    expect(
      await statsReport(guild, { from: yesterday, to: yesterday }, options)
    ).toBeNull();
    expect(mocks.renderReport).not.toHaveBeenCalled();
  });
});
