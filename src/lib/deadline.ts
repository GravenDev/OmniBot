/**
 * Waits for `promise` at most `waitMs`. Resolves to its value, or to null when
 * it rejects or takes longer: the promise itself is abandoned, not cancelled.
 */
export function withDeadline<T>(
  promise: Promise<T>,
  waitMs: number
): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs);
  });
  return Promise.race([promise.catch(() => null), timeout]).finally(() =>
    clearTimeout(timer)
  );
}
