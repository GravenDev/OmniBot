import { Collection, type Message, type PartialMessage } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  bulkDeleteLog,
  deletedEmbed,
  deletedLog,
  editedLog,
} from "./entries.js";

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

const createdTimestamp = Date.parse("2026-10-14T09:27:00Z");

function fakeMessage(
  options: {
    id?: string;
    content?: string;
    partial?: boolean;
    bot?: boolean;
    webhookId?: string;
    system?: boolean;
    attachments?: string[];
    sentAt?: number;
  } = {}
) {
  return {
    id: options.id ?? "300",
    channelId: "200",
    partial: options.partial ?? false,
    content: options.partial ? null : (options.content ?? ""),
    createdTimestamp: options.sentAt ?? createdTimestamp,
    url: "https://discord.com/channels/100/200/300",
    webhookId: options.webhookId ?? null,
    system: options.system ?? false,
    attachments: new Collection(
      (options.attachments ?? []).map((name) => [name, { name }])
    ),
    author: options.partial
      ? null
      : {
          id: "42",
          username: "flenderrs",
          bot: options.bot ?? false,
          displayAvatarURL: () => "https://cdn/avatar.png",
        },
  } as unknown as Message;
}

describe("deletedEmbed", () => {
  it("shows the author, the channel and the content", () => {
    const embed = deletedEmbed(
      fakeMessage({ content: "LE JOUR !", attachments: ["a.png"] }),
      t,
      null
    ).data;
    expect(embed.author?.name).toBe("flenderrs");
    expect(embed.description).toBe(
      [
        '**deleted.title {"author":"<@42>","channel":"<#200>"}**',
        'sentAt {"sentAt":"<t:1791970020:f>"}',
        "",
        "> LE JOUR !",
        "> 📎 a.png",
      ].join("\n")
    );
    expect(embed.footer?.text).toBe(
      'footer {"authorId":"42","messageId":"300"}'
    );
  });

  it("names the moderator when the audit log confirms it", () => {
    const embed = deletedEmbed(fakeMessage({ content: "x" }), t, "7").data;
    expect(embed.description).toContain('deleted.by {"moderator":"<@7>"}');
  });

  it("truncates a long message", () => {
    const description = deletedEmbed(
      fakeMessage({ content: "a".repeat(5000) }),
      t,
      null
    ).data.description!;
    expect(description).toHaveLength(4096);
  });

  it("quotes every line so a member cannot forge a log line", () => {
    const embed = deletedEmbed(
      fakeMessage({ content: "x\n\ndeleted.by <@7>" }),
      t,
      null
    ).data;
    expect(embed.description!.split("\n").slice(-3)).toEqual([
      "> x",
      "> ",
      "> deleted.by <@7>",
    ]);
  });
});

describe("deletedLog", () => {
  it("attaches the full text when the embed had to cut it", () => {
    const content = "a".repeat(4090);
    const log = deletedLog(fakeMessage({ content }), t, null);
    expect(log.files[0]!.name).toBe("deleted-300.txt");
    expect((log.files[0]!.attachment as Buffer).toString("utf8")).toBe(content);
  });

  it("attaches nothing when the text fits", () => {
    expect(deletedLog(fakeMessage({ content: "x" }), t, null).files).toEqual(
      []
    );
  });
});

describe("editedLog", () => {
  it("shows the content before and after", () => {
    const log = editedLog(
      fakeMessage({ content: "avant" }),
      fakeMessage({ content: "" }),
      t
    );
    const embed = log.embeds[0]!.data;
    expect(embed.fields).toEqual([
      { name: "edited.before", value: "avant" },
      { name: "edited.after", value: "edited.empty" },
    ]);
    expect(embed.description).toContain(
      'edited.jump {"url":"https://discord.com/channels/100/200/300"}'
    );
    expect(log.files).toEqual([]);
  });

  it("attaches the full texts when a side does not fit in a field", () => {
    const before = `${"a".repeat(1500)} old`;
    const after = `${"a".repeat(1500)} new`;
    const log = editedLog(
      fakeMessage({ content: before }),
      fakeMessage({ content: after }),
      t
    );
    expect(log.embeds[0]!.data.fields![0]!.value).toHaveLength(1024);
    expect(log.files[0]!.name).toBe("edit-300.txt");
    expect((log.files[0]!.attachment as Buffer).toString("utf8")).toBe(
      ["edited.before:", before, "", "edited.after:", after].join("\n")
    );
  });
});

describe("bulkDeleteLog", () => {
  it("counts every message and attaches the members' known ones in order", async () => {
    const messages = new Collection<string, Message | PartialMessage>([
      [
        "2",
        fakeMessage({
          id: "2",
          content: "second\n[fake] other (1): forged",
          sentAt: 2000,
        }),
      ],
      ["1", fakeMessage({ id: "1", content: "first", sentAt: 1000 })],
      ["3", fakeMessage({ id: "3", partial: true })],
      ["4", fakeMessage({ id: "4", content: "bot", bot: true })],
      ["5", fakeMessage({ id: "5", content: "hook", webhookId: "9" })],
      ["6", fakeMessage({ id: "6", system: true })],
    ]);
    const log = bulkDeleteLog(messages, "200", t);

    expect(log.embeds[0]!.data.description).toBe(
      [
        '**bulk.title {"count":6,"channel":"<#200>"}**',
        'bulk.known {"count":2}',
      ].join("\n")
    );
    expect(log.files[0]!.name).toBe("deleted-200.txt");
    expect((log.files[0]!.attachment as Buffer).toString("utf8")).toBe(
      [
        "[1970-01-01T00:00:01.000Z] flenderrs (42): first",
        "[1970-01-01T00:00:02.000Z] flenderrs (42): second",
        "    [fake] other (1): forged",
      ].join("\n")
    );
  });

  it("attaches nothing and mentions no file when no content is known", () => {
    const messages = new Collection<string, Message | PartialMessage>([
      ["3", fakeMessage({ id: "3", partial: true })],
    ]);
    const log = bulkDeleteLog(messages, "200", t);
    expect(log.files).toEqual([]);
    expect(log.embeds[0]!.data.description).not.toContain("bulk.known");
  });
});
