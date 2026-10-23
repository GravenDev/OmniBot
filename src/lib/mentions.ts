import type { MessageMentionOptions } from "discord.js";

// Mention nobody, whatever the content says.
export const NO_MENTIONS = { parse: [] } satisfies MessageMentionOptions;

// The same for a reply, without pinging the author of the message replied to.
export const NO_MENTIONS_REPLY = {
  parse: [],
  repliedUser: false,
} satisfies MessageMentionOptions;
