import { declareTask } from "#lib/task.js";
import scoreTableService from "#modules/rngdle/services/score-table.service.js";
import syncService from "#modules/rngdle/services/sync.service.js";

export default declareTask({
  id: "score-table",
  schedule: "0 3 * * 1",
  runOnStart: true,
  async run() {
    if (await scoreTableService.refresh()) {
      await syncService.syncAll({ full: true });
    }
  },
});
