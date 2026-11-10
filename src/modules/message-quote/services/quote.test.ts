import {
  ButtonStyle,
  ChannelType,
  Collection,
  ComponentType,
  DiscordAPIError,
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField,
  RESTJSONErrorCodes,
  type GuildBasedChannel,
  type GuildMember,
  type Message,
} from "discord.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import core from "#core/i18n/en.json" with { type: "json" };
import { isNsfw, widensAudience } from "#lib/channel-audience.js";
import type { ConfigProvider } from "#lib/config.js";
import { COMPONENTS_TEXT_LIMIT } from "#lib/format.js";
import { createT } from "#lib/i18n.js";
import { NO_MENTIONS_REPLY } from "#lib/mentions.js";
import {
  COMPONENTS_LIMIT,
  componentCount,
  initTestI18n,
  silenceLogs,
  textLength,
} from "#lib/testing.js";
import en from "#modules/message-quote/i18n/en.json" with { type: "json" };
import type { MessageQuoteConfigSchema } from "#modules/message-quote/message-quote.config.js";
import {
  ACCENT,
  canRead,
  MAX_QUOTES,
  parseMessageLinks,
  quoteContainer,
  quoteLinks,
  quoteReply,
  resolveQuote,
} from "./quote.js";

const GUILD = "100";

const t = createT("en", "message-quote");

beforeAll(async () => {
  await initTestI18n("core", { en: core });
  await initTestI18n("message-quote", { en });
  silenceLogs();
});

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
    cachedThreadMembers?: string[];
    messages?: Record<string, unknown>;
  } = {}
) {
  const thread = options.thread ?? false;
  return {
    id: options.id ?? "200",
    parentId: options.parentId ?? null,
    parent: thread
      ? { parentId: null, ...options.parent }
      : (options.parent ?? null),
    type: options.type ?? ChannelType.GuildText,
    nsfw: options.nsfw ?? false,
    name: "general",
    isThread: () => thread,
    isTextBased: () => true,
    permissionsFor: () => new PermissionsBitField(options.permissions ?? READ),
    members: {
      fetch: async (fetchOptions: { member: string; force?: boolean }) => {
        const known =
          options.threadMembers?.includes(fetchOptions.member) ||
          (!fetchOptions.force &&
            options.cachedThreadMembers?.includes(fetchOptions.member));
        if (!known) throw new Error("unknown");
        return { id: fetchOptions.member };
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
    snapshot?: {
      content: string;
      embeds?: unknown[];
      components?: unknown[];
    };
    embeds?: unknown[];
    authorId?: string;
    withMember?: boolean;
    buttonIds?: string[];
    /** A message laid out with components: no content, no attachments. */
    components?: unknown[];
  } = {}
) {
  const attachments = new Collection(
    (options.attachments ?? []).map((attachment, index) => [
      String(index),
      { id: String(index), spoiler: false, ...attachment },
    ])
  );
  const author = {
    id: options.authorId ?? "2",
    username: "author",
    displayName: "Author",
    displayAvatarURL: () => "https://cdn/avatar.png",
  };
  return {
    content: options.content ?? "",
    attachments,
    messageSnapshots: new Collection(
      options.snapshot
        ? [
            [
              "s",
              {
                embeds: [],
                components: [],
                stickers: new Collection(),
                ...options.snapshot,
                attachments: new Collection(),
              },
            ],
          ]
        : []
    ),
    embeds: options.embeds ?? [],
    stickers: new Collection(),
    author,
    webhookId: null,
    member:
      options.withMember === false
        ? null
        : {
            ...author,
            displayName: "Nick",
            displayColor: 0xff0000,
            displayAvatarURL: () => "https://cdn/member-avatar.png",
          },
    url: "https://discord.com/channels/100/200/300",
    createdAt: new Date("2026-10-14T19:58:00Z"),
    channelId: "200",
    channel: { name: "general" },
    client: { user: { id: "bot" } },
    components: options.components
      ? options.components
      : options.buttonIds
        ? [
            // An action row below an embed, as discord.js gives it.
            {
              toJSON: () => ({
                type: 1,
                components: options.buttonIds!.map((custom_id) => ({
                  type: 2,
                  custom_id,
                })),
              }),
            },
          ]
        : [],
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
    client: { user: { id: "bot" } },
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

function fakeConfig(
  excluded: string[] = [],
  excludedCategories: string[] = []
) {
  const values: Record<string, { id: string }[]> = {
    excludedChannels: excluded.map((id) => ({ id })),
    excludedCategories: excludedCategories.map((id) => ({ id })),
  };
  return {
    t,
    get: (key: string) => values[key],
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
      `\`\`${link("1", "4")}\`\``,
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

  it("asks Discord instead of trusting a stale thread member cache", async () => {
    const channel = fakeChannel({
      thread: true,
      type: ChannelType.PrivateThread,
      cachedThreadMembers: [member.id],
    });
    expect(await canRead(member, channel)).toBe(false);
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

  it("quotes a channel hidden from the destination's public when the member can read it", async () => {
    const everyone = {
      id: GUILD,
      managed: false,
      permissions: new PermissionsBitField(READ),
    };
    const guild = {
      roles: { everyone, cache: new Collection([[GUILD, everyone]]) },
    };
    const withAudience = (
      channel: GuildBasedChannel,
      hidden: boolean
    ): GuildBasedChannel =>
      Object.assign(channel, {
        guild,
        permissionOverwrites: {
          cache: new Map(
            hidden
              ? [
                  [
                    GUILD,
                    {
                      allow: new PermissionsBitField(),
                      deny: new PermissionsBitField([
                        PermissionFlagsBits.ViewChannel,
                      ]),
                    },
                  ],
                ]
              : []
          ),
        },
      });
    const staff = withAudience(
      fakeChannel({ messages: { "300": quoted } }),
      true
    );
    const general = withAudience(fakeChannel({ id: "999" }), false);
    expect(widensAudience(staff, general)).toBe(true);

    const { message } = fakeSource("", { "200": staff }, general);
    expect(await resolveQuote(message, member, target, new Set())).toBe(quoted);
  });

  it("quotes a private thread elsewhere when the member belongs to it", async () => {
    const privateThread = (threadMembers: string[]) =>
      fakeChannel({
        thread: true,
        type: ChannelType.PrivateThread,
        permissions: READ,
        threadMembers,
        messages: { "300": quoted },
      });
    const inside = fakeSource("", { "200": privateThread([member.id]) });
    expect(await resolveQuote(inside.message, member, target, new Set())).toBe(
      quoted
    );

    const outsider = fakeSource("", { "200": privateThread([]) });
    expect(
      await resolveQuote(outsider.message, member, target, new Set())
    ).toBeNull();
  });

  it("does not quote its own quotes but quotes its other messages", async () => {
    const ownQuote = fakeQuoted({
      authorId: "bot",
      buttonIds: ["message-quote:1:2"],
    });
    const announcement = fakeQuoted({
      authorId: "bot",
      buttonIds: ["rngdle-nav:profile"],
    });
    const { message } = fakeSource("", {
      "200": fakeChannel({
        messages: { "300": ownQuote, "301": announcement },
      }),
    });
    expect(await resolveQuote(message, member, target, new Set())).toBeNull();
    expect(
      await resolveQuote(
        message,
        member,
        { channelId: "200", messageId: "301" },
        new Set()
      )
    ).toBe(announcement);
  });

  it("does not quote its own quotes, laid out with components", async () => {
    const ownQuote = fakeQuoted({
      authorId: "bot",
      components: [quoteReply([quoted], member, t).components[0]!.toJSON()],
    });
    const { message } = fakeSource("", {
      "200": fakeChannel({ messages: { "300": ownQuote } }),
    });
    expect(await resolveQuote(message, member, target, new Set())).toBeNull();
  });

  it("quotes a member's message even if it carries a quote button id", async () => {
    const lookalike = fakeQuoted({
      authorId: "2",
      buttonIds: ["message-quote:1:2"],
    });
    const { message } = fakeSource("", {
      "200": fakeChannel({ messages: { "300": lookalike } }),
    });
    expect(await resolveQuote(message, member, target, new Set())).toBe(
      lookalike
    );
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

interface Json {
  type: number;
  content?: string;
  accent_color?: number;
  components?: Json[];
  accessory?: Json & { media?: { url: string } };
  items?: { media: { url: string }; spoiler?: boolean }[];
  style?: number;
  url?: string;
  label?: string;
  custom_id?: string;
}

function render(quoted: Message<true>) {
  const json = quoteContainer(quoted, member, t).toJSON() as unknown as Json;
  const section = json.components!.find(
    (component) => component.type === ComponentType.Section
  )!;
  const texts = json
    .components!.filter(
      (component) => component.type === ComponentType.TextDisplay
    )
    .map((component) => component.content);
  const gallery =
    json.components!.find(
      (component) => component.type === ComponentType.MediaGallery
    )?.items ?? [];
  return {
    json,
    // The header and the text, beside the avatar.
    main: section.components![0]!.content!,
    avatar: section.accessory?.media?.url,
    // The text displays after it: the extras, then the footer.
    texts,
    gallery: gallery.map((item) => ({
      url: item.media.url,
      spoiler: item.spoiler ?? false,
    })),
  };
}

describe("quoteContainer", () => {
  it("shows the author, the channel and the date above the text", () => {
    const { json, main, avatar, texts } = render(
      fakeQuoted({ content: "hello" })
    );
    expect(main).toMatch(/^-# <@2> in <#200> · <t:\d+:R>\n\nhello$/);
    expect(avatar).toBe("https://cdn/member-avatar.png");
    expect(json.accent_color).toBe(0xff0000);
    expect(texts).toEqual(["-# 💬 Quoted by <@1>"]);
  });

  it("ends with the quoter above a link to the message", () => {
    const { json } = render(fakeQuoted({ content: "hello" }));
    expect(json.components!.slice(-3)).toMatchObject([
      { type: ComponentType.Separator },
      { type: ComponentType.TextDisplay, content: "-# 💬 Quoted by <@1>" },
      {
        type: ComponentType.ActionRow,
        components: [
          {
            style: ButtonStyle.Link,
            url: "https://discord.com/channels/100/200/300",
            label: "Go to message",
          },
        ],
      },
    ]);
  });

  it("uses a soft lavender when the author has no role colour", () => {
    const { json, avatar } = render(fakeQuoted({ withMember: false }));
    expect(json.accent_color).toBe(ACCENT);
    expect(avatar).toBe("https://cdn/avatar.png");
  });

  it("reads a message laid out with components, text and image", () => {
    // Without content or attachments: its text displays and gallery instead.
    const { main, gallery } = render(
      fakeQuoted({
        components: [
          { type: 10, content: "🎂 **Joyeux anniversaire !**" },
          { type: 12, items: [{ media: { url: "https://cdn/card.webp" } }] },
          { type: 10, content: "<@1>" },
        ],
      })
    );
    expect(main).toMatch(/\n\n🎂 \*\*Joyeux anniversaire !\*\*\n<@1>$/);
    expect(gallery).toEqual([{ url: "https://cdn/card.webp", spoiler: false }]);
  });

  it("reads a forwarded message laid out with components", () => {
    const { main, gallery } = render(
      fakeQuoted({
        snapshot: {
          content: "",
          components: [
            { type: 10, content: "🎂 forwarded" },
            { type: 12, items: [{ media: { url: "https://cdn/card.webp" } }] },
          ],
        },
      })
    );
    expect(main).toMatch(/\n-# ↪ Forwarded message\n\n🎂 forwarded$/);
    expect(gallery).toEqual([{ url: "https://cdn/card.webp", spoiler: false }]);
  });

  it("shows each upload of a gallery once, with its spoiler", () => {
    const upload = (name: string) => ({
      name,
      url: `https://cdn/${name}`,
      contentType: "image/png",
    });
    const { gallery, texts } = render(
      fakeQuoted({
        attachments: [upload("a.png"), upload("b.png"), upload("c.png")],
        components: [
          {
            type: 12,
            items: ["a", "b", "c"].map((name, index) => ({
              media: {
                url: `https://cdn/${name}.png`,
                attachment_id: `${index}`,
              },
              spoiler: name === "a",
            })),
          },
        ],
      })
    );
    expect(gallery).toEqual([
      { url: "https://cdn/a.png", spoiler: true },
      { url: "https://cdn/b.png", spoiler: false },
      { url: "https://cdn/c.png", spoiler: false },
    ]);
    expect(texts.join("\n")).not.toContain("📎");
  });

  it("keeps hidden an uploaded thumbnail inside a spoiler container", () => {
    const { gallery } = render(
      fakeQuoted({
        attachments: [
          { name: "t.png", url: "https://cdn/t.png", contentType: "image/png" },
        ],
        components: [
          {
            type: 17,
            spoiler: true,
            components: [
              {
                type: 9,
                components: [{ type: 10, content: "secret" }],
                accessory: {
                  type: 11,
                  media: { url: "https://cdn/t.png", attachment_id: "0" },
                },
              },
            ],
          },
        ],
      })
    );
    expect(gallery).toEqual([{ url: "https://cdn/t.png", spoiler: true }]);
  });

  it("shows a gallery's videos with its images", () => {
    const { gallery } = render(
      fakeQuoted({
        components: [
          {
            type: 12,
            items: [
              {
                media: {
                  url: "https://cdn/clip.mp4",
                  content_type: "video/mp4",
                },
              },
              { media: { url: "https://cdn/card.webp" } },
            ],
          },
        ],
      })
    );
    expect(gallery.map((item) => item.url)).toEqual([
      "https://cdn/clip.mp4",
      "https://cdn/card.webp",
    ]);
  });

  it("keeps hidden the uploaded image a gallery shows as a spoiler", () => {
    // Its gallery item holds the spoiler; the attachment itself does not.
    const { main, gallery } = render(
      fakeQuoted({
        attachments: [
          {
            name: "end.png",
            url: "https://cdn/end.png",
            contentType: "image/png",
          },
        ],
        components: [
          { type: 10, content: "the end" },
          {
            type: 12,
            items: [
              {
                media: { url: "https://cdn/end.png", attachment_id: "0" },
                spoiler: true,
              },
            ],
          },
        ],
      })
    );
    expect(main).toMatch(/\n\nthe end$/);
    expect(gallery).toEqual([{ url: "https://cdn/end.png", spoiler: true }]);
  });

  it("shows the images in a gallery and lists the other files", () => {
    const { gallery, texts } = render(
      fakeQuoted({
        attachments: [
          {
            name: "a.zip",
            url: "https://cdn/a.zip",
            contentType: "application/zip",
          },
          { name: "b.png", url: "https://cdn/b.png", contentType: "image/png" },
          { name: "c.png", url: "https://cdn/c.png", contentType: "image/png" },
        ],
      })
    );
    expect(gallery.map((item) => item.url)).toEqual([
      "https://cdn/b.png",
      "https://cdn/c.png",
    ]);
    expect(texts[0]).toBe("📎 [a.zip](https://cdn/a.zip)");
  });

  it("shows a spoilered image blurred", () => {
    const { gallery } = render(
      fakeQuoted({
        attachments: [
          {
            name: "SPOILER_b.png",
            url: "https://cdn/b.png",
            contentType: "image/png",
            spoiler: true,
          },
        ],
      })
    );
    expect(gallery).toEqual([{ url: "https://cdn/b.png", spoiler: true }]);
  });

  it("quotes the content of a forwarded message", () => {
    const { main } = render(fakeQuoted({ snapshot: { content: "forwarded" } }));
    expect(main).toMatch(/\n-# ↪ Forwarded message\n\nforwarded$/);
  });

  it("quotes the embed of a message without text", () => {
    const { main, texts, gallery } = render(
      fakeQuoted({
        embeds: [
          {
            data: { type: "rich" },
            description: "from a bot",
            image: { url: "https://cdn/i" },
          },
        ],
      })
    );
    expect(main).not.toContain("Message without text");
    expect(texts[0]).toBe("> from a bot");
    expect(gallery).toEqual([{ url: "https://cdn/i", spoiler: false }]);
  });

  it("does not reveal a link preview hidden behind a spoiler", () => {
    const { gallery, texts } = render(
      fakeQuoted({
        content: "||https://example.com/i.png||",
        embeds: [
          {
            data: { type: "rich" },
            title: "reveal",
            image: { url: "https://example.com/i.png" },
          },
        ],
      })
    );
    expect(gallery).toEqual([
      { url: "https://example.com/i.png", spoiler: true },
    ]);
    expect(texts.join("\n")).not.toContain("reveal");
  });

  it("quotes the embed of a forwarded message without text", () => {
    const { texts } = render(
      fakeQuoted({
        snapshot: {
          content: "",
          embeds: [{ data: { type: "rich" }, description: "forwarded embed" }],
        },
      })
    );
    expect(texts[0]).toBe("> forwarded embed");
  });

  it("says when there is nothing to read", () => {
    expect(render(fakeQuoted()).main).toMatch(/\n\n\*Message without text\*$/);
  });

  it("truncates to the text it may hold", () => {
    const { json, main } = render(fakeQuoted({ content: "a".repeat(5000) }));
    expect(main.endsWith("…")).toBe(true);
    expect(textLength([{ toJSON: () => json as never }])).toBeLessThanOrEqual(
      COMPONENTS_TEXT_LIMIT
    );
  });
});

describe("quoteReply", () => {
  it("gives each quote its container, and the last one the delete button", () => {
    const reply = quoteReply(
      [fakeQuoted({ authorId: "2" }), fakeQuoted({ authorId: "2" })],
      member,
      t
    );
    expect(reply).not.toHaveProperty("content");
    expect(reply.flags).toBe(MessageFlags.IsComponentsV2);
    expect(reply.allowedMentions).toBe(NO_MENTIONS_REPLY);
    const rows = reply.components.map((container) =>
      (container.toJSON() as unknown as Json).components!.at(-1)!
    );
    expect(rows.map((row) => row.components!.map((b) => b.style))).toEqual([
      [ButtonStyle.Link],
      [ButtonStyle.Link, ButtonStyle.Secondary],
    ]);
    expect(rows[1]!.components![1]!.custom_id).toBe("message-quote:1:2");
  });

  it("keeps several full quotes within Discord's limits", () => {
    const file = (name: string) => ({
      name,
      url: `https://cdn/${name}?${"x".repeat(500)}`,
      contentType: "application/pdf",
    });
    const image = (name: string) => ({
      name,
      url: `https://cdn/${name}`,
      contentType: "image/png",
    });
    const embed = {
      data: { type: "rich" },
      title: "T",
      description: "line\n".repeat(300),
      image: { url: "https://cdn/e.png" },
    };
    const reply = quoteReply(
      [1, 2, 3].map(() =>
        fakeQuoted({
          content: "a".repeat(4000),
          attachments: [
            file("a.pdf"),
            file("b.pdf"),
            file("c.pdf"),
            file("d.pdf"),
            ...Array.from({ length: 12 }, (_, i) => image(`${i}.png`)),
          ],
          embeds: [embed, embed],
        })
      ),
      member,
      t
    );
    expect(reply.components).toHaveLength(3);
    expect(textLength(reply.components)).toBeLessThanOrEqual(
      COMPONENTS_TEXT_LIMIT
    );
    expect(componentCount(reply.components)).toBeLessThanOrEqual(
      COMPONENTS_LIMIT
    );
    // Each one still shows a good part of its text.
    for (const container of reply.components) {
      expect(JSON.stringify(container.toJSON())).toContain("a".repeat(300));
    }
  });

  it("leaves the media out when asked to", () => {
    const reply = quoteReply(
      [
        fakeQuoted({
          attachments: [
            {
              name: "b.png",
              url: "https://cdn/b.png",
              contentType: "image/png",
            },
          ],
        }),
      ],
      member,
      t,
      false
    );
    const json = JSON.stringify(reply.components[0]!.toJSON());
    expect(json).not.toContain('"type":12');
    expect(json).toContain("📎 [b.png](https://cdn/b.png)");
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
    const [payload] = reply.mock.calls[0] as unknown as [
      { content?: string; components: unknown[]; flags: number },
    ];
    expect(payload.components).toHaveLength(1);
    expect(payload.content).toBeUndefined();
    // The message with the link already notified the channel.
    expect(payload.flags).toBe(
      MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications
    );
  });

  it("retries without media when Discord refuses one", async () => {
    const withImage = fakeQuoted({
      content: "hello",
      embeds: [
        { data: { type: "rich" }, image: { url: "https://bad.example/i" } },
      ],
    });
    const { message, reply } = fakeSource(link("200", "300"), {
      "200": fakeChannel({ messages: { "300": withImage } }),
    });
    reply.mockRejectedValueOnce(
      new DiscordAPIError(
        {
          code: RESTJSONErrorCodes.InvalidFormBodyOrContentType,
          message: "Invalid Form Body",
        },
        RESTJSONErrorCodes.InvalidFormBodyOrContentType,
        400,
        "POST",
        "https://discord.com/api/v10/channels/1/messages",
        {}
      )
    );
    await quoteLinks(message, fakeConfig());
    expect(reply).toHaveBeenCalledTimes(2);
    const calls = reply.mock.calls as unknown as [
      { components: { toJSON(): unknown }[] },
    ][];
    const sent = (index: number) =>
      JSON.stringify(calls[index]![0].components.map((c) => c.toJSON()));
    expect(sent(0)).toContain("https://bad.example/i");
    expect(sent(1)).not.toContain("https://bad.example/i");
    expect(sent(1)).toContain("hello");
  });

  it("does not retry another error", async () => {
    const { message, reply } = fakeSource(link("200", "300"), {
      "200": fakeChannel({ messages: { "300": quoted } }),
    });
    reply.mockRejectedValueOnce(new Error("boom"));
    await expect(quoteLinks(message, fakeConfig())).rejects.toThrow("boom");
    expect(reply).toHaveBeenCalledOnce();
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

  it("ignores messages from an excluded category", async () => {
    const { message, reply } = fakeSource(link("200", "300"), {
      "200": fakeChannel({ parentId: "cat", messages: { "300": quoted } }),
    });
    await quoteLinks(message, fakeConfig([], ["cat"]));
    expect(reply).not.toHaveBeenCalled();
  });
});
