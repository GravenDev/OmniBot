import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createT } from "#lib/i18n.js";
import { initTestI18n } from "#lib/testing.js";
import { alertMessage, CONTENT_LIMIT, purgedMessage } from "./alert-view.js";
import type { Report } from "./store.js";

beforeAll(async () => {
  const en = JSON.parse(
    readFileSync(new URL("../i18n/en.json", import.meta.url), "utf8")
  );
  await initTestI18n("reports", { en });
});

const t = createT("en", "reports");
const noHistory = { total: 0, sanctioned: 0 };

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: 7,
    guildId: "g1",
    channelId: "c1",
    messageId: "m1",
    authorId: "author-1",
    content: "you are an idiot",
    attachments: [],
    messageCreatedAt: new Date("2026-10-01T10:00:00Z"),
    messageState: "present",
    editedContent: null,
    reactionKept: false,
    alertChannelId: null,
    alertMessageId: null,
    status: "open",
    handledBy: null,
    handledAt: null,
    createdAt: new Date("2026-10-01T10:05:00Z"),
    reporters: [
      {
        userId: "rep-1",
        source: "reaction",
        reason: null,
        reportedAt: new Date("2026-10-01T10:05:00Z"),
      },
    ],
    actions: [],
    ...overrides,
  };
}

function flatten(node: unknown, out: { texts: string[]; buttons: any[] }) {
  if (Array.isArray(node)) {
    node.forEach((child) => flatten(child, out));
    return out;
  }
  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (typeof record["content"] === "string")
      out.texts.push(record["content"]);
    if (typeof record["custom_id"] === "string") out.buttons.push(record);
    Object.values(record).forEach((child) => flatten(child, out));
  }
  return out;
}

function render(value: Report, history = noHistory, role?: string) {
  const message = alertMessage(value, { t, history, moderatorRoleId: role });
  const json = message.components.map((component) => component.toJSON());
  const { texts, buttons } = flatten(json, { texts: [], buttons: [] });
  return { message, text: texts.join("\n"), buttons };
}

describe("alertMessage", () => {
  it("shows the author, the quoted content and the reporters", () => {
    const { text } = render(report());

    expect(text).toContain("Report #7");
    expect(text).toContain("<@author-1>");
    expect(text).toContain("> you are an idiot");
    expect(text).toContain("Reported by** 1 member: <@rep-1>");
    expect(text).toContain("https://discord.com/channels/g1/c1/m1");
    expect(text).toContain("no previous report");
  });

  it("offers every action while the report is open", () => {
    const { buttons } = render(report());

    expect(buttons.map((button) => button.custom_id)).toEqual([
      "report-delete:7",
      "report-warn:7",
      "report-timeout:7",
      "report-kick:7",
      "report-ban:7",
      "report-dismiss:7",
      "report-abusive:7",
    ]);
  });

  it("keeps only delete and reopen once closed", () => {
    const { buttons, text } = render(
      report({
        status: "dismissed",
        handledBy: "mod-1",
        handledAt: new Date("2026-10-01T11:00:00Z"),
      })
    );

    expect(buttons.map((button) => button.custom_id)).toEqual([
      "report-delete:7",
      "report-reopen:7",
    ]);
    expect(text).toContain("Dismissed** by <@mod-1>");
  });

  it("disables delete when the message is already gone", () => {
    const { buttons, text } = render(report({ messageState: "deleted" }));

    expect(buttons[0]).toMatchObject({
      custom_id: "report-delete:7",
      disabled: true,
    });
    expect(text).toContain("The message was deleted");
  });

  it("pings only the moderator role, never the quoted content", () => {
    const { message, text } = render(
      report({ content: "hey <@everyone-target> @everyone" }),
      noHistory,
      "role-9"
    );

    expect(text).toContain("<@&role-9>");
    expect(message.allowedMentions).toEqual({ parse: [], roles: ["role-9"] });
  });

  it("truncates a long message", () => {
    const { text } = render(
      report({ content: "a".repeat(CONTENT_LIMIT + 500) })
    );

    expect(text).toContain(`${"a".repeat(CONTENT_LIMIT - 1)}…`);
    expect(text).not.toContain("a".repeat(CONTENT_LIMIT));
  });

  it("lists reasons, history, edits and the action log", () => {
    const { text } = render(
      report({
        reporters: [
          {
            userId: "rep-1",
            source: "menu",
            reason: "insult\nagain",
            reportedAt: new Date(),
          },
          {
            userId: "rep-2",
            source: "reaction",
            reason: null,
            reportedAt: new Date(),
          },
        ],
        messageState: "edited",
        editedContent: "sorry",
        reactionKept: true,
        actions: [
          {
            moderatorId: "mod-1",
            action: "timeout",
            reason: "calm down",
            duration: 3600,
            failed: true,
            createdAt: new Date(),
          },
        ],
      }),
      { total: 3, sanctioned: 1 }
    );

    expect(text).toContain("Reported by** 2 members");
    expect(text).toContain("- <@rep-1> : insult again");
    expect(text).toContain("3 previous reports, 1 sanctioned");
    expect(text).toContain("> sorry");
    expect(text).toContain("could not be removed");
    expect(text).toContain("timed out (1h) — calm down ❌ (failed)");
  });
});

describe("purgedMessage", () => {
  it("drops every detail of the report", () => {
    const json = purgedMessage(7, t).components.map((c) => c.toJSON());
    const { texts, buttons } = flatten(json, { texts: [], buttons: [] });

    expect(texts.join("\n")).toContain("Report #7 purged");
    expect(buttons).toEqual([]);
  });
});
