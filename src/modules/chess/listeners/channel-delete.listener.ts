import { removeOnChannelDelete } from "#lib/listener.js";
import store from "../services/live-store.service.js";
import watcher from "../services/watcher.service.js";

export default removeOnChannelDelete(
  "chess",
  "Chess watches",
  async (guildId, channelId) => {
    const ids = await store.removeChannel(guildId, channelId);
    for (const id of ids) watcher.forget(id);
    return ids.length;
  }
);
