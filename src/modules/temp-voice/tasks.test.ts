import type { Client } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";
import { silenceLogs } from "#lib/testing.js";
import type { TempVoiceConfigSchema } from "./temp-voice.config.js";

const mocks = vi.hoisted(() => ({
  activated: vi.fn(),
  guildIds: vi.fn(),
  removeGuildChannels: vi.fn(),
  reconcile: vi.fn(),
  seatWaitingMembers: vi.fn(),
}));
vi.mock("#core/services/module.service.js", () => ({
  default: { getActivatedGuildIds: mocks.activated },
}));
vi.mock("#core/services/config.service.js", () => ({
  default: { getConfigForModuleIn: async () => ({ t: () => "" }) },
}));
vi.mock("./services/store.service.js", () => ({
  default: {
    guildIds: mocks.guildIds,
    removeGuildChannels: mocks.removeGuildChannels,
  },
}));
vi.mock("./services/lifecycle.service.js", () => ({
  reconcile: mocks.reconcile,
  seatWaitingMembers: mocks.seatWaitingMembers,
}));

const { tempVoiceTasks } = await import("./tasks.js");

silenceLogs();

const module = { id: "temp-voice" } as Module<TempVoiceConfigSchema>;

function clientWith(...guildIds: string[]): Client<true> {
  const guilds = new Map(
    guildIds.map((id) => [id, { id, available: true }] as const)
  );
  return { guilds: { cache: guilds } } as unknown as Client<true>;
}

const run = (client: Client<true>) => tempVoiceTasks(module)[0]!.run(client);

describe("reconcile task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activated.mockResolvedValue([]);
    mocks.guildIds.mockResolvedValue([]);
    mocks.removeGuildChannels.mockResolvedValue(0);
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.seatWaitingMembers.mockResolvedValue(undefined);
  });

  it("still reconciles the other guilds when forgetting a left guild fails", async () => {
    mocks.guildIds.mockResolvedValue(["left", "here"]);
    mocks.removeGuildChannels.mockRejectedValue(new Error("database down"));

    await expect(run(clientWith("here"))).resolves.toBeUndefined();

    expect(mocks.reconcile).toHaveBeenCalledWith(
      expect.objectContaining({ id: "here" }),
      undefined
    );
  });

  it("forgets the channels of every left guild in one query", async () => {
    mocks.guildIds.mockResolvedValue(["left", "gone", "here"]);

    await run(clientWith("here"));

    expect(mocks.removeGuildChannels).toHaveBeenCalledTimes(1);
    expect(mocks.removeGuildChannels).toHaveBeenCalledWith(["left", "gone"]);
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
  });

  it("forgets only left guilds that still have channel rows", async () => {
    mocks.activated.mockResolvedValue(["activated-left", "here"]);
    mocks.guildIds.mockResolvedValue(["rows-left"]);

    await run(clientWith("here"));

    expect(mocks.removeGuildChannels).toHaveBeenCalledWith(["rows-left"]);
  });

  it("sends no deletion when no left guild has channel rows", async () => {
    mocks.activated.mockResolvedValue(["activated-left", "here"]);

    await run(clientWith("here"));

    expect(mocks.removeGuildChannels).not.toHaveBeenCalled();
  });

  it("reconciles a few guilds at once, never all of them together", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `g${i}`);
    mocks.guildIds.mockResolvedValue(ids);
    let running = 0;
    let most = 0;
    mocks.reconcile.mockImplementation(async () => {
      most = Math.max(most, ++running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
    });

    await run(clientWith(...ids));

    expect(mocks.reconcile).toHaveBeenCalledTimes(10);
    expect(most).toBeGreaterThan(1);
    expect(most).toBeLessThan(10);
  });

  it("reconciles the guilds together, a slow one holding none back", async () => {
    mocks.activated.mockResolvedValue(["slow", "fast"]);
    let release!: () => void;
    mocks.reconcile.mockImplementation(async (guild: { id: string }) => {
      if (guild.id === "slow") {
        await new Promise<void>((resolve) => (release = resolve));
      }
    });

    const done = run(clientWith("slow", "fast"));
    await vi.waitFor(() => expect(mocks.seatWaitingMembers).toHaveBeenCalled());

    expect(mocks.seatWaitingMembers).toHaveBeenCalledWith(
      expect.objectContaining({ id: "fast" }),
      expect.anything()
    );
    release();
    await done;
    expect(mocks.seatWaitingMembers).toHaveBeenCalledTimes(2);
  });
});
