export class KeyedQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const next = (this.tails.get(key) ?? Promise.resolve()).then(task, task);
    const tail = next.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    });
    return next;
  }
}
