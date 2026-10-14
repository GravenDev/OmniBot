import { loggerMaker } from "#lib/logger.js";
import { declareTask } from "#lib/task.js";
import api from "../services/api.service.js";
import store from "../services/store.service.js";
import sync from "../services/sync.service.js";

const logger = loggerMaker("rngdle");

export function scoreTableTask() {
  return declareTask({
    id: "score-table",
    schedule: "0 3 * * 1",
    runOnStart: true,
    async run() {
      const table = await api.fetchScoreTable();
      if (!table) {
        logger.warn("No usable score table on rngdle.com, keeping ours");
      } else if (await store.replaceScoreTable(table)) {
        logger.info("Score table changed, downloading every roll again");
        await sync.syncAll(true);
      }
    },
  });
}
