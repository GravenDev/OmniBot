import {
  AttachmentBuilder,
  DiscordAPIError,
  type Message,
  type PartialMessage,
  RESTJSONErrorCodes,
} from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import { KeyedQueue } from "#lib/keyed-queue.js";
import { NO_MENTIONS_REPLY } from "#lib/mentions.js";
import { canReplyWithFile } from "#lib/permissions.js";
import type { LatexConfigSchema } from "#modules/latex/latex.config.js";
import {
  FormulaError,
  INLINE_MATH,
  literal,
  renderText,
} from "#modules/latex/rendering/formula.js";

const ALT_TEXT_MAX_LENGTH = 1024;
const REMEMBERED_REPLIES = 1000;
const REPLY_LOOKUP_LIMIT = 20;
const RENDERING_NAME = "latex.png";

const ERROR_MAX_LENGTH = 300;
const EDIT_WINDOW_MS = 60_000;

const CODE = /```(?:[\w+-]*\n)?([\s\S]*?)```|``([\s\S]*?)``|`([^`\n]*)`/g;
const SPOILER = /\|\|[\s\S]*?\|\|/;
const ENVIRONMENT =
  /\\begin\{(?:itemize|enumerate|equation|align|alignat|gather|multline|flalign|eqnarray)\*?\}/;
const BRACKET_LATEX = /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;
const DISPLAY_LATEX = /\$\$([\s\S]*?)\$\$/g;
const INLINE_LATEX = new RegExp(INLINE_MATH.source, "g");
const TEX_SYNTAX = /[\\^_{}=]/;
const PROSE_WORD = /(?:^|\s)[a-zA-ZÀ-ÿ]{3,}(?:\s|$)/;
const CUSTOM_EMOJI = /<a?(:\w+:)\d+>/g;
const GONE_ERRORS = new Set<number | string>([
  RESTJSONErrorCodes.UnknownMessage,
  RESTJSONErrorCodes.MissingAccess,
  RESTJSONErrorCodes.MissingPermissions,
]);

type Config = ConfigProvider<LatexConfigSchema>;
type AnyMessage = Message | PartialMessage;
type Payload = { content: string; files: AttachmentBuilder[] };

const queue = new KeyedQueue();
const replies = new Map<string, string>();

function isInlineMath(tex: string): boolean {
  if (!/[\\^_{}=a-zA-Z]/.test(tex)) {
    return false;
  }
  if (TEX_SYNTAX.test(tex) || !/\s/.test(tex)) {
    return true;
  }
  return !/^\d[\s\S]*\d$/.test(tex) && !PROSE_WORD.test(tex);
}

function isBracketMath(tex: string): boolean {
  return /[\\^_{}=+\-*/<>\d]/.test(tex) || /^\s*[a-zA-Z]{1,2}\s*$/.test(tex);
}

export function looksLikeLatex(content: string): boolean {
  const prose = content.replace(CODE, "");
  if (SPOILER.test(prose.replace(INLINE_LATEX, ""))) {
    return false;
  }
  return (
    ENVIRONMENT.test(prose) ||
    [...prose.matchAll(BRACKET_LATEX)].some(([, display, inline]) =>
      isBracketMath(display ?? inline!)
    ) ||
    [...prose.matchAll(DISPLAY_LATEX)].some(
      ([, tex]) => TEX_SYNTAX.test(tex!) || /^\s*\S+\s*$/.test(tex!)
    ) ||
    [...prose.matchAll(INLINE_LATEX)].some(([math]) =>
      isInlineMath(math.slice(1, -1))
    )
  );
}

function textToRender(message: Message, config: Config): string | null {
  if (!config.get("autoDetect") || !looksLikeLatex(message.content)) {
    return null;
  }
  return message.cleanContent
    .replace(CUSTOM_EMOJI, "$1")
    .replace(CODE, (_, block, double, single) =>
      literal(block ?? double ?? single)
    )
    .trim();
}

function ignoreGone(err: unknown): null {
  if (err instanceof DiscordAPIError && GONE_ERRORS.has(err.code)) {
    return null;
  }
  throw err;
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
        config.t("chat.invalid", {
          error:
            err.message.length > ERROR_MAX_LENGTH
              ? `${err.message.slice(0, ERROR_MAX_LENGTH)}…`
              : err.message,
        }),
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

async function reply(
  message: Message<true>,
  text: string,
  config: Config
): Promise<void> {
  if (!canReplyWithFile(message)) {
    return;
  }
  const sent = await message
    .reply({
      ...(await payloadFor(text, config)),
      allowedMentions: NO_MENTIONS_REPLY,
    })
    .catch(ignoreGone);
  if (sent) {
    remember(message.id, sent.id);
  }
}

function editedRecently(message: Message): boolean {
  return (
    message.editedTimestamp !== null &&
    Date.now() - message.editedTimestamp < EDIT_WINDOW_MS
  );
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
  if (
    !message ||
    !watches(message) ||
    (before.partial && !editedRecently(message))
  ) {
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
    if (!canReplyWithFile(message)) {
      return;
    }
    await existing
      .edit({ ...(await payloadFor(text, config)), attachments: [] })
      .catch(ignoreGone);
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
