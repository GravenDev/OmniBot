import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, deleteMany, upsert } = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("#lib/database.js", () => ({
  default: { mentionOptOut: { findMany, deleteMany, upsert } },
}));

const { default: mentionService } = await import("./mention.service.js");

describe("mentionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drops the opted-out members of the guild and keeps the order", async () => {
    findMany.mockResolvedValue([{ userId: "bob" }]);

    expect(
      await mentionService.mentionable("g1", ["carol", "bob", "alice"])
    ).toEqual(["carol", "alice"]);
    expect(findMany).toHaveBeenCalledWith({
      where: { guildId: "g1", userId: { in: ["carol", "bob", "alice"] } },
      select: { userId: true },
    });
  });

  it("skips the query when nobody is to be mentioned", async () => {
    expect(await mentionService.mentionable("g1", [])).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("adds the member to the guild's list when they opt out", async () => {
    await mentionService.setMentionable("g1", "bob", false);

    expect(upsert).toHaveBeenCalledWith({
      where: { guildId_userId: { guildId: "g1", userId: "bob" } },
      create: { guildId: "g1", userId: "bob" },
      update: {},
    });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("removes the member from the guild's list when they opt back in", async () => {
    await mentionService.setMentionable("g1", "bob", true);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { guildId: "g1", userId: "bob" },
    });
    expect(upsert).not.toHaveBeenCalled();
  });
});
