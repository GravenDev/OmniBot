import type { VoiceState } from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import { joinHub, memberLeft } from "#modules/temp-voice/services/lifecycle.js";
import store from "#modules/temp-voice/services/store.js";
import type { TempVoiceConfigSchema } from "#modules/temp-voice/temp-voice.config.js";

export default declareEventListener<"voiceStateUpdate", TempVoiceConfigSchema>({
  eventType: "voiceStateUpdate",

  async execute(oldState: VoiceState, newState: VoiceState, config) {
    if (!config || oldState.channelId === newState.channelId) {
      return;
    }

    const left = oldState.channel;
    if (left) {
      await memberLeft(left);
    }

    const joined = newState.channel;
    const member = newState.member;
    if (!joined || !member) {
      return;
    }
    const hub = await store.hub(newState.guild.id, joined.id);
    if (hub) {
      await joinHub(member, joined, hub, config);
    }
  },
});
