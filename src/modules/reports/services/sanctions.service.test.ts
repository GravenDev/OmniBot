import { describe, expect, it, vi } from "vitest";
import { MAX_BAN_PURGE_SECONDS } from "#lib/moderation.js";
import sanctions, { AUDIT_REASON_LIMIT } from "./sanctions.service.js";

function setup() {
  const guild = {
    bans: { create: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
  } as any;
  const member = {
    send: vi.fn(async () => {}),
    timeout: vi.fn(async () => {}),
    kick: vi.fn(async () => {}),
  } as any;
  return { guild, member };
}

const input = {
  reason: null,
  duration: 60,
  purgeSeconds: null,
  auditReason: "x".repeat(AUDIT_REASON_LIMIT + 10),
  warnMessage: "warned",
};
const audit = "x".repeat(AUDIT_REASON_LIMIT);

describe("SanctionsService.apply", () => {
  it("warns by DM, times out in milliseconds and kicks with a cut audit reason", async () => {
    const { guild, member } = setup();
    await sanctions.apply(guild, member, "u1", "warn", input);
    expect(member.send).toHaveBeenCalledWith("warned");
    await sanctions.apply(guild, member, "u1", "timeout", input);
    expect(member.timeout).toHaveBeenCalledWith(60_000, audit);
    await sanctions.apply(guild, member, "u1", "kick", input);
    expect(member.kick).toHaveBeenCalledWith(audit);
  });

  it("bans without purging messages unless asked", async () => {
    const { guild } = setup();
    await sanctions.apply(guild, null, "u1", "ban", input);
    expect(guild.bans.create).toHaveBeenCalledWith("u1", {
      reason: audit,
      deleteMessageSeconds: 0,
    });
    expect(guild.bans.remove).not.toHaveBeenCalled();
  });

  it("softbans: bans with the longest purge by default, then lifts the ban", async () => {
    const { guild } = setup();
    await sanctions.apply(guild, null, "u1", "softban", input);
    expect(guild.bans.create).toHaveBeenCalledWith("u1", {
      reason: audit,
      deleteMessageSeconds: MAX_BAN_PURGE_SECONDS,
    });
    expect(guild.bans.remove).toHaveBeenCalledWith("u1", audit);
  });
});
