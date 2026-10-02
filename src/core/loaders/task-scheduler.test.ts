import type { Client } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";
import { Registry } from "#lib/registry.js";
import { declareTask } from "#lib/task.js";
import { startModuleTasks, stopAllTasks } from "./task-scheduler.js";

const client = {} as Client<true>;

function moduleWith(...tasks: ReturnType<typeof declareTask>[]): Module {
  const registry = new Registry();
  for (const task of tasks) {
    registry.register(task);
  }
  return { id: "test-module", registry } as unknown as Module;
}

afterEach(() => {
  stopAllTasks();
  vi.useRealTimers();
});

describe("task scheduler", () => {
  it("runs a task flagged runOnStart immediately", async () => {
    const run = vi.fn(async () => {});
    startModuleTasks(
      client,
      moduleWith(
        declareTask({
          id: "boot",
          schedule: "0 0 1 1 *",
          runOnStart: true,
          run,
        })
      )
    );

    await vi.waitFor(() => expect(run).toHaveBeenCalledWith(client));
  });

  it("does not run other tasks before their schedule", async () => {
    const run = vi.fn(async () => {});
    startModuleTasks(
      client,
      moduleWith(declareTask({ id: "yearly", schedule: "0 0 1 1 *", run }))
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(run).not.toHaveBeenCalled();
  });

  it("runs a task on its schedule and keeps running after a failure", async () => {
    const run = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(undefined);
    startModuleTasks(
      client,
      moduleWith(
        declareTask({ id: "every-second", schedule: "* * * * * *", run })
      )
    );

    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2), {
      timeout: 3_500,
    });
  });

  it("stops every task on shutdown", async () => {
    const run = vi.fn(async () => {});
    startModuleTasks(
      client,
      moduleWith(declareTask({ id: "stopped", schedule: "* * * * * *", run }))
    );

    stopAllTasks();
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(run).not.toHaveBeenCalled();
  });

  it("registers tasks through the module registry", () => {
    const task = declareTask({
      id: "x",
      schedule: "0 1 * * *",
      run: async () => {},
    });
    expect(moduleWith(task).registry.tasks).toEqual([task]);
  });
});
