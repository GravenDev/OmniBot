import type { DMChannel, NonThreadGuildBasedChannel } from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import { channelDeleted } from "#modules/temp-voice/services/lifecycle.js";
import type { TempVoiceConfigSchema } from "#modules/temp-voice/temp-voice.config.js";

export default declareEventListener<"channelDelete", TempVoiceConfigSchema>({
  eventType: "channelDelete",

  async execute(channel: DMChannel | NonThreadGuildBasedChannel, config) {
    if (!config || channel.isDMBased() || !channel.isVoiceBased()) {
      return;
    }
    await channelDeleted(channel.guild, channel.id);
  },
});
