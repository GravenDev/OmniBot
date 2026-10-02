export interface GameMessageInfo {
  channelId: string;
  authorId: string;
  sentAt: Date;
}

export type MessageOutcome =
  | { kind: "first" }
  | { kind: "outdated" }
  | { kind: "sameAuthor" }
  | { kind: "tooSoon" }
  | { kind: "point"; winnerId: string };

export function evaluateMessage(
  last: GameMessageInfo | null,
  incoming: GameMessageInfo,
  delaySeconds: number
): MessageOutcome {
  if (!last || last.channelId !== incoming.channelId) {
    return { kind: "first" };
  }
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
    return { kind: "point", winnerId: last.authorId };
  }
  return { kind: "tooSoon" };
}
