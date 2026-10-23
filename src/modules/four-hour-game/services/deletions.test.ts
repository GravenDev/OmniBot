import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handleDeletion: vi.fn(),
  fetchStandingMessage: vi.fn(),
  error: vi.fn(),
}));

vi.mock("#lib/logger.js", () => ({
  loggerMaker: () => ({ error: mocks.error }),
}));
vi.mock("./four-hour-game.service.js", () => ({
  default: { handleDeletion: mocks.handleDeletion },
}));
vi.mock("./channel-history.js", () => ({
  fetchStandingMessage: mocks.fetchStandingMessage,
}));

const { handleGameDeletions } = await import("./deletions.js");

const gameChannel = { id: "game", isTextBased: () => true };
const configWith = (channel: unknown) =>
  ({ get: () => channel }) as unknown as Parameters<
    typeof handleGameDeletions
  >[0];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handleDeletion.mockResolvedValue(true);
});

describe("handleGameDeletions", () => {
  it("hands the deleted ids of the game channel to the service", async () => {
    await handleGameDeletions(configWith(gameChannel), "guild", "game", [
      "1",
      "2",
    ]);

    expect(mocks.handleDeletion).toHaveBeenCalledWith(
      "guild",
      "game",
      ["1", "2"],
      expect.any(Function)
    );
    const fetchLatest = mocks.handleDeletion.mock.calls[0]![3] as () => unknown;
    await fetchLatest();
    expect(mocks.fetchStandingMessage).toHaveBeenCalledWith(gameChannel);
  });

  it.each([
    ["the module is disabled", undefined, "game"],
    ["no game channel is set", configWith(null), "game"],
    ["the deletion is in another channel", configWith(gameChannel), "other"],
    [
      "the game channel is not text-based",
      configWith({ id: "game", isTextBased: () => false }),
      "game",
    ],
  ])("ignores the deletion when %s", async (_, config, channelId) => {
    await handleGameDeletions(
      config as Parameters<typeof handleGameDeletions>[0],
      "guild",
      channelId,
      ["1"]
    );
    expect(mocks.handleDeletion).not.toHaveBeenCalled();
  });

  it("logs a failure instead of throwing", async () => {
    mocks.handleDeletion.mockRejectedValue(new Error("database down"));

    await expect(
      handleGameDeletions(configWith(gameChannel), "guild", "game", ["1"])
    ).resolves.toBeUndefined();
    expect(mocks.error).toHaveBeenCalledTimes(1);
  });
});
