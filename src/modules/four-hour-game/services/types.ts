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

// Chronological player messages of the game channel; `complete` tells
// whether the reading reached the requested time.
export interface ChannelHistory {
  messages: ChannelMessage[];
  complete: boolean;
}

// The latest messages when `since` is null, else every message since then.
export type HistoryFetcher = (since: Date | null) => Promise<ChannelHistory>;
