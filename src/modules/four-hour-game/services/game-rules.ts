import type { ChannelMessage, GameMessage } from "./types.js";

export type GameMessageInfo = Pick<
  GameMessage,
  "channelId" | "authorId" | "sentAt"
>;

export type MessageOutcome =
  | { kind: "first" }
  | { kind: "outdated" }
  | { kind: "sameAuthor" }
  | { kind: "tooSoon" }
  | {
      kind: "point";
      winnerId: string;
      heldSeconds: number;
      heldSince: Date;
    };

/**
 * The message in place: `scoringFrom`, when set, is the time its 4h delay
 * counts from at the earliest (see FourHourGameLastMessage).
 */
export type StandingInfo = GameMessageInfo & { scoringFrom?: Date };

/** When the 4h delay of the message in place starts. */
export function delayStart(
  last: Pick<StandingInfo, "sentAt" | "scoringFrom">
): Date {
  return last.scoringFrom && last.scoringFrom > last.sentAt
    ? last.scoringFrom
    : last.sentAt;
}

export function evaluateMessage(
  last: StandingInfo | null,
  incoming: GameMessageInfo,
  delaySeconds: number
): MessageOutcome {
  if (!last || last.channelId !== incoming.channelId) {
    return { kind: "first" };
  }
  return evaluateReply(last, incoming, delaySeconds);
}

type ReplyInfo = Pick<GameMessage, "authorId" | "sentAt">;

/** The rule of a reply to the message in place, live or replayed. */
function evaluateReply(
  last: ReplyInfo & Pick<StandingInfo, "scoringFrom">,
  incoming: ReplyInfo,
  delaySeconds: number
): MessageOutcome {
  if (incoming.sentAt.getTime() < last.sentAt.getTime()) {
    return { kind: "outdated" };
  }
  if (last.authorId === incoming.authorId) {
    return { kind: "sameAuthor" };
  }
  const from = delayStart(last).getTime();
  if (from + delaySeconds * 1000 <= incoming.sentAt.getTime()) {
    return {
      kind: "point",
      winnerId: last.authorId,
      heldSeconds: Math.floor((incoming.sentAt.getTime() - from) / 1000),
      heldSince: last.sentAt,
    };
  }
  return { kind: "tooSoon" };
}

export interface Hold {
  authorId: string;
  from: Date;
  to: Date;
}

export interface ReplayedPoint {
  winnerId: string;
  heldSeconds: number;
  heldSince: Date;
  awardedAt: Date;
}

export interface Replay<M extends ChannelMessage> {
  holds: Hold[];
  points: ReplayedPoint[];
  last: M;
  /** When the 4h delay of `last` counts from (see delayStart). */
  scoringFrom: Date | undefined;
}

/**
 * Replays `messages` (oldest first) after `start`, by the rule of a live
 * reply: each message from another author ends the hold of the one in place,
 * and scores the 4h point when it came after the delay. Messages up to
 * `start` are the ones read before it.
 */
export function replayMessages<M extends ChannelMessage>(
  start: M,
  messages: readonly M[],
  delaySeconds: number,
  startScoringFrom?: Date
): Replay<M> {
  const holds: Hold[] = [];
  const points: ReplayedPoint[] = [];
  let last = start;
  // As live: a point restarts the count, a reply too soon keeps it.
  let scoringFrom = startScoringFrom;
  for (const message of messages) {
    if (message.sentAt <= start.sentAt) {
      continue;
    }
    const outcome = evaluateReply(
      { ...last, ...(scoringFrom && { scoringFrom }) },
      message,
      delaySeconds
    );
    if (outcome.kind === "sameAuthor" || outcome.kind === "outdated") {
      continue;
    }
    holds.push({
      authorId: last.authorId,
      from: last.sentAt,
      to: message.sentAt,
    });
    if (outcome.kind === "point") {
      const { winnerId, heldSeconds, heldSince } = outcome;
      scoringFrom = message.sentAt;
      points.push({
        winnerId,
        heldSeconds,
        heldSince,
        awardedAt: message.sentAt,
      });
    }
    last = message;
  }
  return { holds, points, last, scoringFrom };
}
