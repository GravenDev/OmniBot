import { beforeAll, describe, expect, it } from "vitest";
import { createT } from "#lib/i18n.js";
import { initTestI18n } from "#lib/testing.js";
import en from "../i18n/en.json" with { type: "json" };
import fr from "../i18n/fr.json" with { type: "json" };
import {
  birthdayMessage,
  formatPercent,
  milestoneMessage,
} from "./announcements.js";

beforeAll(async () => {
  await initTestI18n("birthday", { en, fr });
});

const t = () => createT("fr", "birthday");

describe("birthdayMessage", () => {
  it("fills a guild message with the member", () => {
    expect(
      birthdayMessage(t(), "fr", ["Bravo {user} ! {user} 🎉"], ["42"])
    ).toBe("Bravo <@42> ! <@42> 🎉");
  });

  it("falls back to the built-in messages", () => {
    expect(birthdayMessage(t(), "fr", ["  "], ["42"], () => 0)).toBe(
      "🎂 Joyeux anniversaire <@42> !"
    );
  });

  it("cuts a guild message Discord would refuse", () => {
    const message = birthdayMessage(
      t(),
      "fr",
      ["{user} " + "x".repeat(2100)],
      ["42"]
    );
    expect(message.length).toBeLessThanOrEqual(2000);
    expect(message.startsWith("<@42> ")).toBe(true);
  });

  it("wishes the birthday twins together", () => {
    expect(birthdayMessage(t(), "fr", [], ["1", "2", "3"])).toBe(
      "🎂 Aujourd'hui, <@1>, <@2> et <@3> fêtent leur anniversaire ensemble. Bon anniversaire !"
    );
  });
});

describe("milestoneMessage", () => {
  it("compares the first collision with the theory", () => {
    expect(
      milestoneMessage(t(), "first-collision", {
        count: 14,
        expectedFirstCollision: 24.617,
        locale: "fr",
      })
    ).toBe(
      "🎲 **Premier anniversaire partagé !** Deux membres ont la même date depuis le 14ᵉ inscrit. En moyenne, la théorie l'attend autour de 24,6 inscrits."
    );
    expect(
      milestoneMessage(createT("en", "birthday"), "first-collision", {
        count: 22,
        expectedFirstCollision: 24.617,
        locale: "en",
      })
    ).toContain("since the 22nd registration");
  });
});

describe("formatPercent", () => {
  it("keeps a decimal close to certainty", () => {
    expect(formatPercent(0.9951, "en")).toBe("99.5%");
  });

  it("never rounds up to a milestone or to certainty", () => {
    expect(formatPercent(0.5073, "en")).toBe("50%");
    expect(formatPercent(0.988, "en")).toBe("98%");
    expect(formatPercent(0.99977, "en")).toBe("99.9%");
  });
});
