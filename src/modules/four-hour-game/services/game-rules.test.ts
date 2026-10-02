import { describe, expect, it } from "vitest";
import { evaluateMessage } from "./game-rules.js";

const FOUR_HOURS = 4 * 60 * 60;
const start = new Date("2026-10-02T10:00:00Z");
const after = (seconds: number) => new Date(start.getTime() + seconds * 1000);
const msg = (authorId: string, sentAt: Date, channelId = "game") => ({
  channelId,
  authorId,
  sentAt,
});

describe("evaluateMessage", () => {
  it("records the very first message without awarding anything", () => {
    expect(evaluateMessage(null, msg("alice", start), FOUR_HOURS)).toEqual({
      kind: "first",
    });
  });

  it("ignores a message from the author of the last message", () => {
    expect(
      evaluateMessage(
        msg("alice", start),
        msg("alice", after(FOUR_HOURS * 2)),
        FOUR_HOURS
      )
    ).toEqual({ kind: "sameAuthor" });
  });

  it("awards the previous author once the delay has elapsed", () => {
    expect(
      evaluateMessage(
        msg("alice", start),
        msg("bob", after(FOUR_HOURS + 1)),
        FOUR_HOURS
      )
    ).toEqual({ kind: "point", winnerId: "alice" });
  });

  it("awards the previous author when exactly the delay has elapsed", () => {
    expect(
      evaluateMessage(
        msg("alice", start),
        msg("bob", after(FOUR_HOURS)),
        FOUR_HOURS
      )
    ).toEqual({ kind: "point", winnerId: "alice" });
  });

  it("awards nothing when another member replies before the delay", () => {
    expect(
      evaluateMessage(
        msg("alice", start),
        msg("bob", after(FOUR_HOURS - 1)),
        FOUR_HOURS
      )
    ).toEqual({ kind: "tooSoon" });
  });

  it("treats a message older than the last one as outdated", () => {
    expect(
      evaluateMessage(
        msg("alice", after(60)),
        msg("bob", after(59)),
        FOUR_HOURS
      )
    ).toEqual({ kind: "outdated" });
  });

  it("starts over when the last message was in another channel", () => {
    expect(
      evaluateMessage(
        msg("alice", start, "old-channel"),
        msg("bob", after(FOUR_HOURS * 2)),
        FOUR_HOURS
      )
    ).toEqual({ kind: "first" });
  });
});
