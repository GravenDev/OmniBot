import {
  ChannelType,
  Collection,
  DiscordAPIError,
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField,
  RESTJSONErrorCodes,
  type GuildBasedChannel,
  type Message,
} from "discord.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import core from "#core/i18n/en.json" with { type: "json" };
import { isNsfw } from "#lib/channel-audience.js";
import type { ConfigProvider } from "#lib/config.js";
import { createT } from "#lib/i18n.js";
import { initTestI18n, silenceLogs } from "#lib/testing.js";
import en from "#modules/message-quote/i18n/en.json" with { type: "json" };
import type { MessageQuoteConfigSchema } from "#modules/message-quote/message-quote.config.js";
import {
  alone,
  fakeQuoted,
  member,
} from "#modules/message-quote/quote.fakes.js";
import { quoteReply } from "#modules/message-quote/quote.js";
import quoteService from "./quote.service.js";

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

function fakeSource(
  content: string,
  channels: Record<string, GuildBasedChannel>,
  channel: GuildBasedChannel = fakeChannel({
    id: "999",
    permissions: [...READ, PermissionFlagsBits.SendMessages],
  })
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
      members: { me: { id: "bot" }, fetch: async () => member },
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
    expect(await quoteService.canRead(member, fakeChannel())).toBe(true);
    expect(
      await quoteService.canRead(
        member,
        fakeChannel({ permissions: [PermissionFlagsBits.ViewChannel] })
      )
    ).toBe(false);
    expect(
      await quoteService.canRead(member, fakeChannel({ permissions: [] }))
    ).toBe(false);
  });

  it("requires membership of a private thread", async () => {
    const privateThread = (threadMembers: string[]) =>
      fakeChannel({
        thread: true,
        type: ChannelType.PrivateThread,
        threadMembers,
      });
    expect(await quoteService.canRead(member, privateThread([]))).toBe(false);
    expect(await quoteService.canRead(member, privateThread([member.id]))).toBe(
      true
    );
  });

  it("asks Discord instead of trusting a stale thread member cache", async () => {
    const channel = fakeChannel({
      thread: true,
      type: ChannelType.PrivateThread,
      cachedThreadMembers: [member.id],
    });
    expect(await quoteService.canRead(member, channel)).toBe(false);
  });

  it("lets thread managers read private threads", async () => {
    const channel = fakeChannel({
      thread: true,
      type: ChannelType.PrivateThread,
      permissions: [...READ, PermissionFlagsBits.ManageThreads],
    });
    expect(await quoteService.canRead(member, channel)).toBe(true);
  });
});

describe("resolveQuote", () => {
  const quoted = fakeQuoted({ content: "hello" });
  const target = { channelId: "200", messageId: "300" };

  it("returns the linked message when the member can read it", async () => {
    const { message } = fakeSource("", {
      "200": fakeChannel({ messages: { "300": quoted } }),
    });
    expect(
      await quoteService.resolveQuote(message, member, target, new Set())
    ).toBe(quoted);
  });

  it("refuses a channel the member cannot read", async () => {
    const { message } = fakeSource("", {
      "200": fakeChannel({ permissions: [], messages: { "300": quoted } }),
    });
    expect(
      await quoteService.resolveQuote(message, member, target, new Set())
    ).toBeNull();
  });

  it("refuses to bring a NSFW message into a SFW channel", async () => {
    const { message } = fakeSource("", {
      "200": fakeChannel({ nsfw: true, messages: { "300": quoted } }),
    });
    expect(
      await quoteService.resolveQuote(message, member, target, new Set())
    ).toBeNull();
  });

  it("allows a NSFW message in a NSFW channel", async () => {
    const { message } = fakeSource(
      "",
      { "200": fakeChannel({ nsfw: true, messages: { "300": quoted } }) },
      fakeChannel({ id: "999", nsfw: true })
    );
    expect(
      await quoteService.resolveQuote(message, member, target, new Set())
    ).toBe(quoted);
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
    // The premise: @everyone cannot see the source, and sees the destination.
    const hiddenFromEveryone = (channel: GuildBasedChannel) =>
      (channel as any).permissionOverwrites.cache
        .get(GUILD)
        ?.deny.has(PermissionFlagsBits.ViewChannel) ?? false;
    expect(hiddenFromEveryone(staff)).toBe(true);
    expect(hiddenFromEveryone(general)).toBe(false);
    const { message } = fakeSource("", { "200": staff }, general);
    expect(
      await quoteService.resolveQuote(message, member, target, new Set())
    ).toBe(quoted);
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
    expect(
      await quoteService.resolveQuote(inside.message, member, target, new Set())
    ).toBe(quoted);

    const outsider = fakeSource("", { "200": privateThread([]) });
    expect(
      await quoteService.resolveQuote(
        outsider.message,
        member,
        target,
        new Set()
      )
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
    expect(
      await quoteService.resolveQuote(message, member, target, new Set())
    ).toBeNull();
    expect(
      await quoteService.resolveQuote(
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
      components: [
        quoteReply([alone(quoted)], member, t).components[0]!.toJSON(),
      ],
    });
    const { message } = fakeSource("", {
      "200": fakeChannel({ messages: { "300": ownQuote } }),
    });
    expect(
      await quoteService.resolveQuote(message, member, target, new Set())
    ).toBeNull();
  });

  it("quotes a member's message even if it carries a quote button id", async () => {
    const lookalike = fakeQuoted({
      authorId: "2",
      buttonIds: ["message-quote:1:2"],
    });
    const { message } = fakeSource("", {
      "200": fakeChannel({ messages: { "300": lookalike } }),
    });
    expect(
      await quoteService.resolveQuote(message, member, target, new Set())
    ).toBe(lookalike);
  });

  it("refuses an excluded channel", async () => {
    const { message } = fakeSource("", {
      "200": fakeChannel({ messages: { "300": quoted } }),
    });
    expect(
      await quoteService.resolveQuote(message, member, target, new Set(["200"]))
    ).toBeNull();
  });

  it("returns null for an unknown channel or message", async () => {
    const { message } = fakeSource("", { "200": fakeChannel() });
    expect(
      await quoteService.resolveQuote(message, member, target, new Set())
    ).toBeNull();
    expect(
      await quoteService.resolveQuote(
        message,
        member,
        { channelId: "404", messageId: "1" },
        new Set()
      )
    ).toBeNull();
  });
});

describe("quoteLinks", () => {
  const quoted = fakeQuoted({ content: "hello" });

  const sentJson = (reply: ReturnType<typeof vi.fn>) => {
    const [payload] = reply.mock.calls[0] as unknown as [
      { components: { toJSON(): unknown }[] },
    ];
    return JSON.stringify(payload.components.map((c) => c.toJSON()));
  };

  it("replies with the quotes the member may read", async () => {
    const { message, reply } = fakeSource(
      `${link("200", "300")} ${link("201", "301")}`,
      {
        "200": fakeChannel({ messages: { "300": quoted } }),
        "201": fakeChannel({ permissions: [], messages: { "301": quoted } }),
      }
    );
    await quoteService.quoteLinks(message, fakeConfig());
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
    await quoteService.quoteLinks(message, fakeConfig());
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

  it("shows the message a quoted reply answers", async () => {
    const question = fakeQuoted({ authorId: "3", content: "the question?" });
    const answer = fakeQuoted({
      content: "the answer",
      fetchReference: async () => question,
    });
    const { message, reply } = fakeSource(link("200", "300"), {
      "200": fakeChannel({ messages: { "300": answer } }),
    });
    await quoteService.quoteLinks(message, fakeConfig());
    expect(sentJson(reply)).toContain("> -# ↪ <@3>: the question?");
    expect(sentJson(reply)).toContain("the answer");
  });

  it("quotes a reply without the message it answers once that is gone", async () => {
    const answer = fakeQuoted({
      content: "the answer",
      fetchReference: async () => {
        throw new Error("Unknown Message");
      },
    });
    const { message, reply } = fakeSource(link("200", "300"), {
      "200": fakeChannel({ messages: { "300": answer } }),
    });
    await quoteService.quoteLinks(message, fakeConfig());
    expect(reply).toHaveBeenCalledOnce();
    expect(sentJson(reply)).toContain("the answer");
    expect(sentJson(reply)).not.toContain("↪");
  });

  it("fetches the messages several quoted replies answer together", async () => {
    // Each fetch waits for the other to start: in sequence, neither would end.
    let started = 0;
    let release!: () => void;
    const bothStarted = new Promise<void>((resolve) => (release = resolve));
    const answering = (authorId: string, content: string) =>
      fakeQuoted({
        content: `re: ${content}`,
        fetchReference: async () => {
          if (++started === 2) release();
          await bothStarted;
          return fakeQuoted({ authorId, content });
        },
      });
    const { message, reply } = fakeSource(
      `${link("200", "300")} ${link("200", "301")}`,
      {
        "200": fakeChannel({
          messages: {
            "300": answering("3", "first question"),
            "301": answering("4", "second question"),
          },
        }),
      }
    );
    await quoteService.quoteLinks(message, fakeConfig());
    const json = sentJson(reply);
    expect(json).toContain("↪ <@3>: first question");
    expect(json).toContain("↪ <@4>: second question");
  });

  it("does not retry another error", async () => {
    const { message, reply } = fakeSource(link("200", "300"), {
      "200": fakeChannel({ messages: { "300": quoted } }),
    });
    reply.mockRejectedValueOnce(new Error("boom"));
    await expect(
      quoteService.quoteLinks(message, fakeConfig())
    ).rejects.toThrow("boom");
    expect(reply).toHaveBeenCalledOnce();
  });

  it("does not try to reply where it cannot post", async () => {
    const fetchChannel = vi.fn();
    const { message, reply } = fakeSource(
      link("200", "300"),
      { "200": fakeChannel({ messages: { "300": quoted } }) },
      fakeChannel({ id: "999", permissions: READ })
    );
    message.guild.channels.fetch = fetchChannel;
    await quoteService.quoteLinks(message, fakeConfig());
    expect(fetchChannel).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
  });

  it("stays silent when nothing can be quoted", async () => {
    const { message, reply } = fakeSource(link("200", "300"), {
      "200": fakeChannel({ permissions: [], messages: { "300": quoted } }),
    });
    await quoteService.quoteLinks(message, fakeConfig());
    expect(reply).not.toHaveBeenCalled();
  });

  it("ignores links posted in an excluded channel", async () => {
    const { message, reply } = fakeSource(link("200", "300"), {
      "200": fakeChannel({ messages: { "300": quoted } }),
    });
    await quoteService.quoteLinks(message, fakeConfig(["999"]));
    expect(reply).not.toHaveBeenCalled();
  });

  it("ignores messages from an excluded category", async () => {
    const { message, reply } = fakeSource(link("200", "300"), {
      "200": fakeChannel({ parentId: "cat", messages: { "300": quoted } }),
    });
    await quoteService.quoteLinks(message, fakeConfig([], ["cat"]));
    expect(reply).not.toHaveBeenCalled();
  });
});
