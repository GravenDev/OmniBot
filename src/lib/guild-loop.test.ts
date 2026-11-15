import { Collection, type Client, type Guild } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { forEachGuild, presentGuilds } from "./guild-loop.js";
import type { loggerMaker } from "./logger.js";

type Logger = ReturnType<typeof loggerMaker>;

function fakeLogger() {
  return { debug: vi.fn(), error: vi.fn() };
}

/** A client on the given guilds; `available: false` for an outage. */
function fakeClient(...guilds: { id: string; available?: boolean }[]) {
  const cache = new Collection<string, Guild>(
    guilds.map(({ id, available = true }) => [
      id,
      { id, available } as unknown as Guild,
    ])
  );
  return { guilds: { cache } } as unknown as Client;
}

describe("presentGuilds", () => {
  it("keeps the guilds the bot is on, in the given order", () => {
    const logger = fakeLogger();
    const client = fakeClient({ id: "a" }, { id: "b" });

    const guilds = presentGuilds(client, ["b", "a"], {
      action: "post the report",
      logger: logger as unknown as Logger,
    });

    expect(guilds.map((guild) => guild.id)).toEqual(["b", "a"]);
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it("skips a guild the bot left, at debug level", () => {
    const logger = fakeLogger();
    const client = fakeClient({ id: "here" });

    const guilds = presentGuilds(client, ["gone", "here"], {
      action: "post the report",
      logger: logger as unknown as Logger,
    });

    expect(guilds.map((guild) => guild.id)).toEqual(["here"]);
    expect(logger.debug).toHaveBeenCalledWith(
      "Guild skipped | action = post the report | reason = bot not in the guild | guildId = gone"
    );
  });

  // An outage, or a guild not arrived yet when the bot got ready: Discord's
  // API may still answer, and a daily task skipped then would not come back.
  it("keeps a guild Discord reports unavailable", () => {
    const logger = fakeLogger();
    const client = fakeClient({ id: "down", available: false });

    const guilds = presentGuilds(client, ["down"], {
      action: "post the report",
      logger: logger as unknown as Logger,
    });

    expect(guilds.map((guild) => guild.id)).toEqual(["down"]);
  });
});

describe("forEachGuild", () => {
  it("runs for each guild the bot is on, with the guild, and none other", async () => {
    const logger = fakeLogger();
    const client = fakeClient({ id: "a" }, { id: "b" });
    const run = vi.fn(async (_guild: Guild) => {});

    await forEachGuild(client, ["a", "gone", "b"], run, {
      action: "post the report",
      logger: logger as unknown as Logger,
    });

    expect(run.mock.calls.map(([guild]) => guild.id)).toEqual(["a", "b"]);
  });

  it("goes on with the other guilds when one fails, and logs it", async () => {
    const logger = fakeLogger();
    const client = fakeClient({ id: "broken" }, { id: "fine" });
    const boom = new Error("boom");
    const run = vi.fn(async (guild: Guild) => {
      if (guild.id === "broken") {
        throw boom;
      }
    });

    await forEachGuild(client, ["broken", "fine"], run, {
      action: "post the report",
      logger: logger as unknown as Logger,
    });

    expect(run).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      { err: boom },
      "Failed to post the report | guildId = broken"
    );
  });

  it("runs four guilds at once by default, not all of them", async () => {
    const client = fakeClient(
      ...Array.from({ length: 10 }, (_, i) => ({ id: `g${i}` }))
    );
    let running = 0;
    let most = 0;
    const run = async () => {
      running++;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
    };

    await forEachGuild(
      client,
      client.guilds.cache.map((guild) => guild.id),
      run,
      { action: "post", logger: fakeLogger() as unknown as Logger }
    );

    expect(most).toBe(4);
  });

  it("runs one guild after another when asked to", async () => {
    const client = fakeClient({ id: "a" }, { id: "b" }, { id: "c" });
    const events: string[] = [];
    const run = async (guild: Guild) => {
      events.push(`start ${guild.id}`);
      await new Promise((resolve) => setTimeout(resolve, 1));
      events.push(`end ${guild.id}`);
    };

    await forEachGuild(client, ["a", "b", "c"], run, {
      action: "sync",
      logger: fakeLogger() as unknown as Logger,
      concurrency: 1,
    });

    expect(events).toEqual([
      "start a",
      "end a",
      "start b",
      "end b",
      "start c",
      "end c",
    ]);
  });

  it("does nothing on an empty list", async () => {
    const run = vi.fn(async () => {});

    await forEachGuild(fakeClient(), [], run, {
      action: "post",
      logger: fakeLogger() as unknown as Logger,
    });

    expect(run).not.toHaveBeenCalled();
  });
});
