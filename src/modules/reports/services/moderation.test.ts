import { describe, expect, it } from "vitest";
import { sanctionBlock, type TargetRank } from "./moderation.js";

const moderator = { id: "mod", isOwner: false, position: 10 };

function target(overrides: Partial<TargetRank> = {}): TargetRank {
  return {
    id: "author",
    isOwner: false,
    position: 5,
    botCan: { timeout: true, kick: true, ban: true },
    ...overrides,
  };
}

describe("sanctionBlock", () => {
  it("allows every sanction on a lower member the bot can reach", () => {
    for (const sanction of ["warn", "timeout", "kick", "ban"] as const) {
      expect(sanctionBlock(sanction, moderator, target())).toBeNull();
    }
  });

  it("only allows a ban once the author left", () => {
    expect(sanctionBlock("ban", moderator, null)).toBeNull();
    expect(sanctionBlock("kick", moderator, null)).toBe("targetLeft");
    expect(sanctionBlock("timeout", moderator, null)).toBe("targetLeft");
    expect(sanctionBlock("warn", moderator, null)).toBe("targetLeft");
  });

  it("refuses to sanction yourself or the owner", () => {
    expect(sanctionBlock("ban", moderator, target({ id: "mod" }))).toBe(
      "targetIsSelf"
    );
    expect(sanctionBlock("ban", moderator, target({ isOwner: true }))).toBe(
      "targetIsOwner"
    );
  });

  it("requires the moderator to outrank the author, even on equal roles", () => {
    expect(sanctionBlock("kick", moderator, target({ position: 10 }))).toBe(
      "moderatorBelow"
    );
    expect(sanctionBlock("warn", moderator, target({ position: 12 }))).toBe(
      "moderatorBelow"
    );
  });

  it("lets the owner sanction anyone below the bot", () => {
    const owner = { id: "owner", isOwner: true, position: 0 };
    expect(sanctionBlock("ban", owner, target({ position: 50 }))).toBeNull();
  });

  it("reports what the bot itself cannot do", () => {
    const shielded = target({
      botCan: { timeout: false, kick: false, ban: false },
    });
    expect(sanctionBlock("timeout", moderator, shielded)).toBe("botBelow");
    expect(sanctionBlock("kick", moderator, shielded)).toBe("botBelow");
    expect(sanctionBlock("ban", moderator, shielded)).toBe("botBelow");
    expect(sanctionBlock("warn", moderator, shielded)).toBeNull();
  });
});
