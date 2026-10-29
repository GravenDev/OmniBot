import type { VoiceState } from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import {
  joinHub,
  memberLeft,
  ownerMoved,
} from "#modules/temp-voice/services/lifecycle.js";
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
      await memberLeft(left, newState.id, config.t);
    }

    const joined = newState.channel;
    const member = newState.member;
    if (!joined || !member) {
      return;
    }
    await ownerMoved(joined, member.id, config.t);
    const hub = await store.hub(newState.guild.id, joined.id);
    if (hub) {
      await joinHub(member, joined, hub, config);
    }
  },
});
