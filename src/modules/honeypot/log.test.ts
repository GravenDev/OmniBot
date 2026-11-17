import type { Message } from "discord.js";
import { beforeAll, describe, expect, it } from "vitest";
import { initTestI18n, makeTestConfig } from "#lib/testing.js";
import { honeypotConfigSchema } from "./honeypot.config.js";
import en from "./i18n/en.json" with { type: "json" };
import { trapLog } from "./log.js";

beforeAll(async () => {
  await initTestI18n("honeypot", { en });
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

const t = makeTestConfig("honeypot", honeypotConfigSchema).t;
const softbanned = { outcome: "softbanned", messageKept: false } as const;

describe("trapLog", () => {
  it("quotes the message and states the sanction", () => {
    const embed = trapLog(
      fakeMessage("free nitro\nclick here", ["scam.png"]),
      t,
      softbanned,
      3600
    );
    expect(embed.data.description).toBe(
      "**🍯 Trap triggered by <@u1> in <#trap>**\n" +
        "> free nitro\n> click here\n> 📎 scam.png\n\n" +
        "✅ Softbanned: their messages from the last 1h were deleted."
    );
    expect(embed.data.footer?.text).toBe("Author ID: u1");
  });

  it("keeps the spam's markdown and links inert", () => {
    const embed = trapLog(
      fakeMessage("[free nitro](https://phish.example) ||**hi**||"),
      t,
      softbanned,
      3600
    );
    expect(embed.data.description).toContain(
      "> \\[free nitro](https://phish.example) \\|\\|\\*\\*hi\\*\\*\\|\\|"
    );
  });

  it("marks an empty message", () => {
    const embed = trapLog(
      fakeMessage(""),
      t,
      { outcome: "failed", messageKept: false },
      3600
    );
    expect(embed.data.description).toContain("*No text*");
  });

  it("says when the trap message is still there", () => {
    const embed = trapLog(
      fakeMessage("spam"),
      t,
      { outcome: "notBannable", messageKept: true },
      3600
    );
    expect(embed.data.description).toMatch(
      /could not be deleted: delete it by hand\.$/
    );
  });

  it.each([
    ["emoji", "😀".repeat(3000)],
    ["short lines", "a\n".repeat(1999)],
  ])("stays within Discord's limit for %s", (_label, content) => {
    const embed = trapLog(fakeMessage(content), t, softbanned, 3600);
    const description = embed.data.description!;
    expect(description.length).toBeLessThanOrEqual(4096);
    expect(description).toMatch(/were deleted\.$/);
  });
});
