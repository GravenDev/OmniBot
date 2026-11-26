import { beforeEach, describe, expect, it, vi } from "vitest";
import { silenceLogs } from "#lib/testing.js";

silenceLogs();

const mocks = vi.hoisted(() => ({
  sweep: vi.fn(() => 2),
  resume: vi.fn(async () => 1),
  declareTask: vi.fn((task: object) => task),
  ensureRatingEmojis: vi.fn(async () => true),
}));

vi.mock("#lib/task.js", () => ({ declareTask: mocks.declareTask }));
vi.mock("./services/rating-emojis.service.js", () => ({
  default: { ensure: mocks.ensureRatingEmojis },
}));
vi.mock("./services/session.service.js", () => ({
  default: { sweep: mocks.sweep },
}));
vi.mock("./services/watcher.service.js", () => ({
  default: { resume: mocks.resume },
}));

import { chessTasks } from "./tasks.js";

describe("chess tasks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sweeps expired sessions and resumes live watches hourly", async () => {
    const tasks = chessTasks() as Array<{
      id: string;
      schedule: string;
      runOnStart?: boolean;
      run(): Promise<void>;
    }>;

    expect(tasks.map((task) => task.id)).toEqual([
      "chess-session-sweep",
      "chess-watch-resume",
      "chess-emojis-retry",
    ]);
    expect(tasks[0]?.schedule).toBe("0 * * * *");
    expect(tasks[1]?.runOnStart).toBe(true);

    await tasks[0]!.run();
    await tasks[1]!.run();
    const client = { id: "client" };
    await (tasks[2] as unknown as { run(client: unknown): Promise<void> }).run(
      client
    );
    expect(mocks.ensureRatingEmojis).toHaveBeenCalledWith(client);

    expect(mocks.sweep).toHaveBeenCalledOnce();
    expect(mocks.resume).toHaveBeenCalledOnce();
  });
});
