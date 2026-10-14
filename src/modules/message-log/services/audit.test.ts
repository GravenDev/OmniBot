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

function finder() {
  return new DeleterFinder({ delayMs: 0, now: () => now }).find;
}

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

  it("does not read the audit log without the permission", async () => {
    const { guild, fetchAuditLogs } = fakeGuild([], false);
    expect(await finder()(guild, "42", "200")).toBeNull();
    expect(fetchAuditLogs).not.toHaveBeenCalled();
  });
});
