import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("#lib/logger.js", () => ({ loggerMaker: () => log }));

const { heartbeatUrl, uptimeKumaReporter } = await import("./uptime-kuma.js");

beforeEach(() => {
  vi.clearAllMocks();
});

const live = new AbortController().signal;

const PUSH_URL = "https://kuma.example/api/push/s3cr3t?status=up&msg=OK&ping=";

describe("heartbeatUrl", () => {
  it("replaces the placeholders of the copied URL", () => {
    const url = heartbeatUrl(new URL(PUSH_URL), {
      up: true,
      msg: "OK",
      ping: 41.6,
    });
    expect(url.pathname).toBe("/api/push/s3cr3t");
    expect(url.searchParams.get("status")).toBe("up");
    expect(url.searchParams.get("msg")).toBe("OK");
    expect(url.searchParams.get("ping")).toBe("42");
  });

  it("reports a down status with its reason", () => {
    const url = heartbeatUrl(new URL("https://kuma.example/api/push/t"), {
      up: false,
      msg: "Database unreachable",
    });
    expect(url.searchParams.get("status")).toBe("down");
    expect(url.searchParams.get("msg")).toBe("Database unreachable");
    expect(url.searchParams.get("ping")).toBe("");
  });

  it("leaves out an unknown gateway latency", () => {
    const url = heartbeatUrl(new URL(PUSH_URL), { up: true, msg: "OK" });
    expect(url.searchParams.get("ping")).toBe("");
  });
});

describe("uptimeKumaReporter", () => {
  const ok = () => new Response(null, { status: 200 });

  it("is off without a URL", () => {
    expect(uptimeKumaReporter(undefined, vi.fn())).toBeNull();
  });

  it("pushes the health to the monitor", async () => {
    const fetch = vi.fn(async (_url: URL) => ok());
    const report = uptimeKumaReporter(new URL(PUSH_URL), fetch as never);
    await report?.({ up: false, msg: "Database unreachable" }, live);
    const url = fetch.mock.calls[0]![0];
    expect(url.pathname).toBe("/api/push/s3cr3t");
    expect(url.searchParams.get("status")).toBe("down");
  });

  it.each([200, 404])(
    "releases the response body (HTTP %i) so the connection is reused",
    async (status) => {
      const cancel = vi.fn();
      const body = new ReadableStream({ cancel });
      const report = uptimeKumaReporter(
        new URL(PUSH_URL),
        async () => new Response(body, { status })
      );
      await report?.({ up: true, msg: "OK" }, live);
      expect(cancel).toHaveBeenCalled();
    }
  );

  it("logs why a push failed, without the URL", async () => {
    const report = uptimeKumaReporter(new URL(PUSH_URL), async () => {
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("getaddrinfo ENOTFOUND kuma.example"), {
          code: "ENOTFOUND",
        }),
      });
    });
    await report?.({ up: true, msg: "OK" }, live);
    const line = String(log.warn.mock.calls[0]?.at(-1));
    expect(line).toContain("ENOTFOUND");
    expect(line).not.toContain("s3cr3t");
  });

  it("gives up a push silently when the heartbeat stops", async () => {
    const controller = new AbortController();
    const report = uptimeKumaReporter(
      new URL(PUSH_URL),
      (_url, init) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason)
          )
        )
    );
    const pushing = report?.({ up: true, msg: "OK" }, controller.signal);
    controller.abort();
    await pushing;
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("swallows a failed push, network error or HTTP error alike", async () => {
    const fetch = vi
      .fn(async () => ok())
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const report = uptimeKumaReporter(new URL(PUSH_URL), fetch);
    await expect(
      report?.({ up: true, msg: "OK" }, live)
    ).resolves.toBeUndefined();
    await expect(
      report?.({ up: true, msg: "OK" }, live)
    ).resolves.toBeUndefined();
    await expect(
      report?.({ up: true, msg: "OK" }, live)
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
