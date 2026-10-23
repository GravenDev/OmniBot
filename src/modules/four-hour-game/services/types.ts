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

export type HistoryFetcher = () => Promise<ChannelMessage[]>;
