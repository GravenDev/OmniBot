import { beforeAll, describe, expect, it } from "vitest";
import { initTestI18n, makeTestConfig } from "#lib/testing.js";
import { counterEmbed } from "./counter.js";
import { honeypotConfigSchema } from "./honeypot.config.js";
import en from "./i18n/en.json" with { type: "json" };

beforeAll(async () => {
  await initTestI18n("honeypot", { en });
});

const t = makeTestConfig("honeypot", honeypotConfigSchema).t;

describe("counterEmbed", () => {
  it("counts the bees, singular then plural", () => {
    const lastAt = new Date("2026-10-31T12:00:00Z");
    expect(counterEmbed(t, 1, lastAt).data.description).toBe(
      "🐝 **1** little bee fell into the trap.\n" +
        "Latest sweet tooth: <t:1793448000:R>"
    );
    expect(counterEmbed(t, 42, lastAt).data.description).toContain(
      "**42** little bees fell into the trap."
    );
  });
});
