const HOUR_MS = 60 * 60 * 1000;
const CAPACITY = 1000;

export class LogThrottle {
  private readonly last = new Map<string, number>();
  private readonly intervalMs: number;
  private readonly now: () => number;

  constructor(intervalMs = HOUR_MS, now: () => number = Date.now) {
    this.intervalMs = intervalMs;
    this.now = now;
  }

  level(key: string): "warn" | "debug" {
    const now = this.now();
    const previous = this.last.get(key);
    if (previous !== undefined && now - previous < this.intervalMs) {
      return "debug";
    }
    this.last.delete(key);
    this.last.set(key, now);
    const [oldest] = this.last.keys();
    if (this.last.size > CAPACITY && oldest !== undefined) {
      this.last.delete(oldest);
    }
    return "warn";
  }
}
