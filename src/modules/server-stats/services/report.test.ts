import type { Guild } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportContext } from "./report.js";
import type { DailyStats } from "./store.js";

const mocks = vi.hoisted(() => ({
  renderReportCard: vi.fn(async () => Buffer.from("png")),
  fetchImage: vi.fn(async (url: string | null) => (url ? { url } : null)),
  resolvePlayers: vi.fn(
    async () =>
      new Map([
        ["9", { name: "Lolo", avatar: { url: "lolo.png" } }],
        ["left", { name: "Parti", avatar: null }],
      ])
  ),
}));
vi.mock("#modules/server-stats/rendering/report-card.js", () => ({
  renderReportCard: mocks.renderReportCard,
}));
vi.mock("#lib/imaging.js", () => ({ fetchImage: mocks.fetchImage }));
vi.mock("#lib/players.js", () => ({ resolvePlayers: mocks.resolvePlayers }));

const { renderReport } = await import("./report.js");

const stats: DailyStats = {
  startedAt: new Date("2026-10-12T10:00:00Z"),
  joins: 10,
  activeNewcomers: 4,
  hours: Array.from({ length: 24 }, (_, hour) => (hour === 21 ? 1082 : 0)),
  leaves: 11,
  messages: 1082,
  activeMembers: 52,
  activeChannels: 19,
  reactions: 99,
  topChannels: [
    { id: "1", count: 567 },
    { id: "gone", count: 324 },
  ],
  topMembers: [
    { id: "9", count: 158 },
    { id: "left", count: 40 },
    { id: "unknown", count: 3 },
  ],
  topReactions: [
    { id: "👍", count: 19 },
    { id: "<a:e:456>", count: 10 },
  ],
};

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

const noChange = { change: null, record: false };

const context: ReportContext = {
  day: new Date("2026-10-13T00:00:00Z"),
  insights: {
    joins: { change: 0.5, record: true },
    messages: { change: 0.183, record: false },
    activeMembers: { change: -0.12, record: false },
    reactions: noChange,
  },
  comparedDays: 30,
  showTopMembers: true,
  t,
  locale: "fr",
};

const guild = {
  memberCount: 13313,
  iconURL: () => "icon.png",
  id: "guild-1",
  channels: { cache: new Map([["1", { name: "général" }]]) },
  client: { client: true },
} as unknown as Guild;

function rendered() {
  const [data, labels] = mocks.renderReportCard.mock.calls[0] as unknown as [
    Record<string, unknown>,
    Record<string, unknown>,
  ];
  return { data, labels };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("renderReport", () => {
  it("announces the day in the message and returns the image", async () => {
    const report = await renderReport(guild, stats, context);
    expect(report.content).toBe(
      'report.message {"date":"mardi 13 octobre 2026"}'
    );
    expect(report.image).toEqual(Buffer.from("png"));
    expect(rendered().labels.subtitle).toBe("mardi 13 octobre 2026");
  });

  it("gives the time counting started on its first day", async () => {
    await renderReport(
      guild,
      { ...stats, startedAt: new Date("2026-10-13T02:12:00Z") },
      context
    );
    expect(rendered().labels.subtitle).toBe(
      'mardi 13 octobre 2026 · report.since {"time":"04:12"}'
    );
  });

  it("names the channels, a deleted one included", async () => {
    await renderReport(guild, stats, context);
    expect(rendered().data.topChannels).toEqual([
      { name: "général", count: 567 },
      { name: "report.deletedChannel", count: 324 },
    ]);
  });

  it("draws custom emojis from their image, wherever they come from", async () => {
    await renderReport(guild, stats, context);
    expect(rendered().data.topReactions).toEqual([
      { text: "👍", image: null, count: 19 },
      {
        text: "?",
        image: { url: "https://cdn.discordapp.com/emojis/456.png?size=64" },
        count: 10,
      },
    ]);
  });

  it("ranks members, those who left and unknown ones included", async () => {
    await renderReport(guild, stats, context);
    expect(mocks.resolvePlayers).toHaveBeenCalledWith(
      { client: true },
      "guild-1",
      ["9", "left", "unknown"]
    );
    expect(rendered().data.topMembers).toEqual([
      { rank: 1, name: "Lolo", avatar: { url: "lolo.png" }, count: 158 },
      { rank: 2, name: "Parti", avatar: null, count: 40 },
      { rank: 3, name: "report.unknownMember", avatar: null, count: 3 },
    ]);
  });

  it("notes trends, records and the newcomers who spoke", async () => {
    await renderReport(guild, stats, context);
    expect(rendered().data.notes).toEqual({
      joins: {
        trend: undefined,
        subtext:
          'report.activeNewcomers {"count":4} · report.record {"count":30}',
        record: true,
      },
      messages: {
        trend: { text: 'report.trend {"change":"+18 %"}', direction: "up" },
        subtext: undefined,
        record: false,
      },
      activeMembers: {
        trend: { text: 'report.trend {"change":"-12 %"}', direction: "down" },
        subtext: undefined,
        record: false,
      },
      reactions: { trend: undefined, subtext: undefined, record: false },
    });
    expect(rendered().data.hours).toEqual(stats.hours);
  });

  it("shows no trend for a change that rounds to 0 %", async () => {
    await renderReport(guild, stats, {
      ...context,
      insights: {
        ...context.insights,
        messages: { change: 0.004, record: false },
        activeMembers: { change: -0.004, record: false },
      },
    });
    expect(rendered().data.notes).toMatchObject({
      messages: { trend: undefined },
      activeMembers: { trend: undefined },
    });
  });

  it("hides the hours and the newcomers of a day not counted by hour in full", async () => {
    await renderReport(
      guild,
      { ...stats, hours: stats.hours.map((count) => count / 2) },
      context
    );
    expect(rendered().data.hours).toEqual(stats.hours.map(() => 0));
    expect(rendered().data.notes).toMatchObject({
      joins: { subtext: 'report.record {"count":30}' },
    });
  });

  it("says nothing of the newcomers on a day without arrivals", async () => {
    await renderReport(
      guild,
      { ...stats, joins: 0, activeNewcomers: 0 },
      { ...context, insights: { ...context.insights, joins: noChange } }
    );
    expect(rendered().data.notes).toMatchObject({
      joins: { subtext: undefined, record: false },
    });
  });

  it("leaves the members out when disabled", async () => {
    await renderReport(guild, stats, { ...context, showTopMembers: false });
    expect(rendered().data.topMembers).toBeNull();
  });
});
