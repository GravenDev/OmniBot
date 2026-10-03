import { describe, expect, it } from "vitest";
import { KeyedQueue } from "./keyed-queue.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("KeyedQueue", () => {
  it("runs tasks of the same key one after another, in order", async () => {
    const queue = new KeyedQueue();
    const gate = deferred();
    const order: string[] = [];

    const first = queue.run("guild", async () => {
      await gate.promise;
      order.push("first");
    });
    const second = queue.run("guild", async () => {
      order.push("second");
    });

    await Promise.resolve();
    expect(order).toEqual([]);
    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
  });

  it("does not make other keys wait", async () => {
    const queue = new KeyedQueue();
    const gate = deferred();

    const blocked = queue.run("a", () => gate.promise);
    await expect(queue.run("b", async () => "free")).resolves.toBe("free");

    gate.resolve();
    await blocked;
  });

  it("keeps going after a failed task and returns each result", async () => {
    const queue = new KeyedQueue();

    await expect(
      queue.run("guild", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    await expect(queue.run("guild", async () => 42)).resolves.toBe(42);
  });
});
