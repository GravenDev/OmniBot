import { beforeAll, describe, expect, it } from "vitest";
import { createT } from "#lib/i18n.js";
import { initTestI18n } from "#lib/testing.js";
import en from "../i18n/en.json" with { type: "json" };
import fr from "../i18n/fr.json" with { type: "json" };
import {
  memberAnniversaryMessages,
  serverAnniversaryMessage,
  type MemberAnniversary,
} from "./announcements.js";

beforeAll(async () => {
  await initTestI18n("seniority", { en, fr });
});

const t = () => createT("fr", "seniority");

const at = (years: number, ...ids: string[]): MemberAnniversary[] =>
  ids.map((userId) => ({ userId, years }));

describe("memberAnniversaryMessages", () => {
  it("groups the members by years, longest-standing first, in their order", () => {
    expect(
      memberAnniversaryMessages(t(), [
        ...at(1, "1"),
        ...at(3, "2", "3"),
        ...at(1, "4"),
      ])
    ).toEqual([
      {
        content:
          "🎉 **Ancienneté sur le serveur**\n**3 ans**\n<@2> <@3>\n**1 an**\n<@1> <@4>",
        userIds: ["2", "3", "1", "4"],
      },
    ]);
  });

  it("allows at most 100 mentions per message, repeating the group cut", () => {
    const ids = Array.from({ length: 250 }, (_, index) => String(index));
    const messages = memberAnniversaryMessages(t(), [
      ...at(2, ...ids.slice(0, 50)),
      ...at(1, ...ids.slice(50)),
    ]);
    expect(messages.map(({ userIds }) => userIds.length)).toEqual([
      100, 100, 50,
    ]);
    expect(messages.flatMap(({ userIds }) => userIds)).toEqual(ids);
    expect(messages[1]!.content.startsWith("**1 an**\n<@100> ")).toBe(true);
    expect(messages[2]!.content.startsWith("**1 an**\n<@200> ")).toBe(true);
  });

  it("stays under Discord's length limit with real ids", () => {
    const ids = Array.from({ length: 200 }, (_, index) =>
      String(10n ** 19n + BigInt(index))
    );
    const messages = memberAnniversaryMessages(
      t(),
      ids.map((userId, index) => ({ userId, years: 1 + (index % 7) }))
    );
    expect(messages.length).toBeGreaterThan(1);
    expect(messages.every(({ content }) => content.length <= 2000)).toBe(true);
    expect(new Set(messages.flatMap(({ userIds }) => userIds))).toEqual(
      new Set(ids)
    );
    // Every message names only the members it mentions.
    for (const { content, userIds } of messages) {
      expect(content.match(/<@\d+>/g)).toEqual(userIds.map((id) => `<@${id}>`));
    }
  });

  it("puts every mention under its own years, across length cuts", () => {
    // Long ids: the messages are cut on length, well before 100 mentions.
    const anniversaries = Array.from({ length: 200 }, (_, index) => ({
      userId: String(10n ** 19n + BigInt(index)),
      years: 1 + (index % 7),
    }));
    const messages = memberAnniversaryMessages(t(), anniversaries);
    expect(messages.every(({ userIds }) => userIds.length < 100)).toBe(true);
    const read: MemberAnniversary[] = [];
    messages.forEach(({ content }, index) => {
      const lines = content.split("\n");
      if (index === 0) {
        expect(lines.shift()).toBe("🎉 **Ancienneté sur le serveur**");
      }
      let years: number | null = null;
      for (const line of lines) {
        const header = /^\*\*(\d+) ans?\*\*$/.exec(line);
        if (header) {
          years = Number(header[1]);
          continue;
        }
        expect(years, `"${line}" has no header above it`).not.toBeNull();
        for (const [, userId] of line.matchAll(/<@(\d+)>/g)) {
          read.push({ userId: userId!, years: years! });
        }
      }
    });
    const expected = [...anniversaries].sort((a, b) => b.years - a.years);
    expect(read).toEqual(expected);
  });

  it("starts a message on a group header, never on bare mentions", () => {
    const ids = Array.from({ length: 150 }, (_, index) => String(index));
    const messages = memberAnniversaryMessages(t(), at(4, ...ids));
    expect(messages[1]!.content.startsWith("**4 ans**\n")).toBe(true);
  });

  it("says nothing without anniversaries", () => {
    expect(memberAnniversaryMessages(t(), [])).toEqual([]);
  });
});

describe("serverAnniversaryMessage", () => {
  it("gives the age and the member count", () => {
    expect(serverAnniversaryMessage(t(), { years: 5, members: 1200 })).toBe(
      "🎂 **Le serveur fête ses 5 ans aujourd'hui !**\n1200 membres"
    );
  });
});
