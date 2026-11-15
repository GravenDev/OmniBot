/**
 * Runs `run` on each item, at most `limit` at once, starting them in order.
 * `run` keeps its own failures: once one throws, no further item starts, and
 * the whole rejects with it when the items already started have finished. A
 * limit below 1, or not a number, runs one item at a time.
 */
export async function eachLimited<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  let failed = false;
  const worker = async () => {
    // In sequence within a worker: the workers together keep `limit` items
    // running.
    while (!failed && next < items.length) {
      try {
        await run(items[next++] as T);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  const workers = Math.min(Math.max(1, Math.floor(limit) || 1), items.length);
  const results = await Promise.allSettled(
    Array.from({ length: workers }, worker)
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) {
    throw failure.reason;
  }
}
