import { describe, expect, it } from "vitest";
import { evaluateMessage, replayMessages } from "./game-rules.js";

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
    ).toEqual({
      kind: "point",
      winnerId: "alice",
      heldSeconds: FOUR_HOURS + 1,
      heldSince: start,
      countedFrom: start,
    });
  });

  it("awards the previous author when exactly the delay has elapsed", () => {
    expect(
      evaluateMessage(
        msg("alice", start),
        msg("bob", after(FOUR_HOURS)),
        FOUR_HOURS
      )
    ).toEqual({
      kind: "point",
      winnerId: "alice",
      heldSeconds: FOUR_HOURS,
      heldSince: start,
      countedFrom: start,
    });
  });

  it("rounds the held time down to whole seconds", () => {
    expect(
      evaluateMessage(
        msg("alice", start),
        msg("bob", new Date(start.getTime() + FOUR_HOURS * 1000 + 999)),
        FOUR_HOURS
      )
    ).toMatchObject({ kind: "point", heldSeconds: FOUR_HOURS });
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

  it("counts the delay from scoringFrom when it is later than the message", () => {
    const last = { ...msg("alice", start), scoringFrom: after(3600) };
    expect(
      evaluateMessage(last, msg("bob", after(FOUR_HOURS)), FOUR_HOURS)
    ).toEqual({ kind: "tooSoon" });
    expect(
      evaluateMessage(last, msg("bob", after(3600 + FOUR_HOURS)), FOUR_HOURS)
    ).toEqual({
      kind: "point",
      winnerId: "alice",
      heldSeconds: FOUR_HOURS,
      heldSince: start,
      countedFrom: after(3600),
    });
  });

  it("counts the delay from the message when scoringFrom is earlier", () => {
    const last = { ...msg("alice", start), scoringFrom: after(-3600) };
    expect(
      evaluateMessage(last, msg("bob", after(FOUR_HOURS)), FOUR_HOURS)
    ).toMatchObject({ kind: "point", heldSeconds: FOUR_HOURS });
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

describe("replayMessages", () => {
  const hour = 3600 * 1000;
  const base = new Date("2026-10-14T08:00:00Z").getTime();
  const msg = (authorId: string, hours: number) => ({
    messageId: `${authorId}-${hours}`,
    authorId,
    sentAt: new Date(base + hours * hour),
  });
  const delay = 4 * 3600;

  it("scores like a live reply, and moves the message in place", () => {
    const start = msg("zed", 0);
    const replay = replayMessages(
      start,
      [start, msg("alice", 5), msg("alice", 6), msg("bob", 7)],
      delay
    );

    expect(replay.holds).toEqual([
      { authorId: "zed", from: start.sentAt, to: msg("alice", 5).sentAt },
      {
        authorId: "alice",
        from: msg("alice", 5).sentAt,
        to: msg("bob", 7).sentAt,
      },
    ]);
    expect(replay.points).toEqual([
      {
        winnerId: "zed",
        heldSeconds: 5 * 3600,
        heldSince: start.sentAt,
        countedFrom: start.sentAt,
        awardedAt: msg("alice", 5).sentAt,
      },
    ]);
    expect(replay.last).toEqual(msg("bob", 7));
  });

  it("follows evaluateMessage on the delay", () => {
    const start = msg("zed", 0);
    const reply = msg("alice", 4);
    const live = evaluateMessage(
      { channelId: "c", ...start },
      { channelId: "c", ...reply },
      delay
    );

    expect(live.kind).toBe("point");
    expect(replayMessages(start, [reply], delay).points).toHaveLength(1);
  });

  it("ignores the messages read up to the one in place", () => {
    const start = msg("zed", 2);
    expect(
      replayMessages(start, [msg("alice", 1), start], delay).holds
    ).toEqual([]);
  });
});
