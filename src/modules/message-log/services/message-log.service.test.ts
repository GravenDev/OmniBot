import {
  ChannelType,
  Collection,
  type Message,
  type PartialMessage,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import type { MessageLogConfigSchema } from "#modules/message-log/message-log.config.js";
import deleterFinder from "./audit.service.js";
import messageLog from "./message-log.service.js";

const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("#lib/logger.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#lib/logger.js")>()),
  loggerMaker: () => logger,
}));

const t = (key: string) => key;

function fakeSourceChannel(
  id = "200",
  parentId: string | null = null,
  threadCategoryId?: string,
  type: ChannelType = ChannelType.GuildText
) {
  return {
    id,
    type,
    parentId,
    parent: threadCategoryId ? { parentId: threadCategoryId } : null,
    isThread: () => threadCategoryId !== undefined,
    guild: { roles: { cache: new Collection() } },
  };
}

function fakeConfig(
  options: {
    excluded?: string[];
    excludedCategories?: string[];
    logEdits?: boolean;
    noChannel?: boolean;
    botPermissions?: bigint[];
  } = {}
) {
  const send = vi.fn(async () => ({}));
  const granted = new PermissionsBitField(
    options.botPermissions ?? PermissionsBitField.All
  );
  const logChannel = {
    id: "log",
    isSendable: () => true,
    isDMBased: () => false,
    guild: { members: { me: { id: "bot" } } },
    permissionsFor: () => granted,
    send,
  };
  const values: Record<string, unknown> = {
    logChannel: options.noChannel ? undefined : logChannel,
    excludedChannels: (options.excluded ?? []).map((id) => ({ id })),
    excludedCategories: (options.excludedCategories ?? []).map((id) => ({
      id,
    })),
    logEdits: options.logEdits ?? true,
  };
  const config = {
    t,
    get: (key: string) => values[key],
  } as unknown as ConfigProvider<MessageLogConfigSchema>;
  return { config, send };
}

function fakeMessage(
  options: {
    content?: string;
    bot?: boolean;
    webhookId?: string;
    system?: boolean;
    partial?: boolean;
    channel?: ReturnType<typeof fakeSourceChannel>;
  } = {}
) {
  const channel = options.channel ?? fakeSourceChannel();
  return {
    id: "300",
    channelId: channel.id,
    channel,
    guild: { id: "100" },
    partial: options.partial ?? false,
    content: options.partial ? null : (options.content ?? "hello"),
    createdTimestamp: 0,
    url: "https://discord.com/channels/100/200/300",
    webhookId: options.webhookId ?? null,
    system: options.system ?? false,
    attachments: new Collection(),
    author: options.partial
      ? null
      : {
          id: "42",
          username: "user",
          bot: options.bot ?? false,
          displayAvatarURL: () => "https://cdn/avatar.png",
        },
    inGuild: () => true,
  } as unknown as Message;
}

const noDeleter = vi.fn(async () => null);

describe("logDeletion", () => {
  it("asks the audit log who deleted the message, by default", async () => {
    const { config, send } = fakeConfig();
    const find = vi.spyOn(deleterFinder, "find").mockResolvedValueOnce("7");
    await messageLog.logDeletion(fakeMessage(), config);
    expect(find).toHaveBeenCalledWith({ id: "100" }, "42", "200");
    expect(JSON.stringify(send.mock.calls[0])).toContain("deleted.by");
    find.mockRestore();
  });

  it("logs a deleted message without pinging anyone", async () => {
    const { config, send } = fakeConfig();
    const lookup = vi.fn(async () => "7");
    await messageLog.logDeletion(fakeMessage(), config, lookup);

    expect(lookup).toHaveBeenCalledWith({ id: "100" }, "42", "200");
    const [payload] = send.mock.calls[0] as unknown as [
      { embeds: { data: { description: string } }[]; allowedMentions: unknown },
    ];
    expect(payload.allowedMentions).toEqual({ parse: [] });
    expect(payload.embeds[0]!.data.description).toContain("deleted.by");
  });

  it("sends the full text of a deletion too long for the embed", async () => {
    const { config, send } = fakeConfig();
    await messageLog.logDeletion(
      fakeMessage({ content: "a".repeat(4090) }),
      config,
      noDeleter
    );
    const [payload] = send.mock.calls[0] as unknown as [{ files: unknown[] }];
    expect(payload.files).toHaveLength(1);
  });

  it("ignores uncached messages, bots, webhooks and system messages", async () => {
    const { config, send } = fakeConfig();
    await messageLog.logDeletion(
      fakeMessage({ partial: true }),
      config,
      noDeleter
    );
    await messageLog.logDeletion(fakeMessage({ bot: true }), config, noDeleter);
    await messageLog.logDeletion(
      fakeMessage({ webhookId: "9" }),
      config,
      noDeleter
    );
    await messageLog.logDeletion(
      fakeMessage({ system: true }),
      config,
      noDeleter
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("ignores excluded channels and the log channel", async () => {
    const { config, send } = fakeConfig({ excluded: ["200"] });
    await messageLog.logDeletion(fakeMessage(), config, noDeleter);
    await messageLog.logDeletion(
      fakeMessage({ channel: fakeSourceChannel("log") }),
      config,
      noDeleter
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("ignores channels and threads of an excluded category", async () => {
    const { config, send } = fakeConfig({ excludedCategories: ["cat"] });
    await messageLog.logDeletion(
      fakeMessage({ channel: fakeSourceChannel("200", "cat") }),
      config,
      noDeleter
    );
    await messageLog.logDeletion(
      fakeMessage({ channel: fakeSourceChannel("thread", "201", "cat") }),
      config,
      noDeleter
    );
    expect(send).not.toHaveBeenCalled();
    await messageLog.logDeletion(
      fakeMessage({ channel: fakeSourceChannel("thread", "201", "other") }),
      config,
      noDeleter
    );
    expect(send).toHaveBeenCalledOnce();
  });

  it("does nothing without a log channel", async () => {
    const { config, send } = fakeConfig({ noChannel: true });
    await messageLog.logDeletion(fakeMessage(), config, noDeleter);
    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing, not even an audit lookup, when the bot cannot post", async () => {
    const { config, send } = fakeConfig({
      botPermissions: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.EmbedLinks,
      ],
    });
    const lookup = vi.fn(async () => null);
    await messageLog.logDeletion(fakeMessage(), config, lookup);
    expect(lookup).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("drops the attached file when the bot cannot attach files", async () => {
    const { config, send } = fakeConfig({
      botPermissions: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ],
    });
    await messageLog.logDeletion(
      fakeMessage({ content: "a".repeat(4090) }),
      config,
      noDeleter
    );
    const [payload] = send.mock.calls[0] as unknown as [{ files: unknown[] }];
    expect(payload.files).toHaveLength(0);
  });

  it("shows the content of a channel more private than the log channel", async () => {
    const { config, send } = fakeConfig();
    await messageLog.logDeletion(
      fakeMessage({
        content: "secret plan",
        channel: fakeSourceChannel(
          "thread",
          "201",
          "cat",
          ChannelType.PrivateThread
        ),
      }),
      config,
      noDeleter
    );
    const [payload] = send.mock.calls[0] as unknown as [
      { embeds: { data: { description: string } }[] },
    ];
    expect(payload.embeds[0]!.data.description).toContain("secret plan");
  });
});

describe("logBulkDeletion", () => {
  const messages = () =>
    new Collection<string, Message | PartialMessage>([["300", fakeMessage()]]);

  it("logs a bulk deletion with its transcript", async () => {
    const { config, send } = fakeConfig();
    await messageLog.logBulkDeletion(
      messages(),
      fakeSourceChannel() as never,
      config
    );
    const [payload] = send.mock.calls[0] as unknown as [{ files: unknown[] }];
    expect(payload.files).toHaveLength(1);
  });

  it("ignores a bulk deletion in an excluded channel", async () => {
    const { config, send } = fakeConfig({ excluded: ["200"] });
    await messageLog.logBulkDeletion(
      messages(),
      fakeSourceChannel() as never,
      config
    );
    expect(send).not.toHaveBeenCalled();
  });
});

describe("logEdit", () => {
  it("logs a changed content", async () => {
    const { config, send } = fakeConfig();
    await messageLog.logEdit(
      fakeMessage({ content: "a" }),
      fakeMessage({ content: "b" }),
      config
    );
    expect(send).toHaveBeenCalledOnce();
  });

  it("shows both versions of an edit in a more private channel", async () => {
    const { config, send } = fakeConfig();
    const channel = fakeSourceChannel(
      "thread",
      "201",
      "cat",
      ChannelType.PrivateThread
    );
    await messageLog.logEdit(
      fakeMessage({ content: "a", channel }),
      fakeMessage({ content: "b", channel }),
      config
    );
    const [payload] = send.mock.calls[0] as unknown as [
      { embeds: { data: { fields?: unknown[] } }[] },
    ];
    expect(payload.embeds[0]!.data.fields).toHaveLength(2);
  });

  it("ignores updates that keep the content, like an embed loading", async () => {
    const { config, send } = fakeConfig();
    await messageLog.logEdit(fakeMessage(), fakeMessage(), config);
    expect(send).not.toHaveBeenCalled();
  });

  it("ignores edits when either side is uncached", async () => {
    const { config, send } = fakeConfig();
    await messageLog.logEdit(
      fakeMessage({ partial: true }),
      fakeMessage(),
      config
    );
    await messageLog.logEdit(
      fakeMessage({ content: "a" }),
      fakeMessage({ partial: true }),
      config
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("ignores edits by bots, webhooks, system messages and excluded channels", async () => {
    const { config, send } = fakeConfig({ excludedCategories: ["cat"] });
    const edited = (options: Parameters<typeof fakeMessage>[0]) =>
      messageLog.logEdit(
        fakeMessage({ ...options, content: "a" }),
        fakeMessage({ ...options, content: "b" }),
        config
      );
    await edited({ bot: true });
    await edited({ webhookId: "9" });
    await edited({ system: true });
    await edited({ channel: fakeSourceChannel("200", "cat") });
    await edited({ channel: fakeSourceChannel("log") });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["edit logging disabled", { logEdits: false }, {}, {}],
    ["uncached message", {}, { partial: true }, {}],
    ["uncached message", {}, {}, { partial: true }],
    ["not a member text change", {}, { bot: true }, {}],
    ["not a member text change", {}, { content: "b" }, {}],
  ])(
    "says why an edit is not logged: %s",
    async (reason, options, before, after) => {
      logger.debug.mockClear();
      const { config } = fakeConfig(options);
      await messageLog.logEdit(
        fakeMessage({ content: "a", ...before }),
        fakeMessage({ content: "b", ...after }),
        config
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining(`Edit not logged | reason = ${reason} |`)
      );
    }
  );

  it("ignores edits when disabled", async () => {
    const { config, send } = fakeConfig({ logEdits: false });
    await messageLog.logEdit(
      fakeMessage({ content: "a" }),
      fakeMessage({ content: "b" }),
      config
    );
    expect(send).not.toHaveBeenCalled();
  });
});
