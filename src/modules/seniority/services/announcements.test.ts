import { beforeAll, describe, expect, it } from "vitest";
import { createT } from "#lib/i18n.js";
import { initTestI18n } from "#lib/testing.js";
import en from "../i18n/en.json" with { type: "json" };
import fr from "../i18n/fr.json" with { type: "json" };
import {
  chunkLines,
  memberAnniversaryMessages,
  memberMentionMessages,
  serverAnniversaryMessage,
} from "./announcements.js";

beforeAll(async () => {
  await initTestI18n("seniority", { en, fr });
});

const t = () => createT("fr", "seniority");

describe("chunkLines", () => {
  it("splits past Discord's limit", () => {
    const lines = Array.from({ length: 30 }, () => "x".repeat(99));
    const messages = chunkLines("heading", lines);
    expect(messages.length).toBe(2);
    expect(messages.every((message) => message.length <= 2000)).toBe(true);
    expect(messages.join("\n").split("\n")).toEqual(["heading", ...lines]);
  });

  it("joins with the separator, the heading on its own line", () => {
    expect(chunkLines("heading", ["a", "b"], " ")).toEqual(["heading\na b"]);
  });

  it("puts at most maxLines lines in a message", () => {
    expect(chunkLines("heading", ["a", "b", "c"], " ", 2)).toEqual([
      "heading\na b",
      "c",
    ]);
  });
});

describe("memberMentionMessages", () => {
  it("names the members under the heading, in their order", () => {
    expect(memberMentionMessages(t(), ["2", "1"])).toEqual([
      {
        content: "🎉 **Ancienneté sur le serveur**\n<@2> <@1>",
        userIds: ["2", "1"],
      },
    ]);
  });

  it("allows at most 100 mentions per message", () => {
    const ids = Array.from({ length: 250 }, (_, index) => String(index));
    const messages = memberMentionMessages(t(), ids);
    expect(messages.map(({ userIds }) => userIds.length)).toEqual([
      100, 100, 50,
    ]);
    expect(messages.flatMap(({ userIds }) => userIds)).toEqual(ids);
  });

  it("stays under Discord's length limit with real ids", () => {
    const ids = Array.from({ length: 200 }, (_, index) =>
      String(10n ** 19n + BigInt(index))
    );
    const messages = memberMentionMessages(t(), ids);
    expect(messages.every(({ content }) => content.length <= 2000)).toBe(true);
    expect(messages.flatMap(({ userIds }) => userIds)).toEqual(ids);
  });

  it("says nothing without anniversaries", () => {
    expect(memberMentionMessages(t(), [])).toEqual([]);
  });
});

describe("memberAnniversaryMessages", () => {
  it("lists the longest-standing members first", () => {
    expect(
      memberAnniversaryMessages(t(), [
        { userId: "1", years: 1 },
        { userId: "2", years: 3 },
      ])
    ).toEqual([
      {
        content:
          "🎉 **Ancienneté sur le serveur**\n<@2> est parmi nous depuis **3 ans** aujourd'hui\n<@1> est parmi nous depuis **1 an** aujourd'hui",
        userIds: ["2", "1"],
      },
    ]);
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
