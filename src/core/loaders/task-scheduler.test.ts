import type { Client } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";
import { Registry } from "#lib/registry.js";
import { declareTask } from "#lib/task.js";
import {
  startMaintenanceTasks,
  startModuleTasks,
  stopAllTasks,
} from "./task-scheduler.js";

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

  it("starts a module's maintenance tasks without its registry", async () => {
    const run = vi.fn(async () => {});
    startMaintenanceTasks(client, {
      id: "skipped-module",
      registry: new Registry(),
      maintenanceTasks: () => [
        declareTask({
          id: "purge",
          schedule: "0 0 1 1 *",
          runOnStart: true,
          run,
        }),
      ],
    } as unknown as Module);

    await vi.waitFor(() => expect(run).toHaveBeenCalledWith(client));
  });

  it("starts nothing for a module without maintenance tasks", () => {
    expect(() => startMaintenanceTasks(client, moduleWith())).not.toThrow();
  });

  it("lets a maintenance task share the id of a module task", async () => {
    const task = (run: () => Promise<void>) =>
      declareTask({
        id: "purge",
        schedule: "0 0 1 1 *",
        runOnStart: true,
        run,
      });
    const purge = vi.fn(async () => {});
    const other = vi.fn(async () => {});
    startModuleTasks(client, moduleWith(task(other)));
    startMaintenanceTasks(client, {
      ...moduleWith(),
      maintenanceTasks: () => [task(purge)],
    } as unknown as Module);

    await vi.waitFor(() => {
      expect(other).toHaveBeenCalledOnce();
      expect(purge).toHaveBeenCalledOnce();
    });
  });

  it("skips a task with an invalid schedule and schedules the next ones", async () => {
    const next = vi.fn(async () => {});
    startModuleTasks(
      client,
      moduleWith(
        declareTask({ id: "broken", schedule: "not a cron", run: vi.fn() }),
        declareTask({
          id: "next",
          schedule: "0 0 1 1 *",
          runOnStart: true,
          run: next,
        })
      )
    );

    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
  });

  it("survives maintenance tasks that fail to build", () => {
    expect(() =>
      startMaintenanceTasks(client, {
        ...moduleWith(),
        maintenanceTasks: () => {
          throw new Error("boom");
        },
      } as unknown as Module)
    ).not.toThrow();
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

  it("follows the time zone of a task", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-13T21:59:59Z") });
    const paris = vi.fn(async () => {});
    const utc = vi.fn(async () => {});
    startModuleTasks(
      client,
      moduleWith(
        declareTask({
          id: "paris",
          schedule: "0 0 * * *",
          timezone: "Europe/Paris",
          run: paris,
        }),
        declareTask({ id: "utc", schedule: "0 0 * * *", run: utc })
      )
    );

    await vi.advanceTimersByTimeAsync(2_000);
    expect(paris).toHaveBeenCalledOnce();
    expect(utc).not.toHaveBeenCalled();
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
