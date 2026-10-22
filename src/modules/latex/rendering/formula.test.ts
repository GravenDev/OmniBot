import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { PALETTE, type Rgb } from "#lib/imaging.js";
import {
  FORMULA_MAX_LENGTH,
  FormulaError,
  parseText,
  renderFormula,
  renderText,
  splitWords,
  TEXT_MAX_LENGTH,
} from "./formula.js";

const BLACK: Rgb = [0, 0, 0];
const LINE_WIDTH = 32 * 48;
const PADDING = 24;

function pngSize(png: Buffer) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

async function pixels(png: Buffer) {
  const image = await loadImage(png);
  const ctx = createCanvas(image.width, image.height).getContext("2d");
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, image.width, image.height).data;
}

async function textPixels(png: Buffer, color: Rgb = BLACK): Promise<number> {
  const data = await pixels(png);
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (
      data[index] === color[0] &&
      data[index + 1] === color[1] &&
      data[index + 2] === color[2]
    ) {
      count++;
    }
  }
  return count;
}

describe("renderFormula", () => {
  it("renders a formula as a PNG, black on white by default", async () => {
    const png = await renderFormula(String.raw`\frac{\sqrt{\pi}}{2}`);

    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([...(await pixels(png)).subarray(0, 3)]).toEqual([255, 255, 255]);
    expect(await textPixels(png)).toBeGreaterThan(100);
  });

  it("uses the palette's colors with the dark theme", async () => {
    const png = await renderFormula(String.raw`\frac{\sqrt{\pi}}{2}`, "dark");

    expect([...(await pixels(png)).subarray(0, 3)]).toEqual([
      ...PALETTE.background,
    ]);
    expect(await textPixels(png, PALETTE.text)).toBeGreaterThan(100);
  });

  it("widens the image with the formula", async () => {
    const short = pngSize(await renderFormula("x"));
    const long = pngSize(await renderFormula("x + y + z + w"));

    expect(long.width).toBeGreaterThan(short.width);
  });

  it("renders the AMS environments and the font variants", async () => {
    const png = await renderFormula(
      String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix} \mathbb{R} \mathcal{L} \ce{H2O}`
    );

    expect(await textPixels(png)).toBeGreaterThan(100);
  });

  it("breaks a long formula instead of widening the image", async () => {
    const png = await renderFormula(
      String.raw`\Huge ` + "x+".repeat(400) + "x"
    );

    expect(pngSize(png).width).toBeLessThanOrEqual(2400 + PADDING * 2);
  });

  it("rejects an unknown command with MathJax's message", async () => {
    await expect(renderFormula(String.raw`\nope{x}`)).rejects.toThrow(
      new FormulaError(String.raw`Undefined control sequence \nope`)
    );
  });

  it("rejects unbalanced braces", async () => {
    await expect(renderFormula(String.raw`\frac{a}{b`)).rejects.toBeInstanceOf(
      FormulaError
    );
  });

  it("still renders after an error", async () => {
    await renderFormula(String.raw`\nope`).catch(() => undefined);

    expect(await textPixels(await renderFormula("x^2"))).toBeGreaterThan(0);
  });

  it("stops a macro that expands forever", async () => {
    await expect(
      renderFormula(String.raw`\def\loop{\loop}\loop`)
    ).rejects.toBeInstanceOf(FormulaError);
  });

  it("rejects an empty or overlong formula", async () => {
    await expect(renderFormula("   ")).rejects.toBeInstanceOf(FormulaError);
    await expect(
      renderFormula("x".repeat(FORMULA_MAX_LENGTH + 1))
    ).rejects.toBeInstanceOf(FormulaError);
  });

  it("renders comparisons", async () => {
    expect(await textPixels(await renderFormula("a<b>c"))).toBeGreaterThan(100);
  });

  it("forgets the macros of a previous rendering", async () => {
    const fraction = String.raw`\frac{a}{b}`;
    const before = await renderFormula(fraction);
    await renderFormula(String.raw`\renewcommand{\frac}[2]{XXXXXXXX} x`);

    expect(await renderFormula(fraction)).toEqual(before);
  });

  it("renders concurrent formulas independently", async () => {
    const [small, large] = await Promise.all([
      renderFormula("x"),
      renderFormula("x + y + z + w"),
    ]);

    expect(pngSize(large).width).toBeGreaterThan(pngSize(small).width);
  });
});

describe("splitWords", () => {
  it("splits on the spaces of the prose only", () => {
    expect(
      splitWords("Soit $x \\in E$, \\textbf{un point} et \\{ a \\} fin.")
    ).toEqual([
      "Soit",
      "$x \\in E$,",
      "\\textbf{un point}",
      "et",
      "\\{",
      "a",
      "\\}",
      "fin.",
    ]);
  });
});

describe("parseText", () => {
  it("splits paragraphs and display formulas", () => {
    expect(parseText("Soit $x$.\n\nAlors\n$$y$$\nfin \\[z\\]")).toEqual([
      { kind: "text", text: "Soit $x$.", indent: 0 },
      { kind: "gap" },
      { kind: "text", text: "Alors", indent: 0 },
      { kind: "display", tex: "y" },
      { kind: "text", text: "fin", indent: 0 },
      { kind: "display", tex: "z" },
    ]);
  });

  it("reads \\( \\) as inline math", () => {
    expect(parseText("Soit \\(x^2\\).")).toEqual([
      { kind: "text", text: "Soit $x^2$.", indent: 0 },
    ]);
  });

  it("escapes the TeX specials of the prose, not those of the math", () => {
    expect(parseText("100% & #1 file_name, $a_1 & b$, \\%")).toEqual([
      {
        kind: "text",
        text: "100\\% \\& \\#1 file\\_name, $a_1 & b$, \\%",
        indent: 0,
      },
    ]);
  });

  it("keeps the dollars of amounts out of the math", () => {
    expect(parseText("J'ai payé 5$ pour $x^2$, $ 3 $")).toEqual([
      {
        kind: "text",
        text: "J'ai payé 5\\$ pour $x^2$, \\$ 3 \\$",
        indent: 0,
      },
    ]);
  });

  it("breaks the line on \\\\ in the prose, not in the math", () => {
    expect(parseText("a \\\\ b $\\begin{matrix}1\\\\2\\end{matrix}$")).toEqual([
      { kind: "text", text: "a", indent: 0 },
      {
        kind: "text",
        text: "b $\\begin{matrix}1\\\\2\\end{matrix}$",
        indent: 0,
      },
    ]);
  });

  it("lays out nested itemize and enumerate lists", () => {
    const source = [
      "Exercice :",
      "\\begin{itemize}",
      "\\item Un",
      "\\begin{enumerate} \\item a \\item b \\end{enumerate}",
      "\\item[$\\star$] Deux",
      "\\end{itemize}",
      "Fin",
    ].join("\n");

    expect(parseText(source)).toEqual([
      { kind: "text", text: "Exercice :", indent: 0 },
      { kind: "text", text: "Un", indent: 1, marker: "$\\bullet$" },
      { kind: "text", text: "a", indent: 2, marker: "(a)" },
      { kind: "text", text: "b", indent: 2, marker: "(b)" },
      { kind: "text", text: "Deux", indent: 1, marker: "$\\star$" },
      { kind: "text", text: "Fin", indent: 0 },
    ]);
  });

  it("numbers a top-level enumerate", () => {
    expect(
      parseText("\\begin{enumerate}\\item x\\item y\\end{enumerate}").map(
        (block) => "marker" in block && block.marker
      )
    ).toEqual(["1.", "2."]);
  });

  it("treats align and equation environments as display math", () => {
    expect(
      parseText("Soit\n\\begin{align*} a &= b \\\\ c &= d \\end{align*}")
    ).toEqual([
      { kind: "text", text: "Soit", indent: 0 },
      {
        kind: "display",
        tex: "\\begin{align*} a &= b \\\\ c &= d \\end{align*}",
      },
    ]);
  });
});

describe("renderText", () => {
  it("fills and justifies the wrapped lines to the full width", async () => {
    const short = pngSize(await renderText("Soit $x \\in \\mathbb{R}$."));
    const long = pngSize(
      await renderText("Montrer que $f$ est bornée. ".repeat(20))
    );

    expect(short.width).toBeLessThan(LINE_WIDTH / 2);
    expect(
      Math.abs(long.width - (LINE_WIDTH + PADDING * 2))
    ).toBeLessThanOrEqual(2);
    expect(long.height).toBeGreaterThan(short.height * 3);
  });

  it("renders lists and text environments without MathJax errors", async () => {
    const png = await renderText(
      "\\textbf{1)} Exercice :\n\\begin{itemize}\n\\item Trouvez $f'$\n\\item Conclure\n\\end{itemize}\n\\begin{align*} f(x) &= x \\\\ g &= 1 \\end{align*}"
    );

    expect(await textPixels(png)).toBeGreaterThan(100);
  });

  it("stacks the paragraphs and display formulas", async () => {
    const one = pngSize(await renderText("Soit $x$."));
    const three = pngSize(
      await renderText("Soit $x$.\n$$\\frac{a}{b}$$\nfin.")
    );

    expect(three.height).toBeGreaterThan(one.height * 2);
  });

  it("renders accented prose", async () => {
    expect(
      await textPixels(await renderText("Démontrer à l'élève"))
    ).toBeGreaterThan(100);
  });

  it("shows the prose that TeX cannot read as it is", async () => {
    const png = await renderText(
      "si a < b, x^2 ou \\alpha} dans https://ex.com/a_b alors $x$"
    );

    expect(await textPixels(png)).toBeGreaterThan(100);
  });

  it("rejects quickly a text whose macros expand into a huge drawing", async () => {
    const tens = (macro: string) => macro.repeat(10);
    const source =
      String.raw`$\def\a{xxxxxxxxxx}\def\b{` +
      tens(String.raw`\a`) +
      String.raw`}\def\c{` +
      tens(String.raw`\b`) +
      String.raw`}\def\d{\c\c\c\c}$` +
      String.raw` $\d$`.repeat(400);
    const start = Date.now();

    await expect(
      renderText(source.slice(0, TEXT_MAX_LENGTH))
    ).rejects.toBeInstanceOf(FormulaError);
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it("rejects invalid math inside the text", async () => {
    await expect(renderText("Soit $\\frac{a$.")).rejects.toBeInstanceOf(
      FormulaError
    );
  });

  it("rejects an empty or overlong text", async () => {
    await expect(renderText("\n \n")).rejects.toBeInstanceOf(FormulaError);
    await expect(
      renderText("x".repeat(TEXT_MAX_LENGTH + 1))
    ).rejects.toBeInstanceOf(FormulaError);
  });
});
