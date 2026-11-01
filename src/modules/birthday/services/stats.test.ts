import { beforeAll, describe, expect, it } from "vitest";
import { createT } from "#lib/i18n.js";
import { initTestI18n } from "#lib/testing.js";
import en from "#modules/birthday/i18n/en.json" with { type: "json" };
import fr from "#modules/birthday/i18n/fr.json" with { type: "json" };
import type { BirthdayEntry } from "./birthday.service.js";
import { birthdayStats, statsCardLabels, statsText } from "./stats.js";

const entry = (
  userId: string,
  day: number,
  month: number,
  announce = true
): BirthdayEntry => ({ userId, day, month, announce });

const ENTRIES = [
  entry("a", 14, 3),
  entry("b", 14, 3),
  entry("c", 2, 11),
  entry("d", 2, 11, false),
  entry("e", 5, 5, false),
  entry("f", 29, 2),
];

beforeAll(async () => {
  await initTestI18n("birthday", { en, fr });
});

describe("birthdayStats", () => {
  it("has nothing to show without registrations", () => {
    const stats = birthdayStats([]);
    expect(stats).toMatchObject({
      count: 0,
      probability: 0,
      sharedCount: 0,
      namedShared: [],
      hiddenShared: 0,
      firstCollisionCount: null,
      untilHalf: 23,
      curveMax: 70,
    });
    expect(stats.months).toEqual(Array.from({ length: 12 }, () => 0));
    expect(stats).not.toHaveProperty("group");
  });

  it("follows the theoretical probability", () => {
    const at = (count: number) =>
      birthdayStats(
        Array.from({ length: count }, (_, index) =>
          entry(String(index), 1 + (index % 28), 1 + Math.floor(index / 28))
        )
      );
    expect(at(23).probability).toBeCloseTo(0.5073, 4);
    expect(at(23).untilHalf).toBe(0);
    expect(at(22).untilHalf).toBe(1);
    expect(at(57).probability).toBeCloseTo(0.9901, 4);
    expect(at(23).expectedFirstCollision).toBeCloseTo(24.617, 2);
    // The curve reaches past a large group.
    expect(at(80).curveMax).toBe(80);
    expect(at(81).curveMax).toBe(90);
  });

  it("counts by month, 29 February in February", () => {
    const { months } = birthdayStats(ENTRIES);
    expect(months).toEqual([0, 1, 2, 0, 1, 0, 0, 0, 0, 0, 2, 0]);
  });

  it("only names a shared date when all its members are announced", () => {
    const stats = birthdayStats(ENTRIES);
    expect(stats.sharedCount).toBe(2);
    expect(stats.namedShared).toEqual([{ day: 14, month: 3 }]);
    expect(stats.hiddenShared).toBe(1);
    // Nothing per day, nor who: only dates and counts.
    expect(JSON.stringify(stats)).not.toMatch(/"userId"|"entries"/);
  });

  it("keeps the guild's first collision and the group", () => {
    const stats = birthdayStats(ENTRIES, {
      firstCollisionCount: 2,
      group: "Modération",
    });
    expect(stats.firstCollisionCount).toBe(2);
    expect(stats.group).toBe("Modération");
  });
});

describe("statsText", () => {
  it("lists the named dates and counts the hidden ones", () => {
    const text = statsText(
      createT("fr", "birthday"),
      "fr",
      birthdayStats(ENTRIES)
    );
    expect(text).toContain("**6 anniversaires enregistrés**");
    expect(text).toContain("Partagées : 14 mars.");
    expect(text).not.toContain("novembre");
    expect(text).toContain("1 date partagée n'est pas affichée");
    expect(text).toContain("Encore 17 inscrits");
    expect(text).toContain("-# Les naissances");
  });
});

describe("statsCardLabels", () => {
  const fr = (stats = birthdayStats(ENTRIES)) =>
    statsCardLabels(createT("fr", "birthday"), "fr", stats);

  it("writes ordinals without superscript letters", () => {
    expect(
      fr(birthdayStats(ENTRIES, { firstCollisionCount: 1 })).firstCollision
        .value
    ).toBe("1re inscription");
    expect(
      fr(birthdayStats(ENTRIES, { firstCollisionCount: 23 })).firstCollision
        .value
    ).toBe("23e inscription");
    const en = statsCardLabels(
      createT("en", "birthday"),
      "en",
      birthdayStats(ENTRIES, { firstCollisionCount: 23 })
    );
    expect(en.firstCollision.value).toBe("23rd registration");
  });

  it("formats the percentages per locale", () => {
    const labels = fr();
    // French puts a no-break space before the sign.
    expect(labels.probability.value).toMatch(/^4\s%$/);
    expect(labels.curve.half).toMatch(/^50\s%$/);
    expect(labels.curve.certain).toMatch(/^99\s%$/);
    const en = statsCardLabels(
      createT("en", "birthday"),
      "en",
      birthdayStats(ENTRIES)
    );
    expect(en.probability.value).toBe("4%");
  });

  it("says the threshold is passed, and when nothing is shared", () => {
    const many = birthdayStats(
      Array.from({ length: 30 }, (_, index) => entry(String(index), 1, 1))
    );
    expect(fr(many).untilHalf.value).toBe("Seuil dépassé");
    // Shared, but the first one was not recorded (a group, say).
    expect(fr(many).firstCollision.value).toBe("non relevée");
    expect(fr(birthdayStats([])).firstCollision.value).toBe("pas encore");
    expect(fr(birthdayStats([])).shared.subtext).toBe("aucune pour l'instant");
  });

  it("adds the group to the subtitle", () => {
    expect(fr().subtitle).toBe("6 anniversaires enregistrés");
    expect(fr(birthdayStats(ENTRIES, { group: "Modération" })).subtitle).toBe(
      "Modération · 6 anniversaires enregistrés"
    );
  });

  it("describes the card, months included, without naming a date", () => {
    const labels = fr();
    expect(labels.months.names).toHaveLength(12);
    expect(labels.shared.subtext).toBe("dont 1 non nommée");
    expect(labels.alt).toMatch(/Probabilité théorique : 4\s%\./);
    expect(labels.alt).toContain("novembre 2");
    expect(labels.alt).not.toContain("14 mars");
    expect(labels.alt.length).toBeLessThanOrEqual(1024);
  });
});
