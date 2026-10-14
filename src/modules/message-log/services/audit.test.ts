import { Collection, PermissionFlagsBits, type Guild } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { findDeleter } from "./audit.js";

const now = Date.parse("2026-10-14T20:00:00Z");

function fakeGuild(
  entries: {
    targetId: string;
    channelId: string;
    executorId: string;
    ageMs: number;
  }[],
  canViewAuditLog = true
) {
  const fetchAuditLogs = vi.fn(async () => ({
    entries: new Collection(
      entries.map((entry, index) => [
        String(index),
        {
          targetId: entry.targetId,
          executorId: entry.executorId,
          extra: { channel: { id: entry.channelId } },
          createdTimestamp: now - entry.ageMs,
        },
      ])
    ),
  }));
  const guild = {
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
  return { guild, fetchAuditLogs };
}

const options = { delayMs: 0, now: () => now };

describe("findDeleter", () => {
  it("returns the moderator of a fresh matching entry", async () => {
    const { guild } = fakeGuild([
      { targetId: "42", channelId: "200", executorId: "7", ageMs: 1000 },
    ]);
    expect(await findDeleter(guild, "42", "200", options)).toBe("7");
  });

  it("ignores entries for another author, another channel or too old", async () => {
    const { guild } = fakeGuild([
      { targetId: "43", channelId: "200", executorId: "7", ageMs: 1000 },
      { targetId: "42", channelId: "201", executorId: "7", ageMs: 1000 },
      { targetId: "42", channelId: "200", executorId: "7", ageMs: 60_000 },
    ]);
    expect(await findDeleter(guild, "42", "200", options)).toBeNull();
  });

  it("does not read the audit log without the permission", async () => {
    const { guild, fetchAuditLogs } = fakeGuild([], false);
    expect(await findDeleter(guild, "42", "200", options)).toBeNull();
    expect(fetchAuditLogs).not.toHaveBeenCalled();
  });
});
