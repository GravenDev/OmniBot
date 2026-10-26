import { describe, expect, it } from "vitest";
import {
  decimalSeparator,
  describeLines,
  formatInteger,
  formatPercentage,
  preview,
  truncate,
} from "./format.js";

describe("preview", () => {
  it("keeps a short message on one line", () => {
    expect(preview("Read\n\nthe   rules")).toBe("Read the rules");
  });

  it("cuts a long message with an ellipsis", () => {
    expect(preview("x".repeat(200))).toBe(`${"x".repeat(79)}…`);
  });

  it("cuts between characters, not inside an emoji", () => {
    const shown = preview("😀".repeat(100));
    expect(shown).toBe(`${"😀".repeat(39)}…`);
  });

  it("escapes Markdown so a cut cannot leak into the next lines", () => {
    expect(preview("```js\nconsole.log(1)")).not.toContain("```");
    expect(preview(`**${"x".repeat(200)}**`).startsWith("\\*\\*")).toBe(true);
  });

  it("shows links, mentions and timestamps as text", () => {
    expect(preview("[Click](https://x.y)")).toContain("\\[");
    expect(preview("# Title")).toBe("\\# Title");
    expect(preview("<@&123> <t:1:R>")).toBe("\\<@&123> \\<t:1:R>");
  });
});

describe("formatInteger", () => {
  it.each([
    [0, "fr", "0"],
    [999, "fr", "999"],
    [1000, "fr", "1 000"],
    [1_234_567, "fr", "1 234 567"],
    [-1_234_567, "fr", "-1 234 567"],
    [1234.9, "fr", "1 234"],
    [1_234_567, "en", "1,234,567"],
    [-1234.9, "en", "-1,234"],
  ])("formats %s in %s as %s", (value, locale, text) => {
    expect(formatInteger(value, locale)).toBe(text);
  });
});

describe("formatPercentage", () => {
  it.each([
    [4, "fr", 0, "4 %"],
    [4, "en", 0, "4%"],
    [4.5, "fr", 2, "4,5 %"],
    [4.5, "en", 2, "4.5%"],
  ])("formats %s in %s (%s decimals) as %s", (value, locale, digits, text) => {
    expect(formatPercentage(value, locale, digits)).toBe(text);
  });
});

describe("decimalSeparator", () => {
  it("is a comma in French and a point in English", () => {
    expect(decimalSeparator("fr")).toBe(",");
    expect(decimalSeparator("en")).toBe(".");
  });
});

describe("describeLines", () => {
  const more = (count: number) => `+${count}`;

  it("joins the lines when they fit", () => {
    expect(describeLines(["a", "b"], more)).toBe("a\nb");
  });

  it("stops on a whole line and counts the hidden ones", () => {
    const lines = Array.from({ length: 100 }, () => "x".repeat(99));
    const description = describeLines(lines, more);
    expect(description.length).toBeLessThanOrEqual(4096);
    const shown = description.split("\n");
    const footer = shown.pop()!;
    expect(shown.every((line) => line === "x".repeat(99))).toBe(true);
    expect(footer).toBe(`+${100 - shown.length}`);
  });

  it("counts a single hidden line", () => {
    const lines = Array.from({ length: 41 }, () => "x".repeat(99));
    expect(describeLines(lines, more).split("\n").at(-1)).toBe("+1");
  });
});

describe("truncate", () => {
  it("never splits an emoji", () => {
    expect(truncate("ab😀c", 4)).toBe("ab…");
    expect(truncate("😀😀😀😀", 5)).toBe("😀😀…");
  });

  it("stays within the limit counted the way Discord counts it", () => {
    const truncated = truncate("😀".repeat(600), 1024);
    expect(truncated.length).toBeLessThanOrEqual(1024);
    expect(truncated.endsWith("😀…")).toBe(true);
  });

  it("closes a spoiler the cut would leave open", () => {
    const truncated = truncate(`intro ||${"secret ".repeat(20)}||`, 30);
    expect(truncated).toBe(`intro ||${"secret ".repeat(2)}secre||…`);
    expect(truncated.length).toBeLessThanOrEqual(30);
    expect(truncate(`||a|| ${"b".repeat(40)}`, 20)).toBe(
      `||a|| ${"b".repeat(13)}…`
    );
  });

  it("keeps the text around a lone || such as code", () => {
    expect(truncate(`a || b ${"c".repeat(40)}`, 20)).toBe(
      `a || b ${"c".repeat(10)}||…`
    );
  });
});
