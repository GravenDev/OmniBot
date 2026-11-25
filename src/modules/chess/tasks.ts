import { loggerMaker } from "#lib/logger.js";
import { declareTask } from "#lib/task.js";
import watcher from "./live/watcher.service.js";
import store from "./services/session.service.js";

const logger = loggerMaker("chess");

export function chessMaintenanceTasks() {
  return [
    declareTask({
      id: "chess-session-sweep",
      schedule: "0 * * * *",
      async run() {
        const removed = store.sweep();
        if (removed > 0) {
          logger.info(`Expired chess sessions swept | count = ${removed}`);
        }
      },
    }),
    declareTask({
      id: "chess-watch-resume",
      schedule: "0 * * * *",
      runOnStart: true,
      async run() {
        const resumed = await watcher.resume();
        if (resumed > 0) {
          logger.info(`Chess watches resumed | count = ${resumed}`);
        }
      },
    }),
  ];
}
