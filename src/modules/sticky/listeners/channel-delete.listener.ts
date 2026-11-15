import { removeOnChannelDelete } from "#lib/listener.js";
import store from "#modules/sticky/services/store.js";

export default removeOnChannelDelete("sticky", "Sticky", (guildId, channelId) =>
  store.remove(guildId, channelId)
);
