import { removeOnChannelDelete } from "#lib/listener.js";
import store from "#modules/autoreact/services/store.js";

export default removeOnChannelDelete(
  "autoreact",
  "Auto-reaction",
  (guildId, channelId) => store.remove(guildId, channelId)
);
