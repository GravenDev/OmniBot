import { declareTask } from "#lib/task.js";
import sync from "../services/sync.service.js";

export function syncTask() {
  return declareTask({
    id: "sync",
    schedule: "0 6 * * *",
    run: () => sync.syncAll().then(() => undefined),
  });
}
