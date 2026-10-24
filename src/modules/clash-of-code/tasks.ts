import { loggerMaker } from "#lib/logger.js";
import { declareTask } from "#lib/task.js";
import watcher from "./services/watcher.js";

const logger = loggerMaker("clash-of-code");

export function clashOfCodeTasks() {
  return [
    declareTask({
      id: "resume-watch",
      schedule: "0 * * * *",
      runOnStart: true,
      async run() {
        const resumed = await watcher.resume();
        if (resumed > 0) {
          logger.info(`Clash watches resumed | count = ${resumed}`);
        }
      },
    }),
  ];
}
