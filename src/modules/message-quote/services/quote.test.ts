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
import { isNsfw } from "#lib/channel-audience.js";
import type { ConfigProvider } from "#lib/config.js";
import type { MessageQuoteConfigSchema } from "#modules/message-quote/message-quote.config.js";
import {
  canRead,
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

function fakeRole(id: string, permissions: bigint[] = [], managed = false) {
  return { id, managed, permissions: new PermissionsBitField(permissions) };
}

const everyone = fakeRole(GUILD, [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ReadMessageHistory,
]);

const roles = new Collection(
  [
    everyone,
    fakeRole("member"),
    fakeRole("staff"),
    fakeRole("player"),
    fakeRole("music-bot", [], true),
    fakeRole("admin", [PermissionFlagsBits.Administrator]),
  ].map((role) => [role.id, role])
);

function fakeGuild(everyoneRole = everyone) {
  const cache = new Collection(roles);
  cache.set(everyoneRole.id, everyoneRole);
  return { roles: { everyone: everyoneRole, cache } };
}

const lockedServer = fakeGuild(
  fakeRole(GUILD, [PermissionFlagsBits.ReadMessageHistory])
);

function overwrites(viewers?: string[], hideHistory = false) {
  const cache = new Map<
    string,
    { allow: PermissionsBitField; deny: PermissionsBitField }
  >();
  if (hideHistory) {
    cache.set(GUILD, {
      allow: new PermissionsBitField(),
      deny: new PermissionsBitField([PermissionFlagsBits.ReadMessageHistory]),
    });
  }
  if (viewers) {
    cache.set(GUILD, {
      allow: new PermissionsBitField(),
      deny: new PermissionsBitField([PermissionFlagsBits.ViewChannel]),
    });
    for (const viewer of viewers) {
      cache.set(viewer, {
        allow: new PermissionsBitField([PermissionFlagsBits.ViewChannel]),
        deny: new PermissionsBitField(),
      });
    }
  }
  return { cache };
}

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
    public?: boolean;
    viewers?: string[];
    hideHistory?: boolean;
    guild?: ReturnType<typeof fakeGuild>;
    threadMembers?: string[];
    cachedThreadMembers?: string[];
    messages?: Record<string, unknown>;
  } = {}
) {
  const permissionOverwrites = overwrites(
    options.viewers ?? (options.public === false ? ["staff"] : undefined),
    options.hideHistory
  );
  const thread = options.thread ?? false;
  return {
    id: options.id ?? "200",
    parentId: options.parentId ?? null,
    parent: thread
      ? { parentId: null, ...options.parent, permissionOverwrites }
      : (options.parent ?? null),
    type: options.type ?? ChannelType.GuildText,
    nsfw: options.nsfw ?? false,
    name: "general",
    guild: options.guild ?? fakeGuild(),
    permissionOverwrites,
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
    snapshot?: { content: string; embeds?: unknown[] };
    embeds?: unknown[];
    authorId?: string;
    withMember?: boolean;
    buttonIds?: string[];
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
        ? [
            [
              "s",
              {
                embeds: [],
                ...options.snapshot,
                attachments: new Collection(),
              },
            ],
          ]
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
    client: { user: { id: "bot" } },
    components: options.buttonIds
      ? [
          {
            components: options.buttonIds.map((customId) => ({ customId })),
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
  excludedCategories: string[] = [],
  ignoredRoles: string[] = []
) {
  const values: Record<string, { id: string }[]> = {
    excludedChannels: excluded.map((id) => ({ id })),
    excludedCategories: excludedCategories.map((id) => ({ id })),
    ignoredRoles: ignoredRoles.map((id) => ({ id })),
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

  it("refuses to bring a private channel into a public one", async () => {
    const { message } = fakeSource("", {
      "200": fakeChannel({ public: false, messages: { "300": quoted } }),
    });
    expect(await resolveQuote(message, member, target, new Set())).toBeNull();
  });

  it("allows a private channel to be quoted in a private one", async () => {
    const { message } = fakeSource(
      "",
      { "200": fakeChannel({ public: false, messages: { "300": quoted } }) },
      fakeChannel({ id: "999", public: false })
    );
    expect(await resolveQuote(message, member, target, new Set())).toBe(quoted);
  });

  it("compares audiences role by role when @everyone sees nothing", async () => {
    const general = (id: string) =>
      fakeChannel({
        id,
        guild: lockedServer,
        viewers: ["member", "staff"],
        messages: { "300": quoted },
      });
    const staff = (id: string) =>
      fakeChannel({
        id,
        guild: lockedServer,
        viewers: ["staff"],
        messages: { "300": quoted },
      });

    const intoGeneral = fakeSource("", { "200": staff("200") }, general("999"));
    expect(
      await resolveQuote(intoGeneral.message, member, target, new Set())
    ).toBeNull();

    const intoStaff = fakeSource("", { "200": general("200") }, staff("999"));
    expect(
      await resolveQuote(intoStaff.message, member, target, new Set())
    ).toBe(quoted);
  });

  describe("on a server where access goes through a member role", () => {
    const channel = (id: string, viewers: string[]) =>
      fakeChannel({
        id,
        guild: lockedServer,
        viewers,
        messages: { "300": quoted },
      });

    it("refuses a channel opened to an optional role unless that role is ignored", async () => {
      const { message } = fakeSource(
        "",
        { "200": channel("200", ["member", "staff"]) },
        channel("999", ["member", "player"])
      );
      expect(await resolveQuote(message, member, target, new Set())).toBeNull();
      expect(
        await resolveQuote(
          message,
          member,
          target,
          new Set(),
          new Set(["player"])
        )
      ).toBe(quoted);
    });

    it("ignores the roles managed by integrations", async () => {
      const { message } = fakeSource(
        "",
        { "200": channel("200", ["member"]) },
        channel("999", ["member", "music-bot"])
      );
      expect(await resolveQuote(message, member, target, new Set())).toBe(
        quoted
      );
    });

    it("lets administrators see every channel", async () => {
      const { message } = fakeSource(
        "",
        { "200": channel("200", ["staff"]) },
        channel("999", ["staff", "admin"])
      );
      expect(await resolveQuote(message, member, target, new Set())).toBe(
        quoted
      );
    });
  });

  it("refuses a channel whose history is hidden from the destination's public", async () => {
    const { message } = fakeSource("", {
      "200": fakeChannel({ hideHistory: true, messages: { "300": quoted } }),
    });
    expect(await resolveQuote(message, member, target, new Set())).toBeNull();
  });

  it("counts @everyone's access for every role", async () => {
    const { message } = fakeSource(
      "",
      { "200": fakeChannel({ messages: { "300": quoted } }) },
      fakeChannel({ id: "999", viewers: ["member"] })
    );
    expect(await resolveQuote(message, member, target, new Set())).toBe(quoted);
  });

  it("refuses a public thread of a private channel in a public channel", async () => {
    const { message } = fakeSource("", {
      "200": fakeChannel({
        thread: true,
        type: ChannelType.PublicThread,
        public: false,
        messages: { "300": quoted },
      }),
    });
    expect(await resolveQuote(message, member, target, new Set())).toBeNull();
  });

  it("quotes a private thread only inside that thread", async () => {
    const privateThread = (id: string) =>
      fakeChannel({
        id,
        thread: true,
        type: ChannelType.PrivateThread,
        threadMembers: [member.id],
        messages: { "300": quoted },
      });
    const elsewhere = fakeSource(
      "",
      { "200": privateThread("200") },
      fakeChannel({ id: "999", public: false })
    );
    expect(
      await resolveQuote(elsewhere.message, member, target, new Set())
    ).toBeNull();

    const inside = fakeSource(
      "",
      { "200": privateThread("200") },
      privateThread("200")
    );
    expect(await resolveQuote(inside.message, member, target, new Set())).toBe(
      quoted
    );
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

  it("does not reveal a link preview hidden behind a spoiler", () => {
    const embed = quoteEmbed(
      fakeQuoted({
        content: "||https://example.com/i.png||",
        embeds: [{ image: { url: "https://example.com/i.png" } }],
      }),
      member,
      t
    ).data;
    expect(embed.image).toBeUndefined();
  });

  it("uses the embed of a forwarded message without text", () => {
    const embed = quoteEmbed(
      fakeQuoted({
        snapshot: { content: "", embeds: [{ description: "forwarded embed" }] },
      }),
      member,
      t
    ).data;
    expect(embed.description).toBe("forwarded embed");
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

  it("keeps several long quotes under Discord's total embed size", () => {
    const longQuoter = {
      id: "1",
      displayName: "q".repeat(32),
    } as unknown as GuildMember;
    const reply = quoteReply(
      [1, 2, 3].map(() => fakeQuoted({ content: "a".repeat(4000) })),
      longQuoter,
      t
    );
    const total = reply.embeds
      .map((embed) => embed.data)
      .reduce(
        (sum, data) =>
          sum +
          (data.title?.length ?? 0) +
          (data.description?.length ?? 0) +
          (data.footer?.text.length ?? 0) +
          (data.author?.name.length ?? 0),
        0
      );
    expect(total).toBeLessThanOrEqual(6000);
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

  it("applies the ignored roles of the configuration", async () => {
    const channel = (id: string, viewers: string[]) =>
      fakeChannel({
        id,
        guild: lockedServer,
        viewers,
        messages: { "300": quoted },
      });
    const post = () =>
      fakeSource(
        link("200", "300"),
        { "200": channel("200", ["member"]) },
        channel("999", ["member", "player"])
      );

    const refused = post();
    await quoteLinks(refused.message, fakeConfig());
    expect(refused.reply).not.toHaveBeenCalled();

    const allowed = post();
    await quoteLinks(allowed.message, fakeConfig([], [], ["player"]));
    expect(allowed.reply).toHaveBeenCalledWith(
      expect.objectContaining({ failIfNotExists: false })
    );
  });

  it("ignores messages from an excluded category", async () => {
    const { message, reply } = fakeSource(link("200", "300"), {
      "200": fakeChannel({ parentId: "cat", messages: { "300": quoted } }),
    });
    await quoteLinks(message, fakeConfig([], ["cat"]));
    expect(reply).not.toHaveBeenCalled();
  });
});
