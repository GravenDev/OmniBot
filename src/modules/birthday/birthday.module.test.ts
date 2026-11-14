import { type Client, GatewayIntentBits, type Guild } from "discord.js";
import { describe, expect, it, vi } from "vitest";

const clearGuild = vi.hoisted(() => vi.fn(async (_guildId: string) => {}));
vi.mock("#modules/birthday/services/birthday.service.js", () => ({
  default: { clearGuild },
}));

const { default: birthdayModule } = await import("./birthday.module.js");

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
    clearGuild.mockRejectedValueOnce(new Error("database is down"));

    await expect(
      birthdayModule.onUninstall?.(
        {} as Client,
        { id: "guild-1" } as Guild,
        birthdayModule.registry
      )
    ).rejects.toThrow("database is down");
  });
});
