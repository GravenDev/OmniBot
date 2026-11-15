import { type Client, GatewayIntentBits, type Guild } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  clearGuild: vi.fn(async (_guildId: string) => {}),
  remove: vi.fn(),
}));
vi.mock("#modules/birthday/services/birthday.service.js", () => ({
  default: service,
}));
const config = vi.hoisted(() => ({ get: vi.fn() }));
const getConfigForModuleIn = vi.hoisted(() => vi.fn(async () => config));
vi.mock("#core/services/config.service.js", () => ({
  default: { getConfigForModuleIn },
}));
const dropBirthdayRole = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("#modules/birthday/services/role.service.js", () => ({
  dropBirthdayRole,
}));

const { default: birthdayModule } = await import("./birthday.module.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("birthdayModule.intents", () => {
  it("declares the voice states, for the people of a voice channel", () => {
    expect(birthdayModule.intents).toContain(
      GatewayIntentBits.GuildVoiceStates
    );
    expect(birthdayModule.intents).toContain(GatewayIntentBits.GuildMembers);
  });
});

describe("birthdayModule.onUninstall", () => {
  // The installer awaits the hook before removing the commands: a failure
  // must reach it, so the module stays enabled with its birthdays.
  it("fails when the birthdays cannot be cleared", async () => {
    service.clearGuild.mockRejectedValueOnce(new Error("database is down"));

    await expect(
      birthdayModule.onUninstall?.(
        {} as Client,
        { id: "guild-1" } as Guild,
        birthdayModule.registry
      )
    ).rejects.toThrow("database is down");
  });
});

describe("birthdayModule.deleteMemberData", () => {
  it("takes the birthday role back with the birthday", async () => {
    service.remove.mockResolvedValue(true);

    await birthdayModule.deleteMemberData!("guild", "user");

    expect(service.remove).toHaveBeenCalledWith("guild", "user");
    expect(getConfigForModuleIn).toHaveBeenCalledWith(birthdayModule, "guild");
    expect(dropBirthdayRole).toHaveBeenCalledWith(config, "guild", "user");
  });

  it("reports the birthday deleted even when the role cannot be taken back", async () => {
    service.remove.mockResolvedValue(true);
    getConfigForModuleIn.mockRejectedValueOnce(new Error("database down"));

    await expect(
      birthdayModule.deleteMemberData!("guild", "user")
    ).resolves.toBeUndefined();
  });

  it("leaves the roles alone when there was no birthday", async () => {
    service.remove.mockResolvedValue(false);

    await birthdayModule.deleteMemberData!("guild", "user");

    expect(dropBirthdayRole).not.toHaveBeenCalled();
  });
});
