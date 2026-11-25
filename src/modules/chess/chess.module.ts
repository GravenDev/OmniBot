import { GatewayIntentBits } from "discord.js";
import { defineModule } from "#lib/module.js";
import chessCommand from "./commands/chess.command.js";
import { loadRatingEmojis, setRatingEmojis } from "./emojis.js";
import actionButton from "./interactions/action.button.js";
import listButton from "./interactions/list.button.js";
import navButton from "./interactions/nav.button.js";
import pgnModal from "./interactions/pgn.modal.js";
import pickButton from "./interactions/pick.button.js";
import liveButton from "./live/live.button.js";
import watchButton from "./live/watch.button.js";
import watcher from "./live/watcher.service.js";
import { chessMaintenanceTasks } from "./tasks.js";

const chessModule = defineModule({
  id: "chess",
  name: "Chess",
  description:
    "Lists recent Lichess and Chess.com games, follows games in progress, draws an image board and analyses games with rating badges and a report.",
  version: "1.0.0",
  author: "RedsTom",

  intents: [GatewayIntentBits.Guilds],

  async onLoad(client, registry) {
    // A throwing onLoad skips this module only: the bot still boots.
    setRatingEmojis(await loadRatingEmojis(client));
    watcher.attach(client, chessModule);

    registry.register(chessCommand);
    registry.register(pgnModal);
    registry.register(listButton);
    registry.register(pickButton);
    registry.register(navButton);
    registry.register(actionButton);
    registry.register(liveButton);
    registry.register(watchButton);
  },

  maintenanceTasks: chessMaintenanceTasks,
});

export default chessModule;
