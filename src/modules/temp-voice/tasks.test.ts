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
vi.mock("./services/store.js", () => ({
  default: {
    guildIds: mocks.guildIds,
    removeGuildChannels: mocks.removeGuildChannels,
  },
}));
vi.mock("./services/lifecycle.js", () => ({
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
});
