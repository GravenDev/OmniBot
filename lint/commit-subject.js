// A commitlint rule for commit subjects that name a work step instead of a
// change. Each subject becomes a line of the changelog (cliff.toml, pull
// requests merged by rebase): « suites de la revue » tells its reader
// nothing, and hides whatever the commit did change.

// « relecture » is also something the bot does (four-hour-game re-reads a
// server's history): beside « retours / remarques de la revue », a phrase
// only counts at the subject's start (or after a separator) or at its end,
// where it stands for the whole subject.
const STEP = `(?:la |l'|une |les )?(?:revue|relecture|review)(?: de code)?`;
// A word on its own, not part of a path or a name (`wip/animated-webp`).
const WORD = (word) =>
  new RegExp(String.raw`(?<![\w/.-])${word}(?![\w/-]|\.\w)`, "i");
const ENDS = String.raw`(?: \p{L}+)?$`;

const PROCESS = [
  new RegExp(String.raw`(?<=^|[,:;—–] )suites? (?:de|à) ${STEP}\b`, "iu"),
  new RegExp(String.raw`\b(?:retours?|remarques?) (?:de|sur) ${STEP}\b`, "iu"),
  new RegExp(
    `^(?:corrections?|corrige[rs]?|correctifs?|applique[rs]?|prise en compte) (?:(?:les )?retours )?(?:de |sur )?${STEP}${ENDS}`,
    "iu"
  ),
  new RegExp(
    String.raw`\b(?:après|suite à) (?:la |une |l')?(?:\p{L}+ )?${STEP}${ENDS}`,
    "iu"
  ),
  /\bpost-(?:revue|relecture|review)\b/i,
  /\bsuite aux retours\b/i,
  /\bcorrections? diverses\b/i,
  /^(?:ajustements?|divers|corrections?|fixes|revue|relecture|review)$/i,
  WORD("wip"),
  WORD("misc(?:ellaneous)?"),
  /\breview (?:fixes|feedback|comments|follow-?ups?)\b/i,
  /\baddress(?:es|ed|ing)? (?:the )?review\b/i,
  /\bsuggestions? from (?:the )?(?:code )?review\b/i,
  /\b(?:after|from) (?:the )?(?:code )?review$/i,
];

/** The part of `subject` that names a work step, or null. */
export function processWords(subject) {
  for (const pattern of PROCESS) {
    const match = pattern.exec(subject.trim());
    if (match) return match[0];
  }
  return null;
}

/** commitlint rule: `subject-describes-change`. */
export function subjectDescribesChange(parsed) {
  const found = parsed.subject ? processWords(parsed.subject) : null;
  return [
    found === null,
    `the subject names a work step (« ${found} »): say what the commit changes, it becomes a changelog line`,
  ];
}
