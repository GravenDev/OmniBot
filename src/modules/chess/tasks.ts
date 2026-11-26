import { loggerMaker } from "#lib/logger.js";
import { declareTask } from "#lib/task.js";
import ratingEmojis from "./services/rating-emojis.service.js";
import store from "./services/session.service.js";
import watcher from "./services/watcher.service.js";

const logger = loggerMaker("chess");

/**
 * Registered from `onLoad`: neither task purges stored data (sessions live in
 * memory, watches are resumed), and resuming needs the watcher attached.
 */
export function chessTasks() {
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
    declareTask({
      id: "chess-emojis-retry",
      schedule: "30 * * * *",
      async run(client) {
        await ratingEmojis.ensure(client);
      },
    }),
  ];
}
