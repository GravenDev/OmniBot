import { beforeEach, describe, expect, it, vi } from "vitest";
import { silenceLogs } from "#lib/testing.js";

silenceLogs();

const mocks = vi.hoisted(() => ({
  sweep: vi.fn(() => 2),
  resume: vi.fn(async () => 1),
  declareTask: vi.fn((task: object) => task),
}));

vi.mock("#lib/task.js", () => ({ declareTask: mocks.declareTask }));
vi.mock("./services/session.service.js", () => ({
  default: { sweep: mocks.sweep },
}));
vi.mock("./live/watcher.service.js", () => ({
  default: { resume: mocks.resume },
}));

import { chessMaintenanceTasks } from "./tasks.js";

describe("chess maintenance tasks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sweeps expired sessions and resumes live watches hourly", async () => {
    const tasks = chessMaintenanceTasks() as Array<{
      id: string;
      schedule: string;
      runOnStart?: boolean;
      run(): Promise<void>;
    }>;

    expect(tasks.map((task) => task.id)).toEqual([
      "chess-session-sweep",
      "chess-watch-resume",
    ]);
    expect(tasks[0]?.schedule).toBe("0 * * * *");
    expect(tasks[1]?.runOnStart).toBe(true);

    await tasks[0]!.run();
    await tasks[1]!.run();

    expect(mocks.sweep).toHaveBeenCalledOnce();
    expect(mocks.resume).toHaveBeenCalledOnce();
  });
});
