import { describe, expect, it } from "vitest";
import {
  calculateBmi,
  categoryForBmi,
  distanceToIdeal,
  rankEntries,
} from "./imc.service.js";

describe("calculateBmi", () => {
  it("computes BMI from weight (kg) and height (cm)", () => {
    // 70 kg / (1.75 m)² = 22.857…
    expect(calculateBmi(70, 175)).toBeCloseTo(22.857, 3);
  });

  it("scales with the square of the height", () => {
    // Same weight, half the height → 4× the BMI
    expect(calculateBmi(70, 100)).toBeCloseTo(calculateBmi(70, 200) * 4, 10);
  });
});

describe("categoryForBmi", () => {
  it.each([
    [16, "underweight"],
    [18.4, "underweight"],
    [18.5, "normal"],
    [22, "normal"],
    [24.9, "normal"],
    [25, "overweight"],
    [27.5, "overweight"],
    [29.9, "overweight"],
    [30, "obesity"],
    [35, "obesity"],
  ])("classifies BMI %s as %s", (bmi, expected) => {
    expect(categoryForBmi(bmi)).toBe(expected);
  });
});

describe("distanceToIdeal", () => {
  it("is 0 inside the ideal range", () => {
    expect(distanceToIdeal(18.5)).toBe(0);
    expect(distanceToIdeal(22)).toBe(0);
    expect(distanceToIdeal(24.9)).toBe(0);
  });

  it("measures the gap below the range", () => {
    expect(distanceToIdeal(16.5)).toBeCloseTo(2, 10);
  });

  it("measures the gap above the range", () => {
    expect(distanceToIdeal(30)).toBeCloseTo(5, 10);
  });
});

describe("rankEntries", () => {
  const entries = [{ bmi: 22 }, { bmi: 32 }, { bmi: 16 }];

  it("sorts worst deviation first by default expectation", () => {
    const ranked = rankEntries(entries, "worst");
    expect(ranked.map((r) => r.entry.bmi)).toEqual([32, 16, 22]);
    expect(ranked.map((r) => r.deviation)).toEqual([7, 2.5, 0]);
  });

  it("sorts best deviation first when asked", () => {
    const ranked = rankEntries(entries, "best");
    expect(ranked.map((r) => r.entry.bmi)).toEqual([22, 16, 32]);
  });

  it("breaks deviation ties by BMI in the sort direction", () => {
    // Both ideal (deviation 0): worst shows the higher BMI first
    const ranked = rankEntries([{ bmi: 20 }, { bmi: 24 }], "worst");
    expect(ranked.map((r) => r.entry.bmi)).toEqual([24, 20]);
  });
});
