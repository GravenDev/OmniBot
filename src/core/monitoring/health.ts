import { type Client, Status } from "discord.js";
import { withDeadline } from "#lib/deadline.js";
import type { Health } from "./heartbeat.js";

const DATABASE_TIMEOUT_MS = 5_000;

/**
 * Wraps a database query into a probe that answers whether the database
 * replied within 5 s. A probe that hangs is abandoned, not cancelled: it keeps
 * a pool connection until it settles, so no other one starts meanwhile, or a
 * long stall would take the whole pool, one connection per heartbeat.
 */
export function databaseProbe(
  query: () => Promise<unknown>
): () => Promise<boolean> {
  let inFlight = false;
  return async () => {
    if (inFlight) {
      return false;
    }
    inFlight = true;
    const answered = await withDeadline(
      // Wrapped: a synchronous throw would leave inFlight set for good.
      (async () => query())()
        .then(() => true)
        .finally(() => {
          inFlight = false;
        }),
      DATABASE_TIMEOUT_MS
    );
    return answered === true;
  };
}

/**
 * The bot is up when every gateway shard is ready and the database probe
 * succeeds. Anything else is reported as down, with the reason.
 */
export async function botHealth(
  client: Client,
  probeDatabase: () => Promise<boolean>
): Promise<Health> {
  // Shards, not `client.ws.status`: discord.js sets the manager's status to
  // Ready once and never changes it back, while each shard moves to
  // Connecting, Resuming, Identifying or Disconnected when its connection drops.
  const shards = [...client.ws.shards.values()];
  if (shards.length === 0) {
    return { up: false, msg: "Discord gateway not connected" };
  }
  const notReady = shards.find((shard) => shard.status !== Status.Ready);
  if (notReady) {
    return {
      up: false,
      msg: `Discord gateway ${Status[notReady.status] ?? "unknown"}`,
    };
  }
  if (!(await probeDatabase())) {
    return { up: false, msg: "Database unreachable" };
  }
  // A shard reports -1 until its first heartbeat is acknowledged.
  const known = shards.map((shard) => shard.ping).filter((ping) => ping >= 0);
  if (known.length === 0) {
    return { up: true, msg: "OK" };
  }
  const ping = known.reduce((sum, value) => sum + value, 0) / known.length;
  return { up: true, msg: "OK", ping };
}
