export interface RollBadge {
  id: string;
  label: string;
  emoji: string;
  ep: number;
  rarity: string;
  probability: number;
}

export interface RollBadges {
  number: number;
  score: number;
  badges: RollBadge[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseBadge(value: unknown): RollBadge | null {
  if (
    !isRecord(value) ||
    typeof value["id"] !== "string" ||
    typeof value["label"] !== "string" ||
    typeof value["emoji"] !== "string" ||
    typeof value["ep"] !== "number" ||
    typeof value["rarity"] !== "string"
  ) {
    return null;
  }
  return {
    id: value["id"],
    label: value["label"],
    emoji: value["emoji"],
    ep: value["ep"],
    rarity: value["rarity"],
    probability: typeof value["prob"] === "number" ? value["prob"] : NaN,
  };
}

export function parseRollBadges(
  number: number,
  body: unknown
): RollBadges | null {
  if (
    !isRecord(body) ||
    body["number"] !== number ||
    typeof body["totalEP"] !== "number" ||
    !Array.isArray(body["badges"])
  ) {
    return null;
  }
  const badges = body["badges"].map(parseBadge);
  if (badges.some((badge) => badge === null)) {
    return null;
  }
  return {
    number,
    score: body["totalEP"],
    badges: badges as RollBadge[],
  };
}
