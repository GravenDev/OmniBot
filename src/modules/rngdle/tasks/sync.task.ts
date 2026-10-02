import { declareTask } from "#lib/task.js";
import syncService from "#modules/rngdle/services/sync.service.js";

export default declareTask({
  id: "sync",
  schedule: "0 6,18 * * *",
  async run() {
    await syncService.syncAll();
  },
});
