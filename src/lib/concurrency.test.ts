import { describe, expect, it } from "vitest";
import { eachLimited } from "./concurrency.js";

const pause = () => new Promise((resolve) => setTimeout(resolve, 1));

describe("eachLimited", () => {
  it("runs every item, at most `limit` at once", async () => {
    let running = 0;
    let most = 0;
    const done: number[] = [];

    await eachLimited([1, 2, 3, 4, 5, 6], 2, async (item) => {
      running++;
      most = Math.max(most, running);
      await pause();
      running--;
      done.push(item);
    });

    expect(done.toSorted()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(most).toBe(2);
  });

  it("runs one item after another with a limit of 1", async () => {
    const events: string[] = [];

    await eachLimited(["a", "b"], 1, async (item) => {
      events.push(`start ${item}`);
      await pause();
      events.push(`end ${item}`);
    });

    expect(events).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("runs falsy items too", async () => {
    const seen: number[] = [];

    await eachLimited([0, 1], 4, async (item) => {
      seen.push(item);
    });

    expect(seen).toEqual([0, 1]);
  });

  it("runs one item at a time when the limit is not a positive number", async () => {
    for (const limit of [0, -1, Number.NaN]) {
      const events: string[] = [];

      await eachLimited(["a", "b"], limit, async (item) => {
        events.push(`start ${item}`);
        await pause();
        events.push(`end ${item}`);
      });

      expect(events).toEqual(["start a", "end a", "start b", "end b"]);
    }
  });

  it("starts no other item once one has failed", async () => {
    const started: number[] = [];

    await expect(
      eachLimited([1, 2, 3, 4], 2, async (item) => {
        started.push(item);
        await pause();
        if (item === 1) {
          throw new Error("boom");
        }
      })
    ).rejects.toThrow("boom");
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(started).toEqual([1, 2]);
  });

  // The caller's catch then knows nothing of the loop still runs.
  it("rejects only once the items already started have finished", async () => {
    let finished = false;
    let release!: () => void;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });

    const loop = eachLimited([1, 2], 2, async (item) => {
      if (item === 1) {
        throw new Error("boom");
      }
      await slow;
      finished = true;
    });
    const settled = loop.then(
      () => "resolved",
      () => (finished ? "rejected after" : "rejected before")
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();

    expect(await settled).toBe("rejected after");
  });
});
