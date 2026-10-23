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

// Chronological player messages of the game channel: the latest ones when
// `since` is null, else every one since then and the one in place at that
// time, unless the reading stopped before reaching it.
export type HistoryFetcher = (since: Date | null) => Promise<ChannelMessage[]>;
