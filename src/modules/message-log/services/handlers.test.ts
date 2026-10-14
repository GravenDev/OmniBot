import { Collection, type Message, type PartialMessage } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import type { MessageLogConfigSchema } from "#modules/message-log/message-log.config.js";
import { logBulkDeletion, logDeletion, logEdit } from "./handlers.js";

const t = (key: string) => key;

function fakeSourceChannel(id = "200", parentId: string | null = null) {
  return { id, parentId, isThread: () => false };
}

function fakeConfig(
  options: { excluded?: string[]; logEdits?: boolean; noChannel?: boolean } = {}
) {
  const send = vi.fn(async () => ({}));
  const logChannel = { id: "log", isSendable: () => true, send };
  const values: Record<string, unknown> = {
    logChannel: options.noChannel ? undefined : logChannel,
    excludedChannels: (options.excluded ?? []).map((id) => ({ id })),
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
  it("logs a deleted message without pinging anyone", async () => {
    const { config, send } = fakeConfig();
    const lookup = vi.fn(async () => "7");
    await logDeletion(fakeMessage(), config, lookup);

    expect(lookup).toHaveBeenCalledWith({ id: "100" }, "42", "200");
    const [payload] = send.mock.calls[0] as unknown as [
      { embeds: { data: { description: string } }[]; allowedMentions: unknown },
    ];
    expect(payload.allowedMentions).toEqual({ parse: [] });
    expect(payload.embeds[0]!.data.description).toContain("deleted.by");
  });

  it("logs an uncached message without looking up the deleter", async () => {
    const { config, send } = fakeConfig();
    const lookup = vi.fn(async () => "7");
    await logDeletion(fakeMessage({ partial: true }), config, lookup);
    expect(lookup).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
  });

  it("ignores bots and webhooks", async () => {
    const { config, send } = fakeConfig();
    await logDeletion(fakeMessage({ bot: true }), config, noDeleter);
    await logDeletion(fakeMessage({ webhookId: "9" }), config, noDeleter);
    expect(send).not.toHaveBeenCalled();
  });

  it("ignores excluded channels, their category and the log channel", async () => {
    const { config, send } = fakeConfig({ excluded: ["cat"] });
    await logDeletion(
      fakeMessage({ channel: fakeSourceChannel("200", "cat") }),
      config,
      noDeleter
    );
    await logDeletion(
      fakeMessage({ channel: fakeSourceChannel("log") }),
      config,
      noDeleter
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing without a log channel", async () => {
    const { config, send } = fakeConfig({ noChannel: true });
    await logDeletion(fakeMessage(), config, noDeleter);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("logBulkDeletion", () => {
  it("logs a bulk deletion with its transcript", async () => {
    const { config, send } = fakeConfig();
    const messages = new Collection<string, Message | PartialMessage>([
      ["300", fakeMessage()],
    ]);
    await logBulkDeletion(messages, fakeSourceChannel() as never, config);
    const [payload] = send.mock.calls[0] as unknown as [{ files: unknown[] }];
    expect(payload.files).toHaveLength(1);
  });
});

describe("logEdit", () => {
  it("logs a changed content", async () => {
    const { config, send } = fakeConfig();
    await logEdit(
      fakeMessage({ content: "a" }),
      fakeMessage({ content: "b" }),
      config
    );
    expect(send).toHaveBeenCalledOnce();
  });

  it("ignores updates that keep the content, like an embed loading", async () => {
    const { config, send } = fakeConfig();
    await logEdit(fakeMessage(), fakeMessage(), config);
    expect(send).not.toHaveBeenCalled();
  });

  it("ignores edits of uncached messages and edits when disabled", async () => {
    const { config, send } = fakeConfig();
    await logEdit(fakeMessage({ partial: true }), fakeMessage(), config);
    const disabled = fakeConfig({ logEdits: false });
    await logEdit(
      fakeMessage({ content: "a" }),
      fakeMessage({ content: "b" }),
      disabled.config
    );
    expect(send).not.toHaveBeenCalled();
    expect(disabled.send).not.toHaveBeenCalled();
  });
});
