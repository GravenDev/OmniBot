import { Collection, type Message, type PartialMessage } from "discord.js";
import { describe, expect, it } from "vitest";
import { bulkDeleteLog, deletedEmbed, editedEmbed } from "./entries.js";

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

const createdTimestamp = Date.parse("2026-10-14T09:27:00Z");

function fakeMessage(
  options: {
    id?: string;
    content?: string;
    partial?: boolean;
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
    attachments: new Collection(
      (options.attachments ?? []).map((name) => [name, { name }])
    ),
    author: options.partial
      ? null
      : {
          id: "42",
          username: "flenderrs",
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
        "LE JOUR !",
        "📎 a.png",
      ].join("\n")
    );
    expect(embed.footer?.text).toBe(
      'footer.full {"authorId":"42","messageId":"300"}'
    );
  });

  it("names the moderator when the audit log confirms it", () => {
    const embed = deletedEmbed(fakeMessage({ content: "x" }), t, "7").data;
    expect(embed.description).toContain('deleted.by {"moderator":"<@7>"}');
  });

  it("says when the content is unknown", () => {
    const embed = deletedEmbed(fakeMessage({ partial: true }), t, null).data;
    expect(embed.author).toBeUndefined();
    expect(embed.description).toContain('"author":"unknownAuthor"');
    expect(embed.description).toContain("deleted.unknownContent");
    expect(embed.footer?.text).toBe('footer.message {"messageId":"300"}');
  });

  it("truncates a long message", () => {
    const description = deletedEmbed(
      fakeMessage({ content: "a".repeat(5000) }),
      t,
      null
    ).data.description!;
    expect(description).toHaveLength(4096);
  });
});

describe("editedEmbed", () => {
  it("shows the content before and after", () => {
    const embed = editedEmbed(
      fakeMessage({ content: "avant" }),
      fakeMessage({ content: "" }),
      t
    ).data;
    expect(embed.fields).toEqual([
      { name: "edited.before", value: "avant" },
      { name: "edited.after", value: "edited.empty" },
    ]);
    expect(embed.description).toContain(
      'edited.jump {"url":"https://discord.com/channels/100/200/300"}'
    );
  });
});

describe("bulkDeleteLog", () => {
  it("counts every message and attaches the known ones in order", async () => {
    const messages = new Collection<string, Message | PartialMessage>([
      ["2", fakeMessage({ id: "2", content: "second", sentAt: 2000 })],
      ["1", fakeMessage({ id: "1", content: "first", sentAt: 1000 })],
      ["3", fakeMessage({ id: "3", partial: true })],
    ]);
    const log = bulkDeleteLog(messages, "200", t);

    expect(log.embeds[0]!.data.description).toBe(
      [
        '**bulk.title {"count":3,"channel":"<#200>"}**',
        'bulk.known {"count":2}',
      ].join("\n")
    );
    expect(log.files[0]!.name).toBe("deleted-200.txt");
    expect((log.files[0]!.attachment as Buffer).toString("utf8")).toBe(
      [
        "[1970-01-01T00:00:01.000Z] flenderrs (42): first",
        "[1970-01-01T00:00:02.000Z] flenderrs (42): second",
      ].join("\n")
    );
  });

  it("attaches nothing when no content is known", () => {
    const messages = new Collection<string, Message | PartialMessage>([
      ["3", fakeMessage({ id: "3", partial: true })],
    ]);
    expect(bulkDeleteLog(messages, "200", t).files).toEqual([]);
  });
});
