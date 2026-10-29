// A message of the game channel, as the game remembers it.
export interface ChannelMessage {
  messageId: string;
  authorId: string;
  sentAt: Date;
}

export interface GameMessage extends ChannelMessage {
  guildId: string;
  channelId: string;
}

export type LatestMessageFetcher = () => Promise<ChannelMessage | null>;

// Reads the player messages of the game channel, oldest first.
export interface HistoryReader {
  /** The latest ones. */
  latest: () => Promise<ChannelMessage[]>;
  /**
   * Every one since `since`, and the one in place at that time, unless the
   * reading stopped before reaching it.
   */
  since: (since: Date) => Promise<ChannelMessage[]>;
}
