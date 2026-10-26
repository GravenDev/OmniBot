import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("#lib/database.js", () => ({
  default: { messageReport: { findMany } },
  Prisma: {},
}));

const { default: store } = await import("./store.js");

describe("report store expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([{ id: 1 }]);
  });

  it("finds the reports closed long enough or no longer reported", async () => {
    const closedBefore = new Date("2026-10-18T00:00:00Z");
    const reportedBefore = new Date("2026-09-25T00:00:00Z");

    expect(await store.expired("g1", closedBefore, reportedBefore)).toEqual([
      { id: 1 },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        guildId: "g1",
        OR: [
          { reporters: { none: { reportedAt: { gte: reportedBefore } } } },
          { status: { not: "open" }, handledAt: { lt: closedBefore } },
        ],
      },
      select: { id: true },
    });
  });
});
