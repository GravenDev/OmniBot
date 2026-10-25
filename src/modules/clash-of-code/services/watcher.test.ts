import { MessageFlags } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { silenceLogs } from "#lib/testing.js";
import type { ClashReport } from "./api.js";

const mocks = vi.hoisted(() => ({
  fetchClashReport: vi.fn(),
  store: {
    isKnown: vi.fn(),
    watch: vi.fn(),
    watchedGames: vi.fn(),
    abandon: vi.fn(),
    importReport: vi.fn(),
  },
  activated: vi.fn(),
  activatedGuildIds: vi.fn(),
}));

vi.mock("./api.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api.js")>()),
  fetchClashReport: mocks.fetchClashReport,
}));
vi.mock("./store.js", () => ({ default: mocks.store }));
vi.mock("./views.js", () => ({
  resultImage: vi.fn(async () => Buffer.from("png")),
  modeLabel: (_t: unknown, mode: string | null) => mode ?? "?",
}));
vi.mock("#core/services/module.service.js", () => ({
  default: {
    getModuleStateFromGuildIdIn: async () => ({
      activated: mocks.activated(),
    }),
    getActivatedGuildIds: mocks.activatedGuildIds,
  },
}));
vi.mock("#core/services/config.service.js", () => ({
  default: {
    getConfigForModuleIn: async () => ({
      t: (key: string, vars?: Record<string, unknown>) =>
        `${key} ${JSON.stringify(vars ?? {})}`,
    }),
  },
}));

import { ClashNotFoundError } from "./api.js";
import watcher, {
  LOBBY_INTERVAL_MS,
  MAX_FAILURES,
  POLL_INTERVAL_MS,
  WATCH_DURATION_MS,
} from "./watcher.js";

const HANDLE = "a".repeat(40);

function report(overrides: Partial<ClashReport> = {}): ClashReport {
  return {
    handle: HANDLE,
    mode: "FASTEST",
    startedAt: new Date(0),
    started: true,
    finished: true,
    players: [
      {
        codingamerId: 1,
        nickname: "Ada_*",
        avatarId: null,
        rank: 1,
        score: 100,
        durationMs: 1,
        criterion: null,
        language: null,
      },
    ],
    ...overrides,
  };
}

const send = vi.fn(async () => ({}));
const removeReaction = vi.fn(async () => undefined);
const client = {
  user: { id: "bot" },
  channels: {
    fetch: vi.fn(async () => ({
      isSendable: () => true,
      send,
      messages: {
        fetch: async () => ({
          reactions: { resolve: () => ({ users: { remove: removeReaction } }) },
        }),
      },
    })),
  },
};

function linkMessage() {
  return {
    guildId: "guild-1",
    channelId: "chan-1",
    id: "msg-1",
    react: vi.fn(async () => undefined),
  };
}

async function watch(message = linkMessage()) {
  return watcher.watch(message as never, HANDLE);
}

beforeEach(() => {
  silenceLogs();
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.store.isKnown.mockResolvedValue(false);
  mocks.store.watch.mockResolvedValue("watching");
  mocks.store.abandon.mockResolvedValue(true);
  mocks.store.importReport.mockResolvedValue(true);
  mocks.store.watchedGames.mockResolvedValue([]);
  mocks.activated.mockReturnValue(true);
  mocks.activatedGuildIds.mockResolvedValue(["guild-1"]);
  watcher.attach(client as never, { id: "clash-of-code" } as never);
});

afterEach(() => {
  watcher.stopAll();
  vi.useRealTimers();
});

describe("watch", () => {
  it("ignores a game already over when its link is posted", async () => {
    mocks.fetchClashReport.mockResolvedValue(report());
    const message = linkMessage();
    await expect(watch(message)).resolves.toBe("finished");
    await vi.advanceTimersByTimeAsync(LOBBY_INTERVAL_MS);
    expect(mocks.store.watch).not.toHaveBeenCalled();
    expect(message.react).not.toHaveBeenCalled();
    expect(mocks.store.importReport).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("follows a game in progress and posts its result at the end", async () => {
    mocks.fetchClashReport
      .mockResolvedValueOnce(report({ finished: false }))
      .mockResolvedValueOnce(report());
    const message = linkMessage();
    await expect(watch(message)).resolves.toBe("watching");
    expect(message.react).toHaveBeenCalledWith("⏳");

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(mocks.store.importReport).toHaveBeenCalledWith(
      "guild-1",
      expect.objectContaining({ handle: HANDLE }),
      { channelId: "chan-1", messageId: "msg-1" }
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedMentions: { parse: [] },
        flags: MessageFlags.SuppressNotifications,
        reply: { messageReference: "msg-1", failIfNotExists: false },
        content: expect.stringContaining("Ada\\\\_\\\\*"),
      })
    );
    expect(removeReaction).toHaveBeenCalledWith("bot");
  });

  it("does nothing for a game the guild already knows", async () => {
    mocks.store.isKnown.mockResolvedValue(true);
    const message = linkMessage();
    await expect(watch(message)).resolves.toBe("known");
    await vi.advanceTimersByTimeAsync(LOBBY_INTERVAL_MS);
    expect(message.react).not.toHaveBeenCalled();
    expect(mocks.fetchClashReport).not.toHaveBeenCalled();
  });

  it("polls slowly in the lobby, faster once started, until the end", async () => {
    mocks.fetchClashReport
      .mockResolvedValueOnce(report({ started: false, finished: false }))
      .mockResolvedValueOnce(report({ finished: false }))
      .mockResolvedValueOnce(report());
    await watch();
    expect(mocks.fetchClashReport).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(LOBBY_INTERVAL_MS - 1);
    expect(mocks.fetchClashReport).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.fetchClashReport).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(mocks.fetchClashReport).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenCalledOnce();
  });

  it("drops a game that ended without starting", async () => {
    mocks.fetchClashReport
      .mockResolvedValueOnce(report({ started: false, finished: false }))
      .mockResolvedValueOnce(report({ started: false }));
    await watch();
    await vi.advanceTimersByTimeAsync(LOBBY_INTERVAL_MS);
    expect(mocks.store.abandon).toHaveBeenCalledWith("guild-1", HANDLE);
    expect(mocks.store.importReport).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(removeReaction).toHaveBeenCalled();
  });

  it("ignores a game CodinGame does not know", async () => {
    mocks.fetchClashReport.mockRejectedValue(new ClashNotFoundError(HANDLE));
    const message = linkMessage();
    await expect(watch(message)).resolves.toBe("unknown");
    expect(mocks.store.watch).not.toHaveBeenCalled();
    expect(message.react).not.toHaveBeenCalled();
  });

  it("follows the game when CodinGame is down, and gives up after too many failures", async () => {
    mocks.fetchClashReport.mockRejectedValue(new Error("down"));
    await expect(watch()).resolves.toBe("watching");
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * MAX_FAILURES);
    expect(mocks.fetchClashReport).toHaveBeenCalledTimes(1 + MAX_FAILURES);
    expect(mocks.store.abandon).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    expect(mocks.fetchClashReport).toHaveBeenCalledTimes(1 + MAX_FAILURES);
  });

  it("stops watching a game that outlasts the watch", async () => {
    mocks.fetchClashReport.mockResolvedValue(report({ finished: false }));
    await watch();
    await vi.advanceTimersByTimeAsync(WATCH_DURATION_MS + POLL_INTERVAL_MS);
    expect(mocks.store.abandon).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });

  it("posts nothing when the game was imported meanwhile", async () => {
    mocks.fetchClashReport
      .mockResolvedValueOnce(report({ finished: false }))
      .mockResolvedValue(report());
    mocks.store.importReport.mockResolvedValue(false);
    await watch();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(send).not.toHaveBeenCalled();
    expect(removeReaction).toHaveBeenCalled();
  });

  it("drops the game when the module was disabled meanwhile", async () => {
    mocks.fetchClashReport
      .mockResolvedValueOnce(report({ finished: false }))
      .mockResolvedValue(report());
    mocks.activated.mockReturnValue(false);
    await watch();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(mocks.store.importReport).not.toHaveBeenCalled();
    expect(mocks.store.abandon).toHaveBeenCalledOnce();
  });
});

describe("resume", () => {
  it("picks up the watched games of active guilds after a restart", async () => {
    mocks.fetchClashReport.mockResolvedValue(report());
    mocks.store.watchedGames.mockResolvedValue([
      {
        guildId: "guild-1",
        handle: HANDLE,
        channelId: "chan-1",
        messageId: "msg-1",
        watchUntil: new Date(Date.now() + WATCH_DURATION_MS),
      },
    ]);
    await expect(watcher.resume()).resolves.toBe(1);
    expect(mocks.store.watchedGames).toHaveBeenCalledWith(["guild-1"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledOnce();
  });

  it("does not schedule a game twice", async () => {
    mocks.fetchClashReport.mockResolvedValue(report({ finished: false }));
    await watch();
    mocks.store.watchedGames.mockResolvedValue([
      {
        guildId: "guild-1",
        handle: HANDLE,
        channelId: "chan-1",
        messageId: "msg-1",
        watchUntil: new Date(Date.now() + WATCH_DURATION_MS),
      },
    ]);
    await expect(watcher.resume()).resolves.toBe(0);
  });
});
