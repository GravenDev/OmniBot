import { GatewayIntentBits, Partials } from "discord.js";
import { defineModule } from "#lib/module.js";
import {
  channelDeleteListener,
  threadDeleteListener,
} from "./listeners/channel-delete.listener.js";
import {
  messageDeleteBulkListener,
  messageDeleteListener,
  messageUpdateListener,
} from "./listeners/message-changes.listener.js";
import reactionAddListener from "./listeners/reaction-add.listener.js";
import {
  reactionRemoveAllListener,
  reactionRemoveEmojiListener,
  reactionRemoveListener,
} from "./listeners/reaction-remove.listener.js";
import { starboardConfigSchema } from "./starboard.config.js";

export default defineModule({
  id: "starboard",
  name: "Starboard",
  description:
    "Reposts the messages that get enough reactions in a dedicated channel.",
  version: "1.0.0",
  author: "RedsTom, LoicR",

  config: starboardConfigSchema,

  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],

  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
  ],

  onLoad(_client, registry) {
    registry.register(reactionAddListener);
    registry.register(reactionRemoveListener);
    registry.register(reactionRemoveEmojiListener);
    registry.register(reactionRemoveAllListener);
    registry.register(messageUpdateListener);
    registry.register(messageDeleteListener);
    registry.register(messageDeleteBulkListener);
    registry.register(channelDeleteListener);
    registry.register(threadDeleteListener);
  },
});
