import { beforeAll, describe, expect, it } from "vitest";
import { createT } from "#lib/i18n.js";
import { initTestI18n } from "#lib/testing.js";
import en from "../i18n/en.json" with { type: "json" };
import fr from "../i18n/fr.json" with { type: "json" };
import {
  chunkLines,
  memberAnniversaryMessages,
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
