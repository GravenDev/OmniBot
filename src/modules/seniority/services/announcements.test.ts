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
        // The heading goes above the card: the lines follow it, one a group.
        content: "**3 ans** · <@2> <@3>\n**1 an** · <@1> <@4>",
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
    expect(messages[1]!.content.startsWith("**1 an** · <@100> ")).toBe(true);
    expect(messages[2]!.content.startsWith("**1 an** · <@200> ")).toBe(true);
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
    // 4000 characters in a message laid out with components, the heading's
    // included.
    expect(
      messages.every(
        ({ content }) =>
          content.length + "🎉 **Ancienneté sur le serveur**".length <= 4000
      )
    ).toBe(true);
    expect(new Set(messages.flatMap(({ userIds }) => userIds))).toEqual(
      new Set(ids)
    );
    // Every message names only the members it mentions.
    for (const { content, userIds } of messages) {
      expect(content.match(/<@\d+>/g)).toEqual(userIds.map((id) => `<@${id}>`));
    }
  });

  it("puts every mention on the line of its own years, across cuts", () => {
    const anniversaries = Array.from({ length: 300 }, (_, index) => ({
      userId: String(10n ** 19n + BigInt(index)),
      years: 1 + (index % 7),
    }));
    const messages = memberAnniversaryMessages(t(), anniversaries);
    const read: MemberAnniversary[] = [];
    for (const { content } of messages) {
      for (const line of content.split("\n")) {
        const header = /^\*\*(\d+) ans?\*\* · /.exec(line);
        expect(header, `"${line}" has no years`).not.toBeNull();
        for (const [, userId] of line.matchAll(/<@(\d+)>/g)) {
          read.push({ userId: userId!, years: Number(header![1]) });
        }
      }
    }
    const expected = [...anniversaries].sort((a, b) => b.years - a.years);
    expect(read).toEqual(expected);
  });

  it("cuts on length too, a cut line starting on its years again", () => {
    // A small limit, so that length cuts before 100 mentions.
    const ids = Array.from({ length: 20 }, (_, index) => String(1000 + index));
    const messages = memberAnniversaryMessages(t(), at(4, ...ids), 60);
    expect(messages.length).toBeGreaterThan(1);
    expect(messages.every(({ userIds }) => userIds.length < 100)).toBe(true);
    for (const { content } of messages) {
      expect(content.length).toBeLessThanOrEqual(60);
      expect(content.startsWith("**4 ans** · ")).toBe(true);
    }
    expect(messages.flatMap(({ userIds }) => userIds)).toEqual(ids);
  });

  it("starts a message on a group header, never on bare mentions", () => {
    const ids = Array.from({ length: 150 }, (_, index) => String(index));
    const messages = memberAnniversaryMessages(t(), at(4, ...ids));
    expect(messages[1]!.content.startsWith("**4 ans** · ")).toBe(true);
  });

  it("says nothing without anniversaries", () => {
    expect(memberAnniversaryMessages(t(), [])).toEqual([]);
  });
});

describe("serverAnniversaryMessage", () => {
  const facts = {
    years: 10,
    createdOn: "1er novembre 2016",
    members: 12480,
    eldest: { name: "nora_", since: "3 mars 2017" },
  };

  it("says what the card says: creation, members, longest-standing member", () => {
    expect(serverAnniversaryMessage(t(), "fr", facts)).toBe(
      [
        "🎂 **Le serveur fête ses 10 ans aujourd'hui !**",
        "Créé le 1er novembre 2016 · 12 480 membres",
        "Plus ancienne présence : nora\\_, depuis le 3 mars 2017",
      ].join("\n")
    );
  });

  it("leaves the longest-standing member out on a server of bots only", () => {
    expect(
      serverAnniversaryMessage(t(), "fr", { ...facts, years: 1, eldest: null })
    ).toBe(
      "🎂 **Le serveur fête son premier anniversaire aujourd'hui !**\nCréé le 1er novembre 2016 · 12 480 membres"
    );
  });
});
