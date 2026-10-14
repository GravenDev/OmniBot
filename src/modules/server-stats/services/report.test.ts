import { describe, expect, it } from "vitest";
import { reportEmbed, type ReportContext } from "./report.js";
import type { DailyStats } from "./store.js";

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

const stats: DailyStats = {
  startedAt: new Date("2026-10-12T10:00:00Z"),
  joins: 10,
  leaves: 11,
  messages: 1082,
  activeMembers: 52,
  activeChannels: 19,
  reactions: 99,
  topChannels: [
    { id: "1", count: 567 },
    { id: "2", count: 324 },
  ],
  topMembers: [{ id: "9", count: 158 }],
  topReactions: [
    { id: "👍", count: 19 },
    { id: "<:graven:123>", count: 10 },
  ],
};

const context: ReportContext = {
  day: new Date("2026-10-13T00:00:00Z"),
  memberCount: 13313,
  showTopMembers: true,
  t,
  locale: "fr",
};

function field(embed: ReturnType<typeof reportEmbed>, name: string) {
  return embed.data.fields?.find((entry) => entry.name === name)?.value;
}

describe("reportEmbed", () => {
  it("titles the report with the day and the start of counting", () => {
    const embed = reportEmbed(stats, context);
    expect(embed.data.title).toBe(
      'report.title {"date":"mardi 13 octobre 2026"}'
    );
    expect(embed.data.description).toBe(
      'report.since {"since":"<t:1791799200:R>"}'
    );
  });

  it("shows the totals in the server's locale", () => {
    const embed = reportEmbed(stats, context);
    expect(field(embed, "report.memberCount")).toBe("13 313");
    expect(field(embed, "report.joins")).toBe("10");
    expect(field(embed, "report.leaves")).toBe("11");
    expect(field(embed, "report.messages")).toBe("1 082");
    expect(field(embed, "report.activeMembers")).toBe("52");
    expect(field(embed, "report.activeChannels")).toBe("19");
    expect(field(embed, "report.reactions")).toBe("99");
  });

  it("ranks channels, members and reactions without pinging", () => {
    const embed = reportEmbed(stats, context);
    expect(field(embed, "report.topChannels")).toBe(
      "**567** · <#1>\n**324** · <#2>"
    );
    expect(field(embed, "report.topMembers")).toBe("**158** · <@9>");
    expect(field(embed, "report.topReactions")).toBe(
      "**19** · 👍\n**10** · <:graven:123>"
    );
  });

  it("shows a dash for an empty ranking", () => {
    const embed = reportEmbed(
      { ...stats, topChannels: [], topMembers: [], topReactions: [] },
      context
    );
    expect(field(embed, "report.topChannels")).toBe("—");
    expect(field(embed, "report.topReactions")).toBe("—");
    expect(field(embed, "report.topMembers")).toBe("—");
  });

  it("hides the members ranking when disabled", () => {
    const embed = reportEmbed(stats, { ...context, showTopMembers: false });
    expect(field(embed, "report.topMembers")).toBeUndefined();
    expect(embed.data.fields).toHaveLength(9);
  });
});
