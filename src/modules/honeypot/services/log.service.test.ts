import { ChannelType, type Message } from "discord.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { initTestI18n, makeTestConfig, silenceLogs } from "#lib/testing.js";
import { honeypotConfigSchema } from "#modules/honeypot/honeypot.config.js";
import en from "#modules/honeypot/i18n/en.json" with { type: "json" };
import log from "./log.service.js";

silenceLogs();

beforeAll(async () => {
  await initTestI18n("honeypot", { en });
});

function fakeMessage(
  content: string,
  attachments: string[] = [],
  channelType = ChannelType.GuildText
) {
  return {
    guildId: "g1",
    channelId: "trap",
    channel: { id: "trap", type: channelType },
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

const softbanned = { outcome: "softbanned", messageKept: false } as const;

describe("logTrap", () => {
  it("posts in the log channel without pinging", async () => {
    const channel = fakeLogChannel();
    const config = makeTestConfig("honeypot", honeypotConfigSchema, {
      logChannel: channel,
    } as never);
    await log.logTrap(fakeMessage("spam"), config, softbanned, 3600);
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { parse: [] } })
    );
  });

  // No audience rule: the log channel is staff-only (docs/functional.md), so
  // a message from a private thread of a trap is quoted like any other.
  it("quotes a message from a private thread of a trap", async () => {
    const channel = fakeLogChannel();
    const config = makeTestConfig("honeypot", honeypotConfigSchema, {
      logChannel: channel,
    } as never);
    const message = fakeMessage("secret", [], ChannelType.PrivateThread);
    await log.logTrap(message, config, softbanned, 3600);
    const embed = channel.send.mock.calls[0]![0].embeds[0];
    expect(embed.data.description).toContain("> secret");
  });

  it("skips a log channel the bot cannot post in", async () => {
    const channel = fakeLogChannel(false);
    const config = makeTestConfig("honeypot", honeypotConfigSchema, {
      logChannel: channel,
    } as never);
    await log.logTrap(fakeMessage("spam"), config, softbanned, 3600);
    expect(channel.send).not.toHaveBeenCalled();
  });
});
