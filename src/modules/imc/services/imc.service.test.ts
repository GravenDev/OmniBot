import { describe, expect, it } from "vitest";
import { calculateBmi, categoryForBmi } from "./imc.service.js";

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
