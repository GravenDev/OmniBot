import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/js/input/tex/base/BaseConfiguration.js";
import "@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js";
import "@mathjax/src/js/input/tex/braket/BraketConfiguration.js";
import "@mathjax/src/js/input/tex/cancel/CancelConfiguration.js";
import "@mathjax/src/js/input/tex/color/ColorConfiguration.js";
import "@mathjax/src/js/input/tex/mathtools/MathtoolsConfiguration.js";
import "@mathjax/src/js/input/tex/mhchem/MhchemConfiguration.js";
import "@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js";
import "@mathjax/src/js/input/tex/textmacros/TextMacrosConfiguration.js";
import { mathjax } from "@mathjax/src/js/mathjax.js";
import { SVG } from "@mathjax/src/js/output/svg.js";
import "@mathjax/src/js/util/asyncLoad/esm.js";
import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { PALETTE, rgb, type Rgb } from "#lib/imaging.js";

export const FORMULA_MAX_LENGTH = 1000;
export const TEXT_MAX_LENGTH = 4000;

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

const COLORS: Record<Theme, { background: Rgb; text: Rgb }> = {
  light: { background: [255, 255, 255], text: [0, 0, 0] },
  dark: { background: PALETTE.background, text: PALETTE.text },
};

const EM = 48;
const PADDING = 24;
const MAX_WIDTH = 2400;
const MAX_HEIGHT = 4000;
const LINE_WIDTH = 32 * EM;
const SPACE = 0.333 * EM;
const MIN_ASCENT = 0.75 * EM;
const MIN_DESCENT = 0.25 * EM;
const LINE_GAP = 0.2 * EM;
const DISPLAY_GAP = 0.9 * EM;
const PARAGRAPH_GAP = 0.8 * EM;
const INDENT = 2 * EM;
const MARKER_GAP = 0.5 * EM;
const UNITS_PER_EM = 1000;

const DISPLAY_MATH =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|(\\begin\{((?:equation|align|alignat|gather|multline|flalign|eqnarray)\*?)\}[\s\S]*?\\end\{\4\})/g;
const INLINE_PAREN_MATH = /\\\(([\s\S]+?)\\\)/g;
export const INLINE_MATH = /((?<![\\$])\$(?=\S)[^$\n]*?\S\$(?![\d$]))/;
const LIST_TOKEN =
  /(\\begin\{(?:itemize|enumerate)\}|\\end\{(?:itemize|enumerate)\}|\\item(?![a-zA-Z])(?:\s*\[[^\]]*\])?)/;
const BULLETS = ["$\\bullet$", "–", "$\\ast$", "$\\cdot$"];

export class FormulaError extends Error {}

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const newDocument = () =>
  mathjax.document("", {
    InputJax: new TeX({
      packages: [
        "base",
        "ams",
        "boldsymbol",
        "braket",
        "cancel",
        "color",
        "mathtools",
        "mhchem",
        "newcommand",
        "textmacros",
      ],
      formatError: (_jax: unknown, err: { message: string }) => {
        throw new FormulaError(err.message);
      },
    }),
    OutputJax: new SVG({
      fontCache: "none",
      displayAlign: "left",
      displayOverflow: "linebreak",
    }),
  });

type Document = ReturnType<typeof newDocument>;

let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

export type Block =
  | { kind: "text"; text: string; indent: number; marker?: string }
  | { kind: "display"; tex: string }
  | { kind: "gap" };

interface Svg {
  svg: string;
  width: number;
  height: number;
  ascent: number;
}

interface Placed {
  svg: Svg;
  x: number;
  y: number;
}

interface Laid {
  placed: Placed[];
  width: number;
  height: number;
  centered: boolean;
  kind: Block["kind"];
}

async function toSvg(document: Document, tex: string): Promise<Svg> {
  const node = await document.convertPromise(tex, {
    display: true,
    em: EM,
    ex: EM / 2,
    containerWidth: LINE_WIDTH,
  });
  const svg = adaptor.innerHTML(node).replace(/ data-[a-z-]+="[^"]*"/g, "");
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(" ").map(Number);
  const [, top = 0, boxWidth = 0, boxHeight = 0] = viewBox ?? [];
  return {
    svg,
    width: Math.max(1, (boxWidth / UNITS_PER_EM) * EM),
    height: Math.max(1, (boxHeight / UNITS_PER_EM) * EM),
    ascent: (-top / UNITS_PER_EM) * EM,
  };
}

function mapProse(text: string, map: (prose: string) => string): string {
  return text
    .split(INLINE_MATH)
    .map((part, index) => (index % 2 === 1 ? part : map(part)))
    .join("");
}

function escapeProse(text: string): string {
  return mapProse(text, (prose) => prose.replace(/(?<!\\)([%&#$_])/g, "\\$1"));
}

export function splitWords(text: string): string[] {
  const words: string[] = [];
  let word = "";
  let math = false;
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (char === "\\") {
      word += char + (text[index + 1] ?? "");
      index++;
      continue;
    }
    if (char === "$") {
      math = !math;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
    } else if (/\s/.test(char) && !math && depth === 0) {
      if (word) {
        words.push(word);
      }
      word = "";
      continue;
    }
    word += char;
  }
  if (word) {
    words.push(word);
  }
  return words;
}

function roman(n: number): string {
  const numerals: [number, string][] = [
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  let result = "";
  for (const [value, numeral] of numerals) {
    while (n >= value) {
      result += numeral;
      n -= value;
    }
  }
  return result;
}

function enumerateLabel(count: number, level: number): string {
  const letter = String.fromCharCode(96 + (((count - 1) % 26) + 1));
  switch (level) {
    case 1:
      return `${count}.`;
    case 2:
      return `(${letter})`;
    case 3:
      return `${roman(count)}.`;
    default:
      return `${letter.toUpperCase()}.`;
  }
}

export function parseText(source: string): Block[] {
  const blocks: Block[] = [];
  const lists: { numbered: boolean; count: number }[] = [];
  let marker: string | undefined;

  const pushLines = (text: string) => {
    let wrote = false;
    let blank = false;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        blank = wrote;
        continue;
      }
      if (blank) {
        blocks.push({ kind: "gap" });
        blank = false;
      }
      wrote = true;
      const block: Block = {
        kind: "text",
        text: escapeProse(trimmed),
        indent: lists.length,
      };
      if (marker) {
        block.marker = escapeProse(marker);
        marker = undefined;
      }
      blocks.push(block);
    }
  };

  const pushItem = (token: string) => {
    const level = Math.max(1, lists.length);
    const list = lists.at(-1);
    if (list?.numbered) {
      list.count++;
    }
    marker =
      /\[([^\]]*)\]/.exec(token)?.[1] ??
      (list?.numbered
        ? enumerateLabel(list.count, level)
        : BULLETS[(level - 1) % BULLETS.length]);
  };

  const pushText = (text: string) => {
    const parts = mapProse(text, (prose) => prose.replace(/\\\\/g, "\n")).split(
      LIST_TOKEN
    );
    for (const [index, part] of parts.entries()) {
      if (index % 2 === 0) {
        pushLines(part);
      } else if (part.startsWith("\\begin")) {
        lists.push({ numbered: part.includes("enumerate"), count: 0 });
      } else if (part.startsWith("\\end")) {
        lists.pop();
      } else {
        pushItem(part);
      }
    }
  };

  const normalized = source.replace(
    INLINE_PAREN_MATH,
    (_, tex) => `$${tex.trim()}$`
  );
  let last = 0;
  for (const match of normalized.matchAll(DISPLAY_MATH)) {
    pushText(normalized.slice(last, match.index));
    const tex = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (tex) {
      blocks.push({ kind: "display", tex });
    }
    last = match.index + match[0].length;
  }
  pushText(normalized.slice(last));
  return blocks;
}

const wordTex = (word: string) => `\\textstyle\\text{${word}}`;

const literalTex = (word: string) =>
  wordTex(
    word.replace(/[\\{}$&#%_^~]/g, (char) => {
      if (char === "\\") {
        return "$\\backslash$";
      }
      return char === "^" || char === "~" ? `\\${char}{}` : `\\${char}`;
    })
  );

async function layText(
  document: Document,
  block: Extract<Block, { kind: "text" }>,
  cache: Map<string, Svg>
): Promise<Laid> {
  const svgOf = async (word: string) => {
    let svg = cache.get(word);
    if (!svg) {
      svg = await toSvg(document, wordTex(word)).catch((err: unknown) => {
        if (!(err instanceof FormulaError) || INLINE_MATH.test(word)) {
          throw err;
        }
        return toSvg(document, literalTex(word));
      });
      cache.set(word, svg);
    }
    return svg;
  };

  const left = block.indent * INDENT;
  const available = LINE_WIDTH - left;
  const words: Svg[] = [];
  for (const word of splitWords(block.text)) {
    words.push(await svgOf(word));
  }

  const lines: Svg[][] = [];
  let line: Svg[] = [];
  let lineWidth = 0;
  for (const word of words) {
    if (line.length && lineWidth + SPACE + word.width > available) {
      lines.push(line);
      line = [];
      lineWidth = 0;
    }
    lineWidth += (line.length ? SPACE : 0) + word.width;
    line.push(word);
  }
  if (line.length) {
    lines.push(line);
  }

  const placed: Placed[] = [];
  let top = 0;
  let width = 0;
  let firstBaseline = MIN_ASCENT;
  for (const [index, words] of lines.entries()) {
    const ascent = Math.max(MIN_ASCENT, ...words.map((word) => word.ascent));
    const descent = Math.max(
      MIN_DESCENT,
      ...words.map((word) => word.height - word.ascent)
    );
    const natural =
      words.reduce((sum, word) => sum + word.width, 0) +
      SPACE * (words.length - 1);
    const justified = index < lines.length - 1 && words.length > 1;
    const space = justified
      ? SPACE + (available - natural) / (words.length - 1)
      : SPACE;
    if (index === 0) {
      firstBaseline = ascent;
    }
    let x = left;
    for (const word of words) {
      placed.push({ svg: word, x, y: top + ascent - word.ascent });
      x += word.width + space;
    }
    width = Math.max(width, x - space);
    top += ascent + descent + (index < lines.length - 1 ? LINE_GAP : 0);
  }

  if (block.marker) {
    const marker = await svgOf(block.marker);
    placed.push({
      svg: marker,
      x: left - MARKER_GAP - marker.width,
      y: firstBaseline - marker.ascent,
    });
  }
  return { placed, width, height: top, centered: false, kind: "text" };
}

async function layDisplay(document: Document, tex: string): Promise<Laid> {
  const svg = await toSvg(document, tex);
  return {
    placed: [{ svg, x: 0, y: 0 }],
    width: svg.width,
    height: svg.height,
    centered: true,
    kind: "display",
  };
}

function gapBetween(previous: Laid | "gap" | undefined, next: Laid): number {
  if (!previous || previous === "gap") {
    return 0;
  }
  return previous.kind === "display" || next.kind === "display"
    ? DISPLAY_GAP
    : LINE_GAP;
}

async function drawSvg(
  ctx: SKRSContext2D,
  item: Svg,
  x: number,
  y: number,
  scale: number,
  color: Rgb
): Promise<void> {
  const width = Math.max(1, Math.round(item.width * scale));
  const height = Math.max(1, Math.round(item.height * scale));
  const image = await loadImage(
    Buffer.from(
      item.svg
        .replace(/ width="[^"]*"/, ` width="${width}"`)
        .replace(/ height="[^"]*"/, ` height="${height}"`)
        .replaceAll("currentColor", rgb(color))
    )
  );
  ctx.drawImage(image, Math.round(x), Math.round(y), width, height);
}

async function draw(blocks: Block[], theme: Theme): Promise<Buffer> {
  const laid = await serialized(async () => {
    const document = newDocument();
    const cache = new Map<string, Svg>();
    const result: (Laid | "gap")[] = [];
    for (const block of blocks) {
      if (block.kind === "gap") {
        result.push("gap");
      } else if (block.kind === "display") {
        result.push(await layDisplay(document, block.tex));
      } else {
        result.push(await layText(document, block, cache));
      }
    }
    return result;
  });

  const contentWidth = Math.max(
    1,
    ...laid.map((item) => (item === "gap" ? 0 : item.width))
  );
  const tops: number[] = [];
  let contentHeight = 0;
  for (const [index, item] of laid.entries()) {
    if (item === "gap") {
      contentHeight += PARAGRAPH_GAP;
      tops.push(contentHeight);
      continue;
    }
    contentHeight += gapBetween(laid[index - 1], item);
    tops.push(contentHeight);
    contentHeight += item.height;
  }

  const scale = Math.min(
    1,
    MAX_WIDTH / contentWidth,
    MAX_HEIGHT / Math.max(1, contentHeight)
  );
  const colors = COLORS[theme];
  const ctx = createCanvas(
    Math.ceil(contentWidth * scale) + PADDING * 2,
    Math.ceil(contentHeight * scale) + PADDING * 2
  ).getContext("2d");
  ctx.fillStyle = rgb(colors.background);
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (const [index, item] of laid.entries()) {
    if (item === "gap") {
      continue;
    }
    const offset = item.centered ? (contentWidth - item.width) / 2 : 0;
    for (const { svg, x, y } of item.placed) {
      await drawSvg(
        ctx,
        svg,
        PADDING + (offset + x) * scale,
        PADDING + (tops[index]! + y) * scale,
        scale,
        colors.text
      );
    }
  }
  return ctx.canvas.toBuffer("image/png");
}

function checkLength(source: string, max: number): string {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new FormulaError("Empty formula");
  }
  if (trimmed.length > max) {
    throw new FormulaError(`Longer than ${max} characters`);
  }
  return trimmed;
}

export async function renderFormula(
  tex: string,
  theme: Theme = "light"
): Promise<Buffer> {
  const formula = checkLength(tex, FORMULA_MAX_LENGTH);
  return draw([{ kind: "display", tex: formula }], theme);
}

export async function renderText(
  source: string,
  theme: Theme = "light"
): Promise<Buffer> {
  const blocks = parseText(checkLength(source, TEXT_MAX_LENGTH));
  if (!blocks.length) {
    throw new FormulaError("Empty formula");
  }
  return draw(blocks, theme);
}
