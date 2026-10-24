import { describe, expect, it } from "vitest";
import { stripHiddenText } from "./hidden-text.js";

describe("stripHiddenText", () => {
  it("removes inline code, code blocks and spoilers", () => {
    expect(stripHiddenText("a `b` c ``d`` e ```\nf\n``` g ||h|| i")).toBe(
      "a  c  e  g  i"
    );
  });

  it("keeps an unclosed spoiler or code span", () => {
    expect(stripHiddenText("a ||b `c")).toBe("a ||b `c");
  });
});
