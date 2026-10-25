import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestConfig, silenceLogs } from "#lib/testing.js";
import { clashOfCodeConfigSchema } from "#modules/clash-of-code/clash-of-code.config.js";

const watch = vi.hoisted(() => vi.fn(async () => "watching"));
vi.mock("#modules/clash-of-code/services/watcher.js", () => ({
  default: { watch },
}));

import listener from "./message-create.listener.js";

const HANDLE = "a".repeat(40);
const LINK = `https://www.codingame.com/clashofcode/clash/${HANDLE}`;

function message(overrides: Record<string, any> = {}) {
  return {
    content: `go ${LINK}`,
    author: { bot: false },
    guildId: "guild-1",
    channelId: "chan-1",
    channel: { isThread: () => false, parentId: null },
    inGuild: () => true,
    ...overrides,
  };
}

function config(channels: string[] = []) {
  return makeTestConfig("clash-of-code", clashOfCodeConfigSchema, {
    channels: channels.map((id) => ({ id })),
  } as never);
}

async function run(msg = message(), cfg = config()) {
  await listener.execute(msg as never, cfg);
}

beforeEach(() => {
  silenceLogs();
  watch.mockClear();
});

describe("message-create listener", () => {
  it("watches a posted clash in any channel by default", async () => {
    await run();
    expect(watch).toHaveBeenCalledWith(expect.anything(), HANDLE);
  });

  it("ignores bots and messages without a link", async () => {
    await run(message({ author: { bot: true } }));
    await run(message({ content: "no link here" }));
    expect(watch).not.toHaveBeenCalled();
  });

  it("only follows the configured channels and their threads", async () => {
    await run(message({ channelId: "chan-2" }), config(["chan-1"]));
    expect(watch).not.toHaveBeenCalled();

    await run(message(), config(["chan-1"]));
    await run(
      message({
        channelId: "thread-1",
        channel: { isThread: () => true, parentId: "chan-1" },
      }),
      config(["chan-1"])
    );
    expect(watch).toHaveBeenCalledTimes(2);
  });

  it("keeps going when one watch fails", async () => {
    watch.mockRejectedValueOnce(new Error("db down"));
    await run(
      message({ content: `${LINK} ${LINK.replace(HANDLE, "b".repeat(40))}` })
    );
    expect(watch).toHaveBeenCalledTimes(2);
  });
});
