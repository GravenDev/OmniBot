import { GatewayIntentBits } from "discord.js";
import { describe, expect, it, vi } from "vitest";

vi.mock("#modules/birthday/services/birthday.service.js", () => ({
  default: {},
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
