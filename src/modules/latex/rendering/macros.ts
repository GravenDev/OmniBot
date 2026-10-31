export const MACROS: Record<string, string | [string, number]> = {
  NN: "\\mathbb{N}",
  ZZ: "\\mathbb{Z}",
  QQ: "\\mathbb{Q}",
  RR: "\\mathbb{R}",
  CC: "\\mathbb{C}",
  KK: "\\mathbb{K}",
  PP: "\\mathbb{P}",
  EE: "\\mathbb{E}",
  RRp: "{\\mathbb{R}_{+}}",

  union: "\\cup",
  sect: "\\cap",
  bigunion: "\\bigcup",
  bigsect: "\\bigcap",
  without: "\\setminus",
  symdiff: "\\mathbin{\\triangle}",
  comp: ["{{#1}^{\\mathsf{c}}}", 1],
  powerset: "\\mathcal{P}",
  emptyset: "\\varnothing",

  given: "\\mid",
  card: ["\\operatorname{card}\\left(#1\\right)", 1],
  range: ["\\{#1,\\dots,#2\\}", 2],
  indic: "\\mathbf{1}",

  eps: "\\varepsilon",
  dd: "\\,\\mathrm{d}",
};

export const PAIRED_DELIMITERS: Record<
  string,
  [string, string] | [string, string, string, number]
> = {
  abs: ["\\lvert", "\\rvert"],
  norm: ["\\lVert", "\\rVert"],
  floor: ["\\lfloor", "\\rfloor"],
  ceil: ["\\lceil", "\\rceil"],
  inner: ["\\langle", "\\rangle"],
  set: [
    "\\lbrace",
    "\\rbrace",
    "\\renewcommand{\\given}{\\nonscript\\:\\delimsize\\vert\\nonscript\\:\\mathopen{}}#1\\renewcommand{\\given}{\\mid}",
    1,
  ],
};
