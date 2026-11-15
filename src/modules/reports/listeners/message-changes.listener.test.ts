import { Collection } from "discord.js";
import { describe, expect, it, vi } from "vitest";

vi.mock("#lib/database.js", () => ({ default: {}, Prisma: {} }));

const messagesDeleted = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../services/report.service.js", () => ({
  default: { messagesDeleted },
}));

const { messageDeleteBulkListener } =
  await import("./message-changes.listener.js");

describe("bulk deletions", () => {
  it("hands every deleted message to the service at once", async () => {
    const config = {} as never;
    const messages = new Collection(
      ["m1", "m2"].map((id) => [id, { id }] as const)
    );

    await messageDeleteBulkListener.execute(
      messages as never,
      { guildId: "g1", client: {} } as never,
      config
    );

    expect(messagesDeleted).toHaveBeenCalledWith({}, config, "g1", [
      "m1",
      "m2",
    ]);
  });
});
