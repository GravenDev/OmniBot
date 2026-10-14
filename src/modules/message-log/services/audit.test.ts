import { Collection, PermissionFlagsBits, type Guild } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { DeleterFinder } from "./audit.js";

const now = Date.parse("2026-10-14T20:00:00Z");

interface FakeEntry {
  id?: string;
  targetId: string;
  channelId: string;
  executorId: string;
  ageMs: number;
  count?: number;
}

function fakeGuild(initial: FakeEntry[], canViewAuditLog = true) {
  let entries = initial;
  const fetchAuditLogs = vi.fn(async () => ({
    entries: new Collection(
      entries.map((entry, index) => [
        entry.id ?? String(index),
        {
          id: entry.id ?? String(index),
          targetId: entry.targetId,
          executorId: entry.executorId,
          extra: { channel: { id: entry.channelId }, count: entry.count ?? 1 },
          createdTimestamp: now - entry.ageMs,
        },
      ])
    ),
  }));
  const guild = {
    id: "100",
    members: {
      me: {
        permissions: {
          has: (permission: bigint) =>
            canViewAuditLog && permission === PermissionFlagsBits.ViewAuditLog,
        },
      },
    },
    fetchAuditLogs,
  } as unknown as Guild;
  return {
    guild,
    fetchAuditLogs,
    setEntries: (next: FakeEntry[]) => {
      entries = next;
    },
  };
}

let clock = now;

function finder() {
  clock = now;
  return new DeleterFinder({ delayMs: 0, now: () => clock }).find;
}

const entry = (count: number, ageMs = 1000) => ({
  id: "e",
  targetId: "42",
  channelId: "200",
  executorId: "7",
  ageMs,
  count,
});

describe("DeleterFinder", () => {
  it("returns the moderator of a fresh matching entry", async () => {
    const { guild } = fakeGuild([
      { targetId: "42", channelId: "200", executorId: "7", ageMs: 1000 },
    ]);
    expect(await finder()(guild, "42", "200")).toBe("7");
  });

  it("ignores entries for another author, another channel or too old", async () => {
    const { guild } = fakeGuild([
      { targetId: "43", channelId: "200", executorId: "7", ageMs: 1000 },
      { targetId: "42", channelId: "201", executorId: "7", ageMs: 1000 },
      { targetId: "42", channelId: "200", executorId: "7", ageMs: 60_000 },
    ]);
    expect(await finder()(guild, "42", "200")).toBeNull();
  });

  it("does not credit a moderator again for a self-deletion right after", async () => {
    const find = finder();
    const { guild } = fakeGuild([
      {
        id: "e",
        targetId: "42",
        channelId: "200",
        executorId: "7",
        ageMs: 1000,
      },
    ]);
    expect(await find(guild, "42", "200")).toBe("7");
    expect(await find(guild, "42", "200")).toBeNull();
  });

  it("credits a moderator whose existing entry was incremented", async () => {
    const find = finder();
    const { guild, setEntries } = fakeGuild([
      {
        id: "e",
        targetId: "42",
        channelId: "200",
        executorId: "7",
        ageMs: 1000,
      },
    ]);
    expect(await find(guild, "42", "200")).toBe("7");
    setEntries([
      {
        id: "e",
        targetId: "42",
        channelId: "200",
        executorId: "7",
        ageMs: 60_000,
        count: 2,
      },
    ]);
    expect(await find(guild, "42", "200")).toBe("7");
  });

  it("credits each of several deletions read from one merged entry", async () => {
    const find = finder();
    const { guild } = fakeGuild([entry(2)]);
    expect(await find(guild, "42", "200")).toBe("7");
    expect(await find(guild, "42", "200")).toBe("7");
    expect(await find(guild, "42", "200")).toBeNull();
  });

  it("consumes one increment per deletion of a known entry", async () => {
    const find = finder();
    const { guild, setEntries } = fakeGuild([entry(1)]);
    expect(await find(guild, "42", "200")).toBe("7");
    setEntries([entry(3)]);
    expect(await find(guild, "42", "200")).toBe("7");
    expect(await find(guild, "42", "200")).toBe("7");
    expect(await find(guild, "42", "200")).toBeNull();
  });

  it("uses an old entry seen for the first time as a baseline", async () => {
    const find = finder();
    const { guild, setEntries } = fakeGuild([entry(4, 60_000)]);
    expect(await find(guild, "42", "200")).toBeNull();
    setEntries([entry(5, 60_000)]);
    expect(await find(guild, "42", "200")).toBe("7");
  });

  it("forgets an entry after a while instead of crediting a stale increment", async () => {
    const find = finder();
    const { guild, setEntries } = fakeGuild([entry(1)]);
    expect(await find(guild, "42", "200")).toBe("7");
    clock = now + 6 * 60_000;
    setEntries([entry(2, 6 * 60_000)]);
    expect(await find(guild, "42", "200")).toBeNull();
  });

  it("waits once per burst instead of once per deletion", async () => {
    vi.useFakeTimers({ now });
    try {
      const find = new DeleterFinder({ delayMs: 1500 }).find;
      const { guild } = fakeGuild([]);
      let done = 0;
      for (let i = 0; i < 5; i++) {
        void find(guild, "42", "200").then(() => done++);
      }
      await vi.advanceTimersByTimeAsync(1501);
      expect(done).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not read the audit log without the permission", async () => {
    const { guild, fetchAuditLogs } = fakeGuild([], false);
    expect(await finder()(guild, "42", "200")).toBeNull();
    expect(fetchAuditLogs).not.toHaveBeenCalled();
  });
});
