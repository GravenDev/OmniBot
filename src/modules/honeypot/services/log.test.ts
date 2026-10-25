import type { Message } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initTestI18n, makeTestConfig } from "#lib/testing.js";
import { honeypotConfigSchema } from "#modules/honeypot/honeypot.config.js";
import en from "#modules/honeypot/i18n/en.json" with { type: "json" };

const audience = vi.hoisted(() => ({ widensAudience: vi.fn() }));
vi.mock("#lib/channel-audience.js", () => audience);

const { logTrap, trapLog } = await import("./log.js");

beforeAll(async () => {
  await initTestI18n("honeypot", { en });
});

beforeEach(() => {
  vi.clearAllMocks();
  audience.widensAudience.mockReturnValue(false);
});

function fakeMessage(content: string, attachments: string[] = []) {
  return {
    guildId: "g1",
    channelId: "trap",
    channel: { id: "trap" },
    content,
    attachments: new Map(attachments.map((name) => [name, { name }])),
    author: {
      id: "u1",
      username: "spammer",
      displayAvatarURL: () => "https://cdn/avatar.png",
    },
  } as unknown as Message<true>;
}

function fakeLogChannel(allowed = true) {
  return {
    isSendable: () => true,
    isDMBased: () => false,
    guild: { members: { me: { id: "bot" } } },
    permissionsFor: () => ({ has: () => allowed }),
    send: vi.fn(async (_payload: any) => ({})),
  };
}

const t = makeTestConfig("honeypot", honeypotConfigSchema).t;
const softbanned = { outcome: "softbanned", messageKept: false } as const;

describe("trapLog", () => {
  it("quotes the message and states the sanction", () => {
    const embed = trapLog(
      fakeMessage("free nitro\nclick here", ["scam.png"]),
      t,
      softbanned,
      3600,
      true
    );
    expect(embed.data.description).toBe(
      "**🍯 Trap triggered by <@u1> in <#trap>**\n" +
        "> free nitro\n> click here\n> 📎 scam.png\n\n" +
        "✅ Softbanned: their messages from the last 1h were deleted."
    );
    expect(embed.data.footer?.text).toBe("Author ID: u1");
  });

  it("marks an empty message", () => {
    const embed = trapLog(
      fakeMessage(""),
      t,
      { outcome: "failed", messageKept: false },
      3600,
      true
    );
    expect(embed.data.description).toContain("*No text*");
  });

  it("says when the trap message is still there", () => {
    const embed = trapLog(
      fakeMessage("spam"),
      t,
      { outcome: "notBannable", messageKept: true },
      3600,
      true
    );
    expect(embed.data.description).toMatch(
      /could not be deleted: delete it by hand\.$/
    );
  });

  it.each([
    ["emoji", "😀".repeat(3000)],
    ["short lines", "a\n".repeat(1999)],
  ])("stays within Discord's limit for %s", (_label, content) => {
    const embed = trapLog(fakeMessage(content), t, softbanned, 3600, true);
    const description = embed.data.description!;
    expect(description.length).toBeLessThanOrEqual(4096);
    expect(description).toMatch(/were deleted\.$/);
  });

  it("hides the content when asked", () => {
    const embed = trapLog(fakeMessage("secret"), t, softbanned, 3600, false);
    expect(embed.data.description).not.toContain("secret");
    expect(embed.data.description).toContain("Content hidden");
  });
});

describe("logTrap", () => {
  it("posts in the log channel without pinging", async () => {
    const channel = fakeLogChannel();
    const config = makeTestConfig("honeypot", honeypotConfigSchema, {
      logChannel: channel,
    } as never);
    await logTrap(fakeMessage("spam"), config, softbanned, 3600);
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { parse: [] } })
    );
  });

  it("hides the content from a wider audience", async () => {
    audience.widensAudience.mockReturnValue(true);
    const channel = fakeLogChannel();
    const config = makeTestConfig("honeypot", honeypotConfigSchema, {
      logChannel: channel,
    } as never);
    await logTrap(fakeMessage("secret"), config, softbanned, 3600);
    const embed = channel.send.mock.calls[0]![0].embeds[0];
    expect(embed.data.description).not.toContain("secret");
  });

  it("skips a log channel the bot cannot post in", async () => {
    const channel = fakeLogChannel(false);
    const config = makeTestConfig("honeypot", honeypotConfigSchema, {
      logChannel: channel,
    } as never);
    await logTrap(fakeMessage("spam"), config, softbanned, 3600);
    expect(channel.send).not.toHaveBeenCalled();
  });
});
