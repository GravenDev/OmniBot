import { describe, expect, it } from "vitest";
import reminders from "./reminders.service.js";

const t = (key: string, options: Record<string, unknown> = {}) =>
  `${key}|${options["users"]}|${options["deadline"]}`;

const now = new Date(Date.UTC(2026, 9, 12, 18, 3, 27));
const midnight = Date.UTC(2026, 9, 13) / 1000;

describe("UTC day boundaries", () => {
  it("computes the start of the day and the next midnight", () => {
    expect(reminders.startOfUtcDay(now)).toEqual(
      new Date(Date.UTC(2026, 9, 12))
    );
    expect(reminders.nextUtcMidnight(now)).toEqual(
      new Date(Date.UTC(2026, 9, 13))
    );
    expect(
      reminders.nextUtcMidnight(new Date(Date.UTC(2026, 11, 31, 23, 59)))
    ).toEqual(new Date(Date.UTC(2027, 0, 1)));
  });

  it("formats the daily reminder time as a Discord time", () => {
    expect(reminders.reminderTimestamp(now)).toBe(
      `<t:${Date.UTC(2026, 9, 12, 18) / 1000}:t>`
    );
  });
});

describe("reminderMessages", () => {
  it("returns nothing when nobody needs a reminder", () => {
    expect(reminders.reminderMessages(t, [], new Set(), now)).toEqual([]);
  });

  it("mentions every user once with a relative deadline at midnight UTC, pinging only the mentionable ones", () => {
    expect(
      reminders.reminderMessages(t, ["1", "2", "3"], new Set(["1", "3"]), now)
    ).toEqual([
      {
        content: `remind.message|<@1> <@2> <@3>|<t:${midnight}:R>`,
        allowedMentions: { users: ["1", "3"] },
      },
    ]);
  });

  it("splits into several messages under the Discord limit, each pinging only its own mentionable users", () => {
    const ids = Array.from(
      { length: 200 },
      (_, i) => `${10n ** 18n + BigInt(i)}`
    );
    const mentionable = new Set(ids.filter((_, i) => i % 3 !== 0));
    const messages = reminders.reminderMessages(t, ids, mentionable, now);

    expect(messages.length).toBeGreaterThan(1);
    for (const { content, allowedMentions } of messages) {
      expect(content.length).toBeLessThanOrEqual(2000);
      const mentioned = content.match(/<@(\d+)>/g)!.map((m) => m.slice(2, -1));
      expect(allowedMentions.users).toEqual(
        mentioned.filter((id) => mentionable.has(id))
      );
      expect(allowedMentions.users.length).toBeLessThanOrEqual(100);
    }
    expect(
      messages
        .map((message) => message.content)
        .join(" ")
        .match(/<@\d+>/g)
    ).toEqual(ids.map((id) => `<@${id}>`));
  });
});
