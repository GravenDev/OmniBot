import {
  AttachmentBuilder,
  type Message,
  type PartialMessage,
  PermissionFlagsBits,
} from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import { KeyedQueue } from "#lib/keyed-queue.js";
import type { LatexConfigSchema } from "#modules/latex/latex.config.js";
import {
  FormulaError,
  INLINE_MATH,
  renderText,
} from "#modules/latex/rendering/formula.js";

const ALT_TEXT_MAX_LENGTH = 1024;
const REMEMBERED_REPLIES = 1000;
const REPLY_LOOKUP_LIMIT = 20;
const RENDERING_NAME = "latex.png";

const CODE = /```[\s\S]*?```|``[\s\S]*?``|`[^`\n]*`/g;
const SPOILER = /\|\|[\s\S]*?\|\|/;
const BLOCK_LATEX =
  /\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\\begin\{(?:itemize|enumerate|equation|align|alignat|gather|multline|flalign|eqnarray)\*?\}/;
const DISPLAY_LATEX = /\$\$([\s\S]*?)\$\$/g;
const INLINE_LATEX = new RegExp(INLINE_MATH.source, "g");
const TEX_SYNTAX = /[\\^_{}=]/;
const CUSTOM_EMOJI = /<a?(:\w+:)\d+>/g;

type Config = ConfigProvider<LatexConfigSchema>;
type AnyMessage = Message | PartialMessage;
type Payload = { content: string; files: AttachmentBuilder[] };

const queue = new KeyedQueue();
const replies = new Map<string, string>();

export function looksLikeLatex(content: string): boolean {
  const prose = content.replace(CODE, "");
  if (SPOILER.test(prose)) {
    return false;
  }
  return (
    BLOCK_LATEX.test(prose) ||
    [...prose.matchAll(DISPLAY_LATEX)].some(
      ([, tex]) => TEX_SYNTAX.test(tex!) || /^\s*\S+\s*$/.test(tex!)
    ) ||
    [...prose.matchAll(INLINE_LATEX)].some(([math]) => {
      const tex = math.slice(1, -1);
      return /[\\^_{}=a-zA-Z]/.test(tex) && !tex.endsWith("/");
    })
  );
}

function textToRender(message: Message, config: Config): string | null {
  if (!config.get("autoDetect") || !looksLikeLatex(message.content)) {
    return null;
  }
  return message.cleanContent.replace(CUSTOM_EMOJI, "$1").trim();
}

async function payloadFor(text: string, config: Config): Promise<Payload> {
  try {
    const image = await renderText(text, config.get("theme"));
    return {
      content: "",
      files: [
        new AttachmentBuilder(image, {
          name: RENDERING_NAME,
          description: text.slice(0, ALT_TEXT_MAX_LENGTH),
        }),
      ],
    };
  } catch (err) {
    if (!(err instanceof FormulaError)) {
      throw err;
    }
    return {
      content: [
        config.t("chat.invalid", { error: err.message }),
        config.t("chat.hint"),
      ].join("\n"),
      files: [],
    };
  }
}

function remember(messageId: string, replyId: string): void {
  replies.delete(messageId);
  replies.set(messageId, replyId);
  if (replies.size > REMEMBERED_REPLIES) {
    replies.delete(replies.keys().next().value!);
  }
}

function isRendering(candidate: Message, config: Config): boolean {
  return (
    candidate.attachments.some((file) => file.name === RENDERING_NAME) ||
    candidate.content.endsWith(config.t("chat.hint"))
  );
}

async function findReply(
  message: Message<true>,
  config: Config
): Promise<Message | null> {
  const known = replies.get(message.id);
  if (known) {
    return message.channel.messages.fetch(known).catch(() => null);
  }
  const later = await message.channel.messages
    .fetch({ after: message.id, limit: REPLY_LOOKUP_LIMIT })
    .catch(() => null);
  return (
    later?.find(
      (candidate) =>
        candidate.author.id === message.client.user.id &&
        candidate.reference?.messageId === message.id &&
        isRendering(candidate, config)
    ) ?? null
  );
}

function canReply(message: Message<true>): boolean {
  const permissions = message.channel.permissionsFor(message.client.user);
  return (
    permissions?.has([
      PermissionFlagsBits.ViewChannel,
      message.channel.isThread()
        ? PermissionFlagsBits.SendMessagesInThreads
        : PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.ReadMessageHistory,
    ]) ?? false
  );
}

async function reply(
  message: Message<true>,
  text: string,
  config: Config
): Promise<void> {
  if (!canReply(message)) {
    return;
  }
  const sent = await message.reply({
    ...(await payloadFor(text, config)),
    allowedMentions: { parse: [], repliedUser: false },
  });
  remember(message.id, sent.id);
}

function watches(message: Message): message is Message<true> {
  return !message.author.bot && message.inGuild();
}

export async function renderPosted(
  message: Message,
  config: Config | undefined
): Promise<void> {
  if (!config || !watches(message)) {
    return;
  }
  const text = textToRender(message, config);
  if (text) {
    await queue.run(message.id, () => reply(message, text, config));
  }
}

export async function renderEdited(
  before: AnyMessage,
  after: AnyMessage,
  config: Config | undefined
): Promise<void> {
  if (!config || (!before.partial && before.content === after.content)) {
    return;
  }
  const message = after.partial ? await after.fetch().catch(() => null) : after;
  if (!message || !watches(message)) {
    return;
  }
  const text = textToRender(message, config);
  const rendered =
    replies.has(message.id) ||
    (!before.partial && looksLikeLatex(before.content));
  if (!text && !rendered) {
    return;
  }

  await queue.run(message.id, async () => {
    const existing = await findReply(message, config);
    if (!existing) {
      if (text) {
        await reply(message, text, config);
      }
      return;
    }
    if (!text) {
      replies.delete(message.id);
      await existing.delete().catch(() => undefined);
      return;
    }
    remember(message.id, existing.id);
    await existing.edit({
      ...(await payloadFor(text, config)),
      attachments: [],
    });
  });
}

export async function removeReply(message: AnyMessage): Promise<void> {
  if (!message.inGuild()) {
    return;
  }
  await queue.run(message.id, async () => {
    const replyId = replies.get(message.id);
    if (!replyId) {
      return;
    }
    replies.delete(message.id);
    await message.channel.messages.delete(replyId).catch(() => undefined);
  });
}
