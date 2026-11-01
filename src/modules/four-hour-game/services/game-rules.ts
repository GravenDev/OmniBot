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

export function evaluateMessage(
  last: GameMessageInfo | null,
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
  last: ReplyInfo,
  incoming: ReplyInfo,
  delaySeconds: number
): MessageOutcome {
  if (incoming.sentAt.getTime() < last.sentAt.getTime()) {
    return { kind: "outdated" };
  }
  if (last.authorId === incoming.authorId) {
    return { kind: "sameAuthor" };
  }
  if (
    last.sentAt.getTime() + delaySeconds * 1000 <=
    incoming.sentAt.getTime()
  ) {
    return {
      kind: "point",
      winnerId: last.authorId,
      heldSeconds: Math.floor(
        (incoming.sentAt.getTime() - last.sentAt.getTime()) / 1000
      ),
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
  delaySeconds: number
): Replay<M> {
  const holds: Hold[] = [];
  const points: ReplayedPoint[] = [];
  let last = start;
  for (const message of messages) {
    if (message.sentAt <= start.sentAt) {
      continue;
    }
    const outcome = evaluateReply(last, message, delaySeconds);
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
      points.push({
        winnerId,
        heldSeconds,
        heldSince,
        awardedAt: message.sentAt,
      });
    }
    last = message;
  }
  return { holds, points, last };
}
