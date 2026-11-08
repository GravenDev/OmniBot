import { beforeAll, describe, expect, it } from "vitest";
import { createT } from "#lib/i18n.js";
import { initTestI18n } from "#lib/testing.js";
import en from "../i18n/en.json" with { type: "json" };
import fr from "../i18n/fr.json" with { type: "json" };
import {
  birthdayCard,
  birthdayMessage,
  cardMessages,
  formatPercent,
  milestoneEmbed,
  pickGuildMessage,
  plainMessage,
  wishMessages,
} from "./announcements.js";

describe("plainMessage", () => {
  const names = {
    user: (id: string) => ({ "1": "Camille" })[id],
    role: (id: string) => ({ "2": "Modération" })[id],
    channel: (id: string) => ({ "3": "général" })[id],
  };

  it("turns mentions into names and drops unknown ones", () => {
    expect(
      plainMessage("Bravo <@1>, <@!1> et <@9> ! <@&2> <#3>", names, "fr")
    ).toBe("Bravo @Camille, @Camille et ! @Modération #général");
  });

  it("keeps emojis, commands and dates readable", () => {
    expect(
      plainMessage(
        "<:gateau:123> <a:fete:456> </birthday set:789> <t:1793534400:D>",
        names,
        "fr"
      )
    ).toBe(":gateau: :fete: /birthday set 1 novembre 2026");
  });

  it("removes the formatting marks", () => {
    expect(
      plainMessage(
        "# Bravo\n> **toi** et *vous* ~~pas~~ __lui__ ||secret|| `code` [lien](https://example.com) \\*",
        names,
        "fr"
      )
    ).toBe("Bravo toi et vous pas lui secret code lien *");
  });

  it("leaves plain text and {user} untouched", () => {
    expect(plainMessage("Joyeux anniversaire {user} !", names, "fr")).toBe(
      "Joyeux anniversaire {user} !"
    );
  });
});

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

// Discord ids are 17 to 20 digits: a mention takes 22 characters or more.
const ids = (count: number) =>
  Array.from({ length: count }, (_, i) => String(10n ** 18n + BigInt(i)));

describe("wishMessages", () => {
  it("wishes one member, or several together, in a single message", () => {
    expect(wishMessages(t(), "fr", "Bravo {user} !", ["42"])).toEqual([
      { content: "Bravo <@42> !", userIds: ["42"] },
    ]);
    expect(wishMessages(t(), "fr", null, ["1", "2"])).toEqual([
      {
        content:
          "🎂 Aujourd'hui, <@1> et <@2> fêtent leur anniversaire ensemble. Bon anniversaire !",
        userIds: ["1", "2"],
      },
    ]);
  });

  it("splits the wishes Discord would refuse, everyone named once", () => {
    const everyone = ids(150);
    const messages = wishMessages(t(), "fr", null, everyone);
    expect(messages.length).toBeGreaterThan(1);
    for (const { content, userIds } of messages) {
      expect(content.length).toBeLessThanOrEqual(2000);
      expect(userIds.length).toBeLessThanOrEqual(100);
      expect(content).toMatch(/^🎂 Joyeux anniversaire /);
      for (const userId of userIds) {
        expect(content).toContain(`<@${userId}>`);
      }
    }
    expect(messages.flatMap(({ userIds }) => userIds)).toEqual(everyone);
  });
});

describe("cardMessages", () => {
  it("mentions every member celebrating", () => {
    expect(cardMessages(t(), "fr", ["1", "2"])).toEqual([
      { content: "🎂 Joyeux anniversaire <@1> et <@2> !", userIds: ["1", "2"] },
    ]);
  });

  it("splits the mentions over messages Discord accepts", () => {
    const everyone = ids(250);
    const messages = cardMessages(t(), "fr", everyone);
    for (const { content, userIds } of messages) {
      expect(content.length).toBeLessThanOrEqual(2000);
      expect(userIds.length).toBeLessThanOrEqual(100);
    }
    expect(messages.flatMap(({ userIds }) => userIds)).toEqual(everyone);
  });

  it("allows no more than 100 mentions per message, however short", () => {
    const short = Array.from({ length: 101 }, (_, i) => String(i));
    expect(
      cardMessages(t(), "fr", short).map(({ userIds }) => userIds.length)
    ).toEqual([100, 1]);
  });
});

describe("birthdayCard", () => {
  const today = { day: 1, month: 11 };

  it("quotes the guild's message under the fixed title", () => {
    const card = birthdayCard(t(), "fr", ["Camille"], "Bravo {user} !", today);
    expect(card.card).toMatchObject({
      kicker: "Anniversaire",
      title: "Joyeux anniversaire !",
      names: "Camille",
      quote: { text: "Bravo Camille !", open: "« ", close: " »" },
      footer: "🎂  1er novembre",
    });
    expect(card.alt).toBe(
      "Carte d'anniversaire : Camille, 1er novembre. Message du serveur : « Bravo Camille ! »"
    );
  });

  it("draws no built-in message: the title already says it", () => {
    expect(
      birthdayCard(t(), "fr", ["Camille"], null, today).card.quote
    ).toBeUndefined();
  });

  it("names the day after the number of members celebrating", () => {
    const names = ["A", "B", "C", "D", "E"];
    const title = (count: number) =>
      birthdayCard(t(), "fr", names.slice(0, count), "Bravo {user}", today)
        .card;
    expect(title(3)).toMatchObject({
      kicker: "Anniversaires",
      title: "Triple anniversaire !",
    });
    expect(title(5)).toMatchObject({
      title: "5 anniversaires aujourd'hui",
      // The first three, then the others counted.
      names: "A · B · C · +2",
    });
    // The guild's message is written for one member.
    expect(title(2).quote).toBeUndefined();
  });

  it("writes the date in the server's language", () => {
    expect(
      birthdayCard(createT("en", "birthday"), "en", ["A"], null, today).card
        .footer
    ).toBe("🎂  November 1");
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
      "Deux membres ont la même date depuis la 14ᵉ inscription. En moyenne, la théorie l'attend autour de 24,6 inscriptions."
    );
    expect(embed.fields?.map((field) => field.value)).toEqual([
      // Intl's space before "%" depends on the ICU version.
      expect.stringMatching(/^22,3\s%$/),
      expect.stringMatching(/^23 inscriptions · 50,7\s%$/),
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
    expect(formatPercent(0.5073, "en")).toBe("50.7%");
    expect(formatPercent(0.988, "en")).toBe("98.8%");
    expect(formatPercent(0.99977, "en")).toBe("99.9%");
  });
});
