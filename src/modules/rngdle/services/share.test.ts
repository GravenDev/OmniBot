import { describe, expect, it } from "vitest";
import { parseShare } from "./share.js";

const SHARE = `RNGdle 🎲 111883

🟧 ANOMALY • Top 4%

🟦 🏰 Contiguous Full House
🟩 👨‍👩‍👧‍👦 Contiguous Two Pair
🟩 ➖ Contiguous Trips
+13 more

41 731 EP
https://rngdle.com/`;

describe("parseShare", () => {
  it("reads every part of a shared result", () => {
    expect(parseShare(SHARE)).toEqual({
      number: 111883,
      score: 41731,
      tier: "ANOMALY",
      placement: { top: true, percent: 4 },
      badges: [
        { emoji: "🏰", label: "Contiguous Full House", tier: "RARE" },
        { emoji: "👨‍👩‍👧‍👦", label: "Contiguous Two Pair", tier: "UNCOMMON" },
        { emoji: "➖", label: "Contiguous Trips", tier: "UNCOMMON" },
      ],
      hiddenBadges: 13,
    });
  });

  it("accepts text around the result and non-breaking spaces", () => {
    const shared = parseShare(
      `pas mal aujourd'hui\n${SHARE.replace("41 731", "41 731")}\nGG`
    );
    expect(shared?.number).toBe(111883);
    expect(shared?.score).toBe(41731);
  });

  it("keeps a result without badges nor placement", () => {
    expect(parseShare("RNGdle 🎲 86\n\n101 511 610 EP")).toEqual({
      number: 86,
      score: 101511610,
      tier: null,
      placement: null,
      badges: [],
      hiddenBadges: 0,
    });
  });

  it("reads a bottom placement", () => {
    expect(
      parseShare(SHARE.replace("ANOMALY • Top 4%", "TRASH • Bottom 1%"))
    ).toMatchObject({ tier: "TRASH", placement: { top: false, percent: 1 } });
  });

  it.each([
    ["no header", SHARE.replace("RNGdle 🎲 111883", "")],
    ["no score", SHARE.replace("41 731 EP", "")],
    ["an impossible number", SHARE.replace("111883", "1000001")],
  ])("ignores a message with %s", (_, content) => {
    expect(parseShare(content)).toBeNull();
  });

  it("only reads the score after the header", () => {
    expect(parseShare(`90 000 EP\n${SHARE}`)?.score).toBe(41731);
  });

  it("does not read the next lines as part of a number", () => {
    expect(parseShare("RNGdle 🎲 12\n34\n\n5 EP")).toMatchObject({
      number: 12,
      score: 5,
    });
  });

  it("only reads badge lines starting with a colored square", () => {
    const shared = parseShare(SHARE.replace("+13 more", "🎉 🎉 Not a badge"));
    expect(shared?.badges).toHaveLength(3);
  });
});
