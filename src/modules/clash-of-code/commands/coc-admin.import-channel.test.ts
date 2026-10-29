import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initTestI18n, makeTestConfig, silenceLogs } from "#lib/testing.js";
import { clashOfCodeConfigSchema } from "#modules/clash-of-code/clash-of-code.config.js";
import en from "#modules/clash-of-code/i18n/en.json" with { type: "json" };
import type { ImportSummary } from "#modules/clash-of-code/services/channel-import.js";
import type { SearchState } from "#modules/clash-of-code/services/history.js";

const mocks = vi.hoisted(() => ({
  searchChannelClashes: vi.fn(),
  importClashes: vi.fn(),
}));
vi.mock(
  "#modules/clash-of-code/services/history.js",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("#modules/clash-of-code/services/history.js")
    >()),
    searchChannelClashes: mocks.searchChannelClashes,
  })
);
vi.mock(
  "#modules/clash-of-code/services/channel-import.js",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("#modules/clash-of-code/services/channel-import.js")
    >()),
    importClashes: mocks.importClashes,
  })
);

const { default: command } = await import("./coc-admin.command.js");

const config = makeTestConfig("clash-of-code", clashOfCodeConfigSchema);

beforeAll(async () => {
  silenceLogs();
  await initTestI18n("clash-of-code", { en });
});

beforeEach(() => {
  vi.clearAllMocks();
});

function interaction(guildId: string) {
  const editReply = vi.fn(async (_reply: { content: string }) => ({}));
  return {
    guildId,
    createdTimestamp: Date.now(),
    user: { id: "admin" },
    client: { rest: {} },
    inGuild: () => true,
    options: {
      getSubcommand: () => "import-channel",
      getChannel: () => ({ id: "chan" }),
    },
    deferReply: vi.fn(async () => {}),
    reply: vi.fn(async () => {}),
    editReply,
    lastReply: () => editReply.mock.calls.at(-1)![0].content,
  };
}

async function run(guildId: string) {
  const fake = interaction(guildId);
  await command.execute(fake as never, config);
  return fake;
}

const clash = (handle: string) => ({
  handle,
  channelId: "chan",
  messageId: `m-${handle}`,
});

// A search that finds `handles`, then ends or stops at its deadline.
function searchFinds(handles: string[], complete: boolean) {
  mocks.searchChannelClashes.mockImplementationOnce(
    async (_rest, _guild, _channel, state: SearchState) => {
      for (const handle of handles) state.found.set(handle, clash(handle));
      state.messages += handles.length;
      state.after = `m-${handles.at(-1)}`;
      return complete;
    }
  );
}

// An import that checks the first `count` games it is given.
function importChecks(count: number, stopped: ImportSummary["stopped"]) {
  mocks.importClashes.mockImplementationOnce(
    async (
      _guild,
      clashes: { handle: string }[],
      { checked }: { checked: Set<string> }
    ) => {
      const done = clashes.slice(0, count);
      for (const { handle } of done) checked.add(handle);
      return {
        found: clashes.length,
        done: done.length,
        imported: done.length,
        known: 0,
        unfinished: 0,
        unknown: 0,
        failed: 0,
        stopped,
        pausedUntil: null,
      } satisfies ImportSummary;
    }
  );
}

describe("/coc-admin import-channel", () => {
  it("resumes a search stopped by its deadline from where it stood", async () => {
    searchFinds(["a"], false);
    const first = await run("g-search");
    expect(first.lastReply()).toContain("Search in <#chan> stopped");
    expect(first.lastReply()).toContain("1 game found");
    expect(mocks.importClashes).not.toHaveBeenCalled();

    searchFinds(["b"], true);
    importChecks(2, null);
    await run("g-search");
    const [, , , state] = mocks.searchChannelClashes.mock.calls[1]!;
    expect(state.after).toBe("m-b");
    expect([...state.found.keys()]).toEqual(["a", "b"]);
  });

  it("leaves out the games checked by a stopped run, then forgets it once done", async () => {
    searchFinds(["a", "b", "c"], true);
    importChecks(2, "time");
    const first = await run("g-import");
    expect(first.lastReply()).toContain("1 game left to check");

    importChecks(1, null);
    const second = await run("g-import");
    expect(mocks.searchChannelClashes).toHaveBeenCalledOnce();
    expect(mocks.importClashes.mock.calls[1]![1]).toEqual([clash("c")]);
    expect(second.lastReply()).toContain("Games found: 3");
    expect(second.lastReply()).toContain("checked by an earlier import: 2");

    searchFinds(["a", "b", "c"], true);
    importChecks(3, null);
    await run("g-import");
    expect(mocks.searchChannelClashes).toHaveBeenCalledTimes(2);
    expect(mocks.importClashes.mock.calls[2]![1]).toHaveLength(3);
  });

  it("says how many games are left, in the plural", async () => {
    searchFinds(["a", "b", "c"], true);
    importChecks(1, "rateLimit");
    const reply = (await run("g-plural")).lastReply();
    expect(reply).toContain("2 games are left to check");
    expect(reply).toContain("more than 5 minutes");
  });
});
