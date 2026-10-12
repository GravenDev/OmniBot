import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  fetchUserRolls: vi.fn(),
  account: vi.fn(),
  accountByUsername: vi.fn(),
  register: vi.fn(),
  saveRolls: vi.fn(),
}));

vi.mock("#lib/logger.js", () => {
  const logger = { info: vi.fn(), warn: vi.fn() };
  return { loggerMaker: () => logger };
});
vi.mock("./api.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api.js")>()),
  fetchUserRolls: mocks.fetchUserRolls,
}));
vi.mock("./store.js", () => ({
  default: {
    account: mocks.account,
    accountByUsername: mocks.accountByUsername,
    register: mocks.register,
    saveRolls: mocks.saveRolls,
  },
}));
vi.mock("./sync.js", () => ({
  default: {
    exclusive: async (_guildId: string, task: () => Promise<unknown>) => {
      mocks.order.push("queue");
      return task();
    },
  },
}));

import { RngdleApiError, RngdleUserNotFoundError } from "./api.js";
import { linkAccount, linkOwnAccount } from "./linking.js";

const ROLLS = [{ number: 1 }, { number: 2 }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.length = 0;
  mocks.fetchUserRolls.mockImplementation(async () => {
    mocks.order.push("fetch");
    return ROLLS;
  });
  mocks.account.mockResolvedValue(null);
  mocks.accountByUsername.mockResolvedValue(null);
  mocks.register.mockResolvedValue("created");
  mocks.saveRolls.mockResolvedValue({ inserted: 2, updated: 0 });
});

describe("linkAccount", () => {
  it("fetches the rolls outside the queue, then registers and imports them", async () => {
    await expect(linkAccount("guild", "user", "Alice")).resolves.toEqual({
      kind: "created",
      count: 2,
    });
    expect(mocks.order).toEqual(["fetch", "queue"]);
    expect(mocks.fetchUserRolls).toHaveBeenCalledWith("Alice", null);
    expect(mocks.register).toHaveBeenCalledWith("guild", "user", "Alice");
    expect(mocks.saveRolls).toHaveBeenCalledWith(
      { guildId: "guild", userId: "user", username: "Alice" },
      ROLLS
    );
  });

  it.each(["renamed", "unchanged"] as const)(
    "reports a %s account",
    async (kind) => {
      mocks.register.mockResolvedValue(kind);
      await expect(linkAccount("guild", "user", "Alice")).resolves.toEqual({
        kind,
        count: 2,
      });
    }
  );

  it("reports an unknown username without touching the store", async () => {
    mocks.fetchUserRolls.mockRejectedValue(new RngdleUserNotFoundError("x"));
    await expect(linkAccount("guild", "user", "Nobody")).resolves.toEqual({
      kind: "notFound",
    });
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("reports an unreachable rngdle.com", async () => {
    mocks.fetchUserRolls.mockRejectedValue(new RngdleApiError("down"));
    await expect(linkAccount("guild", "user", "Alice")).resolves.toEqual({
      kind: "unreachable",
    });
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("refuses a username already linked to another member", async () => {
    mocks.accountByUsername.mockResolvedValue({
      guildId: "guild",
      userId: "other",
      username: "alice",
    });
    await expect(linkAccount("guild", "user", "Alice")).resolves.toEqual({
      kind: "conflict",
      userId: "other",
    });
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("replaces the member's previous username", async () => {
    mocks.account.mockResolvedValue({
      guildId: "guild",
      userId: "user",
      username: "Old",
    });
    mocks.register.mockResolvedValue("renamed");
    await expect(linkAccount("guild", "user", "Alice")).resolves.toEqual({
      kind: "renamed",
      count: 2,
    });
  });
});

describe("linkOwnAccount", () => {
  it("refuses to replace another username before calling rngdle.com", async () => {
    mocks.account.mockResolvedValue({
      guildId: "guild",
      userId: "user",
      username: "Old",
    });
    await expect(linkOwnAccount("guild", "user", "Alice")).resolves.toEqual({
      kind: "alreadyLinked",
      username: "Old",
    });
    expect(mocks.fetchUserRolls).not.toHaveBeenCalled();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("refuses when another link lands while rngdle.com answers", async () => {
    mocks.account.mockResolvedValueOnce(null).mockResolvedValueOnce({
      guildId: "guild",
      userId: "user",
      username: "Old",
    });
    await expect(linkOwnAccount("guild", "user", "Alice")).resolves.toEqual({
      kind: "alreadyLinked",
      username: "Old",
    });
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("goes through when the member is already linked to the same username", async () => {
    mocks.account.mockResolvedValue({
      guildId: "guild",
      userId: "user",
      username: "alice",
    });
    mocks.register.mockResolvedValue("unchanged");
    await expect(linkOwnAccount("guild", "user", "Alice")).resolves.toEqual({
      kind: "unchanged",
      count: 2,
    });
  });

  it("keeps the stored spelling when the same username is typed in another case", async () => {
    mocks.account.mockResolvedValue({
      guildId: "guild",
      userId: "user",
      username: "alice",
    });
    mocks.register.mockImplementation(
      async (_guildId: string, _userId: string, username: string) =>
        username === "alice" ? "unchanged" : "renamed"
    );
    await expect(linkOwnAccount("guild", "user", "ALICE")).resolves.toEqual({
      kind: "unchanged",
      count: 2,
    });
    expect(mocks.fetchUserRolls).toHaveBeenCalledWith("alice", null);
    expect(mocks.register).toHaveBeenCalledWith("guild", "user", "alice");
    expect(mocks.saveRolls).toHaveBeenCalledWith(
      { guildId: "guild", userId: "user", username: "alice" },
      ROLLS
    );
  });

  it("links a member who has no account yet", async () => {
    await expect(linkOwnAccount("guild", "user", "Alice")).resolves.toEqual({
      kind: "created",
      count: 2,
    });
  });
});
