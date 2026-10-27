import { GatewayIntentBits } from "discord.js";
import { defineModule } from "#lib/module.js";
import panelButton from "./interactions/panel.button.js";
import panelModal from "./interactions/panel.modal.js";
import pickSelect from "./interactions/pick.select.js";
import usersSelect from "./interactions/users.select.js";
import channelDeleteListener from "./listeners/channel-delete.listener.js";
import voiceStateUpdateListener from "./listeners/voice-state-update.listener.js";
import { tempVoiceMaintenanceTasks, tempVoiceTasks } from "./tasks.js";
import { tempVoiceConfigSchema } from "./temp-voice.config.js";

const tempVoiceModule = defineModule({
  id: "temp-voice",
  name: "Temporary Voice Channels",
  description:
    "Creates a voice channel for whoever joins a hub, controlled by its owner from a panel, and deletes it once empty.",
  version: "1.0.0",
  author: "LoicR",

  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],

  config: tempVoiceConfigSchema,

  onLoad(_client, registry) {
    registry.register(panelButton);
    registry.register(panelModal);
    registry.register(usersSelect);
    registry.register(pickSelect);
    registry.register(voiceStateUpdateListener);
    registry.register(channelDeleteListener);
    for (const task of tempVoiceTasks(tempVoiceModule)) {
      registry.register(task);
    }
  },

  maintenanceTasks: tempVoiceMaintenanceTasks,
});

export default tempVoiceModule;
