import {
  ButtonStyle,
  ChannelType,
  Collection,
  PermissionFlagsBits,
  PermissionsBitField,
  type ButtonComponent,
  type GuildBasedChannel,
  type GuildMember,
  type Message,
} from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import type { MessageQuoteConfigSchema } from "#modules/message-quote/message-quote.config.js";
import {
  canRead,
  isExcluded,
  isNsfw,
  MAX_QUOTES,
  parseMessageLinks,
  quoteEmbed,
  quoteLinks,
  quoteReply,
  resolveQuote,
} from "./quote.js";

const GUILD = "100";

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

const READ = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ReadMessageHistory,
];

function link(channelId: string, messageId: string, guildId = GUILD) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function fakeChannel(
  options: {
    id?: string;
    parentId?: string | null;
    parent?: { parentId: string | null; nsfw?: boolean } | null;
    thread?: boolean;
    type?: ChannelType;
    nsfw?: boolean;
    permissions?: bigint[];
    threadMembers?: string[];
    messages?: Record<string, unknown>;
  } = {}
) {
  return {
    id: options.id ?? "200",
    parentId: options.parentId ?? null,
    parent: options.parent ?? null,
    type: options.type ?? ChannelType.GuildText,
    nsfw: options.nsfw ?? false,
    name: "general",
    isThread: () => options.thread ?? false,
    isTextBased: () => true,
    permissionsFor: () => new PermissionsBitField(options.permissions ?? READ),
    members: {
      fetch: async (id: string) => {
        if (!options.threadMembers?.includes(id)) throw new Error("unknown");
        return { id };
      },
    },
    messages: {
      fetch: async (id: string) => {
        const message = options.messages?.[id];
        if (!message) throw new Error("unknown message");
        return message;
      },
    },
  } as unknown as GuildBasedChannel;
}

const member = {
  id: "1",
  displayName: "Quoter",
} as unknown as GuildMember;

function fakeQuoted(
  options: {
    content?: string;
    attachments?: Partial<{
      name: string;
      url: string;
      contentType: string;
      spoiler: boolean;
    }>[];
    snapshot?: { content: string };
    embeds?: unknown[];
    authorId?: string;
    withMember?: boolean;
  } = {}
) {
  const attachments = new Collection(
    (options.attachments ?? []).map((attachment, index) => [
      String(index),
      { spoiler: false, ...attachment },
    ])
  );
  const author = {
    id: options.authorId ?? "2",
    displayName: "Author",
    displayAvatarURL: () => "https://cdn/avatar.png",
  };
  return {
    content: options.content ?? "",
    attachments,
    messageSnapshots: new Collection(
      options.snapshot
        ? [["s", { ...options.snapshot, attachments: new Collection() }]]
        : []
    ),
    embeds: options.embeds ?? [],
    author,
    member:
      options.withMember === false
        ? null
        : { ...author, displayName: "Nick", displayColor: 0xff0000 },
    url: "https://discord.com/channels/100/200/300",
    createdAt: new Date("2026-10-14T19:58:00Z"),
    channel: { name: "general" },
  } as unknown as Message<true>;
}

function fakeSource(
  content: string,
  channels: Record<string, GuildBasedChannel>,
  channel: GuildBasedChannel = fakeChannel({ id: "999" })
) {
  const reply = vi.fn(async () => ({}));
  const message = {
    content,
    guildId: GUILD,
    channel,
    member,
    author: { id: member.id },
    guild: {
      channels: {
        fetch: async (id: string) => {
          const found = channels[id];
          if (!found) throw new Error("Unknown Channel");
          return found;
        },
      },
      members: { fetch: async () => member },
    },
    reply,
  } as unknown as Message<true>;
  return { message, reply };
}

function fakeConfig(excluded: string[] = []) {
  return {
    t,
    get: () => excluded.map((id) => ({ id })),
  } as unknown as ConfigProvider<MessageQuoteConfigSchema>;
}

describe("parseMessageLinks", () => {
  it("extracts the channel and message ids", () => {
    expect(parseMessageLinks(`look ${link("200", "300")}`, GUILD)).toEqual([
      { channelId: "200", messageId: "300" },
    ]);
  });

  it("accepts the ptb, canary and discordapp hosts", () => {
    const content = [
      "https://ptb.discord.com/channels/100/1/2",
      "https://canary.discord.com/channels/100/1/3",
      "https://discordapp.com/channels/100/1/4",
    ].join(" ");
    expect(parseMessageLinks(content, GUILD).map((l) => l.messageId)).toEqual([
      "2",
      "3",
      "4",
    ]);
  });

  it("ignores links to another server", () => {
    expect(parseMessageLinks(link("200", "300", "555"), GUILD)).toEqual([]);
  });

  it("ignores links whose preview is suppressed with angle brackets", () => {
    expect(parseMessageLinks(`<${link("200", "300")}>`, GUILD)).toEqual([]);
  });

  it("ignores links in code and spoilers", () => {
    const content = [
      `\`${link("1", "1")}\``,
      `\`\`\`\n${link("1", "2")}\n\`\`\``,
      `||${link("1", "3")}||`,
    ].join(" ");
    expect(parseMessageLinks(content, GUILD)).toEqual([]);
  });

  it("deduplicates and caps the number of links", () => {
    const content = [
      link("1", "1"),
      link("1", "1"),
      link("1", "2"),
      link("1", "3"),
      link("1", "4"),
    ].join(" ");
    expect(parseMessageLinks(content, GUILD).map((l) => l.messageId)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(MAX_QUOTES).toBe(3);
  });
});

describe("isExcluded", () => {
  const excluded = new Set(["10"]);

  it("matches the channel itself and its category", () => {
    expect(isExcluded(fakeChannel({ id: "10" }), excluded)).toBe(true);
    expect(isExcluded(fakeChannel({ parentId: "10" }), excluded)).toBe(true);
    expect(isExcluded(fakeChannel({ parentId: "11" }), excluded)).toBe(false);
  });

  it("matches a thread through its parent channel and category", () => {
    expect(
      isExcluded(
        fakeChannel({
          thread: true,
          parentId: "10",
          parent: { parentId: null },
        }),
        excluded
      )
    ).toBe(true);
    expect(
      isExcluded(
        fakeChannel({
          thread: true,
          parentId: "12",
          parent: { parentId: "10" },
        }),
        excluded
      )
    ).toBe(true);
  });
});

describe("isNsfw", () => {
  it("reads the flag of the channel, or of the parent for a thread", () => {
    expect(isNsfw(fakeChannel({ nsfw: true }))).toBe(true);
    expect(isNsfw(fakeChannel())).toBe(false);
    expect(
      isNsfw(
        fakeChannel({ thread: true, parent: { parentId: null, nsfw: true } })
      )
    ).toBe(true);
  });
});

describe("canRead", () => {
  it("requires both viewing the channel and reading its history", async () => {
    expect(await canRead(member, fakeChannel())).toBe(true);
    expect(
      await canRead(
        member,
        fakeChannel({ permissions: [PermissionFlagsBits.ViewChannel] })
      )
    ).toBe(false);
    expect(await canRead(member, fakeChannel({ permissions: [] }))).toBe(false);
  });

  it("requires membership of a private thread", async () => {
    const privateThread = (threadMembers: string[]) =>
      fakeChannel({
        thread: true,
        type: ChannelType.PrivateThread,
        threadMembers,
      });
    expect(await canRead(member, privateThread([]))).toBe(false);
    expect(await canRead(member, privateThread([member.id]))).toBe(true);
  });

  it("lets thread managers read private threads", async () => {
    const channel = fakeChannel({
      thread: true,
      type: ChannelType.PrivateThread,
      permissions: [...READ, PermissionFlagsBits.ManageThreads],
    });
    expect(await canRead(member, channel)).toBe(true);
  });
});

describe("resolveQuote", () => {
  const quoted = fakeQuoted({ content: "hello" });
  const target = { channelId: "200", messageId: "300" };

  it("returns the linked message when the member can read it", async () => {
    const { message } = fakeSource("", {
      "200": fakeChannel({ messages: { "300": quoted } }),
    });
    expect(await resolveQuote(message, member, target, new Set())).toBe(quoted);
  });

  it("refuses a channel the member cannot read", async () => {
    const { message } = fakeSource("", {
      "200": fakeChannel({ permissions: [], messages: { "300": quoted } }),
    });
    expect(await resolveQuote(message, member, target, new Set())).toBeNull();
  });

  it("refuses to bring a NSFW message into a SFW channel", async () => {
    const { message } = fakeSource("", {
      "200": fakeChannel({ nsfw: true, messages: { "300": quoted } }),
    });
    expect(await resolveQuote(message, member, target, new Set())).toBeNull();
  });

  it("allows a NSFW message in a NSFW channel", async () => {
    const { message } = fakeSource(
      "",
      { "200": fakeChannel({ nsfw: true, messages: { "300": quoted } }) },
      fakeChannel({ id: "999", nsfw: true })
    );
    expect(await resolveQuote(message, member, target, new Set())).toBe(quoted);
  });

  it("refuses an excluded channel", async () => {
    const { message } = fakeSource("", {
      "200": fakeChannel({ messages: { "300": quoted } }),
    });
    expect(
      await resolveQuote(message, member, target, new Set(["200"]))
    ).toBeNull();
  });

  it("returns null for an unknown channel or message", async () => {
    const { message } = fakeSource("", { "200": fakeChannel() });
    expect(await resolveQuote(message, member, target, new Set())).toBeNull();
    expect(
      await resolveQuote(
        message,
        member,
        { channelId: "404", messageId: "1" },
        new Set()
      )
    ).toBeNull();
  });
});

describe("quoteEmbed", () => {
  it("shows the author, the content, the channel and the quoter", () => {
    const embed = quoteEmbed(fakeQuoted({ content: "hello" }), member, t).data;
    expect(embed.author).toMatchObject({
      name: "Nick",
      url: "https://discord.com/channels/100/200/300",
    });
    expect(embed.description).toBe("hello");
    expect(embed.color).toBe(0xff0000);
    expect(embed.footer?.text).toBe(
      'quote.footer {"quoter":"Quoter","channel":"general"}'
    );
    expect(embed.timestamp).toBe("2026-10-14T19:58:00.000Z");
  });

  it("falls back to the user when the author left", () => {
    const embed = quoteEmbed(fakeQuoted({ withMember: false }), member, t).data;
    expect(embed.author?.name).toBe("Author");
    expect(embed.color).toBeUndefined();
  });

  it("shows the first image and lists the other files", () => {
    const embed = quoteEmbed(
      fakeQuoted({
        attachments: [
          {
            name: "a.zip",
            url: "https://cdn/a.zip",
            contentType: "application/zip",
          },
          { name: "b.png", url: "https://cdn/b.png", contentType: "image/png" },
        ],
      }),
      member,
      t
    ).data;
    expect(embed.image?.url).toBe("https://cdn/b.png");
    expect(embed.description).toBe("📎 [a.zip](https://cdn/a.zip)");
  });

  it("never displays a spoilered image", () => {
    const embed = quoteEmbed(
      fakeQuoted({
        attachments: [
          {
            name: "SPOILER_b.png",
            url: "https://cdn/b.png",
            contentType: "image/png",
            spoiler: true,
          },
        ],
      }),
      member,
      t
    ).data;
    expect(embed.image).toBeUndefined();
    expect(embed.description).toContain("SPOILER_b.png");
  });

  it("quotes the content of a forwarded message", () => {
    const embed = quoteEmbed(
      fakeQuoted({ snapshot: { content: "forwarded" } }),
      member,
      t
    ).data;
    expect(embed.description).toBe("forwarded");
    expect(embed.footer?.text).toContain("quote.footerForwarded");
  });

  it("uses the embed of a message without text", () => {
    const embed = quoteEmbed(
      fakeQuoted({
        embeds: [
          { description: "from a bot", image: { url: "https://cdn/i" } },
        ],
      }),
      member,
      t
    ).data;
    expect(embed.description).toBe("from a bot");
    expect(embed.image?.url).toBe("https://cdn/i");
  });

  it("says when there is nothing to show", () => {
    expect(quoteEmbed(fakeQuoted(), member, t).data.description).toBe(
      "quote.noContent"
    );
  });

  it("truncates to the embed description limit", () => {
    const description = quoteEmbed(
      fakeQuoted({ content: "a".repeat(5000) }),
      member,
      t
    ).data.description!;
    expect(description).toHaveLength(4096);
    expect(description.endsWith("…")).toBe(true);
  });
});

describe("quoteReply", () => {
  it("adds a jump button per quote and a delete button for the people involved", () => {
    const reply = quoteReply(
      [fakeQuoted({ authorId: "2" }), fakeQuoted({ authorId: "2" })],
      member,
      t
    );
    const buttons = reply.components[0]!.toJSON().components as unknown as (
      | ButtonComponent["data"]
      | { custom_id: string; style: ButtonStyle }
    )[];
    expect(reply.embeds).toHaveLength(2);
    expect(buttons.map((button) => button.style)).toEqual([
      ButtonStyle.Link,
      ButtonStyle.Link,
      ButtonStyle.Secondary,
    ]);
    expect((buttons[2] as { custom_id: string }).custom_id).toBe(
      "message-quote:1:2"
    );
    expect(reply.allowedMentions).toEqual({ parse: [], repliedUser: false });
  });
});

describe("quoteLinks", () => {
  const quoted = fakeQuoted({ content: "hello" });

  it("replies with the quotes the member may read", async () => {
    const { message, reply } = fakeSource(
      `${link("200", "300")} ${link("201", "301")}`,
      {
        "200": fakeChannel({ messages: { "300": quoted } }),
        "201": fakeChannel({ permissions: [], messages: { "301": quoted } }),
      }
    );
    await quoteLinks(message, fakeConfig());
    expect(reply).toHaveBeenCalledOnce();
    expect(
      (reply.mock.calls[0] as unknown as [{ embeds: unknown[] }])[0].embeds
    ).toHaveLength(1);
  });

  it("stays silent when nothing can be quoted", async () => {
    const { message, reply } = fakeSource(link("200", "300"), {
      "200": fakeChannel({ permissions: [], messages: { "300": quoted } }),
    });
    await quoteLinks(message, fakeConfig());
    expect(reply).not.toHaveBeenCalled();
  });

  it("ignores links posted in an excluded channel", async () => {
    const { message, reply } = fakeSource(link("200", "300"), {
      "200": fakeChannel({ messages: { "300": quoted } }),
    });
    await quoteLinks(message, fakeConfig(["999"]));
    expect(reply).not.toHaveBeenCalled();
  });
});
