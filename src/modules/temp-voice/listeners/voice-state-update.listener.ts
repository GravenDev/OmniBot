import type { VoiceState } from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import lifecycle from "#modules/temp-voice/services/lifecycle.service.js";
import store from "#modules/temp-voice/services/store.service.js";
import type { TempVoiceConfigSchema } from "#modules/temp-voice/temp-voice.config.js";

export default declareEventListener<"voiceStateUpdate", TempVoiceConfigSchema>({
  eventType: "voiceStateUpdate",

  async execute(oldState: VoiceState, newState: VoiceState, config) {
    if (!config || oldState.channelId === newState.channelId) {
      return;
    }

    const left = oldState.channel;
    if (left) {
      await lifecycle.memberLeft(left, newState.id, config.t);
    }

    const joined = newState.channel;
    const member = newState.member;
    if (!joined || !member) {
      return;
    }
    await lifecycle.ownerMoved(joined, member.id, config.t);
    const hub = await store.hub(newState.guild.id, joined.id);
    if (hub) {
      await lifecycle.joinHub(member, joined, hub, config);
    }
  },
});
