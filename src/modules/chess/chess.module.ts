import { GatewayIntentBits } from "discord.js";
import { defineModule } from "#lib/module.js";
import chessCommand from "./commands/chess.command.js";
import actionButton from "./interactions/action.button.js";
import listButton from "./interactions/list.button.js";
import navButton from "./interactions/nav.button.js";
import pgnModal from "./interactions/pgn.modal.js";
import pickButton from "./interactions/pick.button.js";
import channelDeleteListener from "./listeners/channel-delete.listener.js";
import liveButton from "./live/live.button.js";
import stopButton from "./live/stop.button.js";
import watchButton from "./live/watch.button.js";
import liveStore from "./services/live-store.service.js";
import ratingEmojis from "./services/rating-emojis.service.js";
import watcher from "./services/watcher.service.js";
import { chessTasks } from "./tasks.js";

const chessModule = defineModule({
  id: "chess",
  name: "Chess",
  description:
    "Lists recent Lichess and Chess.com games, follows games in progress, draws an image board and analyses games with rating badges and a report.",
  version: "1.0.0",
  author: "RedsTom",

  intents: [GatewayIntentBits.Guilds],

  async onLoad(client, registry) {
    // Never throws: without the emojis, the badges show as text until the
    // hourly task loads them.
    await ratingEmojis.ensure(client);
    watcher.attach(client, chessModule);

    registry.register(chessCommand);
    registry.register(pgnModal);
    registry.register(listButton);
    registry.register(pickButton);
    registry.register(navButton);
    registry.register(actionButton);
    registry.register(liveButton);
    registry.register(watchButton);
    registry.register(stopButton);
    registry.register(channelDeleteListener);
    for (const task of chessTasks()) registry.register(task);
  },

  // A watch keeps who started it: it leaves with the member's data, and with
  // the module. The public message stays, frozen on its last position.
  async deleteMemberData(guildId, userId) {
    const ids = await liveStore.removeMember(guildId, userId);
    for (const id of ids) watcher.forget(id);
  },

  async onUninstall(_client, guild) {
    const ids = await liveStore.removeGuild(guild.id);
    for (const id of ids) watcher.forget(id);
  },
});

export default chessModule;
