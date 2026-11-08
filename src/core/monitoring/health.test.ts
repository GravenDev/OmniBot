import { type Client, Collection, Status } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { botHealth, databaseProbe } from "./health.js";

interface FakeShard {
  status: Status;
  ping: number;
}

// The manager's own status is Ready for good once the client has logged in
// (discord.js sets it once): only the shards follow the connection.
function client(...shards: FakeShard[]): Client {
  const collection = new Collection(shards.map((shard, id) => [id, shard]));
  const ping =
    shards.reduce((sum, shard) => sum + shard.ping, 0) / shards.length;
  return {
    ws: { status: Status.Ready, shards: collection, ping },
  } as unknown as Client;
}

const ready = (ping = 42): FakeShard => ({ status: Status.Ready, ping });
const reachable = async () => true;

describe("botHealth", () => {
  it("is up when every shard is ready and the database answers", async () => {
    await expect(botHealth(client(ready()), reachable)).resolves.toEqual({
      up: true,
      msg: "OK",
      ping: 42,
    });
  });

  it.each([
    ["Connecting", Status.Connecting],
    ["Resuming", Status.Resuming],
    ["Identifying", Status.Identifying],
    ["Disconnected", Status.Disconnected],
  ])(
    "is down while a shard is %s, even though the manager says Ready",
    async (name, status) => {
      const probe = vi.fn(reachable);
      await expect(
        botHealth(client(ready(), { status, ping: -1 }), probe)
      ).resolves.toEqual({ up: false, msg: `Discord gateway ${name}` });
      expect(probe).not.toHaveBeenCalled();
    }
  );

  it("is down without any shard", async () => {
    await expect(botHealth(client(), reachable)).resolves.toEqual({
      up: false,
      msg: "Discord gateway not connected",
    });
  });

  it("is down when the database probe fails", async () => {
    await expect(
      botHealth(client(ready()), async () => false)
    ).resolves.toEqual({ up: false, msg: "Database unreachable" });
  });

  it("leaves out the latency while no shard knows it", async () => {
    const health = await botHealth(
      client({ status: Status.Ready, ping: -1 }),
      reachable
    );
    expect(health).toEqual({ up: true, msg: "OK" });
  });

  it("averages only the shards whose latency is known", async () => {
    const health = await botHealth(
      client(ready(80), { status: Status.Ready, ping: -1 }),
      reachable
    );
    expect(health.ping).toBe(80);
  });
});

describe("databaseProbe", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("succeeds when the query answers", async () => {
    await expect(databaseProbe(async () => 1)()).resolves.toBe(true);
  });

  it("fails when the query fails", async () => {
    const probe = databaseProbe(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(probe()).resolves.toBe(false);
  });

  it("fails when the query does not answer within 5 s", async () => {
    vi.useFakeTimers();
    const result = databaseProbe(() => new Promise(() => {}))();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(result).resolves.toBe(false);
  });

  it("does not stack queries on a database that hangs", async () => {
    vi.useFakeTimers();
    const query = vi.fn(() => new Promise(() => {}));
    const probe = databaseProbe(query);
    const first = probe();
    await vi.advanceTimersByTimeAsync(5_000);
    await first;
    await expect(probe()).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("queries again once the hanging query settles", async () => {
    vi.useFakeTimers();
    let settle!: () => void;
    const query = vi
      .fn<() => Promise<unknown>>()
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => (settle = resolve))
      )
      .mockResolvedValue(1);
    const probe = databaseProbe(query);
    const first = probe();
    await vi.advanceTimersByTimeAsync(5_000);
    await first;
    settle();
    await vi.advanceTimersByTimeAsync(0);
    await expect(probe()).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
