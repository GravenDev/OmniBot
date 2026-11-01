import { beforeAll, describe, expect, it } from "vitest";
import { createT } from "#lib/i18n.js";
import { initTestI18n } from "#lib/testing.js";
import en from "../i18n/en.json" with { type: "json" };
import fr from "../i18n/fr.json" with { type: "json" };
import {
  birthdayCard,
  birthdayMessage,
  cardContent,
  formatPercent,
  milestoneEmbed,
  pickGuildMessage,
} from "./announcements.js";

beforeAll(async () => {
  await initTestI18n("birthday", { en, fr });
});

const t = () => createT("fr", "birthday");

describe("pickGuildMessage", () => {
  it("ignores blank messages, and has none to offer without any", () => {
    expect(pickGuildMessage(["  ", "Bravo {user}"], () => 0)).toBe(
      "Bravo {user}"
    );
    expect(pickGuildMessage(["  "])).toBeNull();
  });
});

describe("birthdayMessage", () => {
  it("fills a guild message with the member", () => {
    expect(birthdayMessage(t(), "fr", "Bravo {user} ! {user} 🎉", ["42"])).toBe(
      "Bravo <@42> ! <@42> 🎉"
    );
  });

  it("falls back to the built-in messages", () => {
    expect(birthdayMessage(t(), "fr", null, ["42"], () => 0)).toBe(
      "🎂 Joyeux anniversaire <@42> !"
    );
  });

  it("cuts a guild message Discord would refuse", () => {
    const message = birthdayMessage(t(), "fr", "{user} " + "x".repeat(2100), [
      "42",
    ]);
    expect(message.length).toBeLessThanOrEqual(2000);
    expect(message.startsWith("<@42> ")).toBe(true);
  });

  it("wishes the birthday twins together", () => {
    expect(birthdayMessage(t(), "fr", null, ["1", "2", "3"])).toBe(
      "🎂 Aujourd'hui, <@1>, <@2> et <@3> fêtent leur anniversaire ensemble. Bon anniversaire !"
    );
  });
});

describe("cardContent", () => {
  it("mentions every member celebrating", () => {
    expect(cardContent(t(), "fr", ["1", "2"])).toBe(
      "🎂 Joyeux anniversaire <@1> et <@2> !"
    );
  });
});

describe("birthdayCard", () => {
  const today = { day: 1, month: 11 };

  it("quotes the guild's message under the fixed title", () => {
    const card = birthdayCard(t(), "fr", ["Camille"], "Bravo {user} !", today);
    expect(card.labels).toEqual({
      kicker: "Anniversaire",
      title: "Joyeux anniversaire !",
      date: "1er novembre",
      message: { text: "Bravo Camille !", open: "« ", close: " »" },
    });
    expect(card.alt).toBe(
      "Carte d'anniversaire : Camille, 1er novembre. Message du serveur : « Bravo Camille ! »"
    );
  });

  it("draws no built-in message: the title already says it", () => {
    expect(
      birthdayCard(t(), "fr", ["Camille"], null, today).labels.message
    ).toBeUndefined();
  });

  it("names the day after the number of members celebrating", () => {
    const names = ["A", "B", "C", "D", "E"];
    const title = (count: number) =>
      birthdayCard(t(), "fr", names.slice(0, count), "Bravo {user}", today)
        .labels;
    expect(title(3)).toMatchObject({
      kicker: "Anniversaires",
      title: "Triple anniversaire !",
    });
    expect(title(5).title).toBe("5 anniversaires aujourd'hui");
    // The guild's message is written for one member.
    expect(title(2).message).toBeUndefined();
  });

  it("writes the date without superscript letters", () => {
    expect(
      birthdayCard(createT("en", "birthday"), "en", ["A"], null, today).labels
        .date
    ).toBe("November 1");
  });
});

describe("milestoneEmbed", () => {
  it("compares the first collision with the theory", () => {
    const embed = milestoneEmbed(t(), "first-collision", {
      count: 14,
      expectedFirstCollision: 24.617,
      locale: "fr",
    }).toJSON();
    expect(embed.author?.name).toBe("🎲 Paradoxe des anniversaires");
    expect(embed.title).toBe("Premier anniversaire partagé !");
    expect(embed.description).toBe(
      "Deux membres ont la même date depuis le 14ᵉ inscrit. En moyenne, la théorie l'attend autour de 24,6 inscrits."
    );
    expect(embed.fields?.map((field) => field.value)).toEqual([
      // Intl's space before "%" depends on the ICU version.
      expect.stringMatching(/^22\s%$/),
      expect.stringMatching(/^23 inscrits · 50\s%$/),
    ]);
    expect(
      milestoneEmbed(createT("en", "birthday"), "first-collision", {
        count: 22,
        expectedFirstCollision: 24.617,
        locale: "en",
      }).toJSON().description
    ).toContain("since the 22nd registration");
  });

  it("has no next milestone past the last one", () => {
    const embed = milestoneEmbed(t(), "certain", {
      count: 57,
      expectedFirstCollision: 24.617,
      locale: "fr",
    }).toJSON();
    expect(embed.title).toBe("57 anniversaires enregistrés");
    expect(embed.fields).toHaveLength(1);
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
