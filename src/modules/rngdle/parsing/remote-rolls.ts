export interface RemoteRoll {
  id: string;
  number: number;
  score: number;
  badgeCount: number;
  rolledAt: Date;
}

export class RngdleApiError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRoll(value: unknown): RemoteRoll {
  if (
    !isRecord(value) ||
    typeof value["id"] !== "string" ||
    !Number.isSafeInteger(value["number"]) ||
    !Number.isSafeInteger(value["totalScore"]) ||
    typeof value["rolledAt"] !== "string"
  ) {
    throw new RngdleApiError("Unexpected roll in the RNGdle API response");
  }
  const rolledAt = new Date(value["rolledAt"]);
  if (Number.isNaN(rolledAt.getTime())) {
    throw new RngdleApiError("Invalid roll date in the RNGdle API response");
  }
  const badgeCount = value["badgeCount"];
  return {
    id: value["id"],
    number: value["number"] as number,
    score: value["totalScore"] as number,
    badgeCount: Number.isSafeInteger(badgeCount) ? (badgeCount as number) : 0,
    rolledAt,
  };
}

/** A page of a member's rolls, as the rngdle.com API sends it. */
export function parseRollsPage(body: unknown): {
  rolls: RemoteRoll[];
  hasMore: boolean;
} {
  if (!isRecord(body) || !Array.isArray(body["rolls"])) {
    throw new RngdleApiError("Unexpected RNGdle API response");
  }
  return {
    rolls: body["rolls"].map(parseRoll),
    hasMore: body["hasMore"] === true,
  };
}
