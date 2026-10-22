import {
  DiscordAPIError,
  type Message,
  type PartialMessage,
  PermissionFlagsBits,
  PermissionsBitField,
  RESTJSONErrorCodes,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import type { LatexConfigSchema } from "#modules/latex/latex.config.js";

const renderText = vi.hoisted(() => vi.fn());

vi.mock("#modules/latex/rendering/formula.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("#modules/latex/rendering/formula.js")
  >()),
  renderText,
}));

const { FormulaError } = await import("#modules/latex/rendering/formula.js");
const { looksLikeLatex, removeReply, renderEdited, renderPosted } =
  await import("./chat.js");

function makeConfig(values: Record<string, unknown> = {}) {
  const settings: Record<string, unknown> = {
    autoDetect: true,
    theme: "light",
    ...values,
  };
  return {
    get: (key: string) => settings[key],
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  } as unknown as ConfigProvider<LatexConfigSchema>;
}

let nextId = 0;

const REPLY_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
];

function makeChannel(permissions: bigint[] = REPLY_PERMISSIONS) {
  const sent = new Map<string, ReturnType<typeof makeReply>>();
  return {
    sent,
    isThread: () => false,
    permissionsFor: () => new PermissionsBitField(permissions),
    messages: {
      fetch: vi.fn(async (query: string | object) => {
        if (typeof query === "string") {
          const reply = sent.get(query);
          if (!reply) throw new Error("Unknown Message");
          return reply;
        }
        return [...sent.values()];
      }),
      delete: vi.fn(async (id: string) => {
        sent.delete(id);
      }),
    },
  };
}

function makeReply(
  id: string,
  referenceId: string,
  payload: { content?: string; files?: { name: string | null }[] }
) {
  return {
    id,
    payload,
    content: payload.content ?? "",
    attachments: (payload.files ?? []).map(({ name }) => ({ name })),
    author: { id: "bot" },
    reference: { messageId: referenceId },
    edit: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
}

function makeMessage(
  content: string,
  channel = makeChannel(),
  { bot = false, id = `m${++nextId}` } = {}
) {
  return {
    id,
    content,
    get cleanContent() {
      return this.content;
    },
    partial: false,
    editedTimestamp: Date.now() as number | null,
    channel,
    client: { user: { id: "bot" } },
    author: { bot },
    inGuild: () => true,
    reply: vi.fn(async (payload: Parameters<typeof makeReply>[2]) => {
      const reply = makeReply(`r${++nextId}`, id, payload);
      channel.sent.set(reply.id, reply);
      return reply;
    }),
  };
}

type FakeMessage = ReturnType<typeof makeMessage>;
const asMessage = (message: FakeMessage) => message as unknown as Message;
const asAny = (message: FakeMessage) =>
  message as unknown as Message | PartialMessage;

function onlyReply(message: FakeMessage) {
  const [reply] = message.channel.sent.values();
  return reply!;
}

beforeEach(() => {
  renderText.mockReset();
  renderText.mockResolvedValue(Buffer.from("png"));
});

describe("looksLikeLatex", () => {
  it.each([
    "Soit $x \\in \\mathbb{R}$, alors",
    "on a $f(x)=0$ donc",
    "$$\\frac{a}{b}$$",
    "Hello\n\\[\nA = \\{x\\}\n\\]",
    "Soit \\(x\\)",
    "\\begin{itemize} \\item a \\end{itemize}",
    "la variable $x$ est",
    "la norme $||x||$",
    "le triangle $ABC$",
    "on pose $x + 1$",
  ])("detects %j", (content) => {
    expect(looksLikeLatex(content)).toBe(true);
  });

  it.each([
    "Ça coûte 5$ ou 10$",
    "entre $5 et $10",
    "j'ai payé $20 et toi $30 ?",
    "le prix est de $15$ seulement",
    "pas de maths ici",
    "`$x$` dans du code",
    "```\n$$a$$\n```",
    "$$ $$",
    "||$x^2$|| en spoiler",
    "cp $SRC/$DST",
    "make $$ fast and earn $$$ today",
    "\\begin{tabular} sans formule",
    "echo $HOME:$PATH",
    "export PATH=$PATH:$HOME/bin",
    "echo $FOO$BAR",
    "PHP: $a=$b;",
    "I paid $5 for a sandwich and my friend paid 7$",
    "entre $5 et 10$ CAD",
    "rate $5/h or 6$/h",
    "\\[link\\](https://example.com)",
    "regex \\(foo\\)",
  ])("ignores %j", (content) => {
    expect(looksLikeLatex(content)).toBe(false);
  });
});

describe("renderPosted", () => {
  it("replies with the image, the text as its alt text, without pinging the author", async () => {
    const message = makeMessage("Soit $x$.");
    await renderPosted(asMessage(message), makeConfig());

    expect(renderText).toHaveBeenCalledWith("Soit $x$.", "light");
    const [payload] = message.reply.mock.calls[0]!;
    expect(payload).toMatchObject({
      content: "",
      allowedMentions: { parse: [], repliedUser: false },
    });
    const [file] = (payload as { files: { description: string }[] }).files;
    expect(file!.description).toBe("Soit $x$.");
  });

  it("explains an invalid text", async () => {
    renderText.mockRejectedValueOnce(new FormulaError("Missing }"));
    const message = makeMessage("$\\frac{a$");
    await renderPosted(asMessage(message), makeConfig());

    expect(message.reply.mock.calls[0]![0]).toMatchObject({
      content: 'chat.invalid {"error":"Missing }"}\nchat.hint',
      files: [],
    });
  });

  it("renders a whole message containing LaTeX with the configured theme", async () => {
    const message = makeMessage("Soit $x \\in E$, montrer que", makeChannel());
    await renderPosted(asMessage(message), makeConfig({ theme: "dark" }));

    expect(renderText).toHaveBeenCalledWith(
      "Soit $x \\in E$, montrer que",
      "dark"
    );
  });

  it("renders nothing when automatic detection is off", async () => {
    const message = makeMessage("Soit $x \\in E$");
    await renderPosted(asMessage(message), makeConfig({ autoDetect: false }));

    expect(message.reply).not.toHaveBeenCalled();
  });

  it("renders the mentions and custom emojis as names", async () => {
    const message = makeMessage("<@1> <:pi:42> $x$");
    Object.defineProperty(message, "cleanContent", {
      value: "@Alice <:pi:42> $x$",
    });
    await renderPosted(asMessage(message), makeConfig());

    expect(renderText).toHaveBeenCalledWith("@Alice :pi: $x$", "light");
  });

  it("renders the code as it is written", async () => {
    const message = makeMessage(
      "Soit $y^2$ :\n```bash\necho $x^$\n``` et `a_b`"
    );
    await renderPosted(asMessage(message), makeConfig());

    expect(renderText).toHaveBeenCalledWith(
      "Soit $y^2$ :\necho \\$x\\^{}\\$\n et a\\_b",
      "light"
    );
  });

  it("shortens a long MathJax error", async () => {
    renderText.mockRejectedValueOnce(new FormulaError("x".repeat(2000)));
    const message = makeMessage("$x$");
    await renderPosted(asMessage(message), makeConfig());

    const [payload] = message.reply.mock.calls[0]!;
    expect(payload.content!.length).toBeLessThan(400);
  });

  it("gives up quietly when the message was deleted meanwhile", async () => {
    const message = makeMessage("$x$");
    message.reply.mockRejectedValueOnce(
      new DiscordAPIError(
        { code: RESTJSONErrorCodes.UnknownMessage, message: "Unknown Message" },
        RESTJSONErrorCodes.UnknownMessage,
        404,
        "POST",
        "/channels/1/messages",
        {}
      )
    );

    await expect(
      renderPosted(asMessage(message), makeConfig())
    ).resolves.toBeUndefined();
  });

  it("stays silent where it cannot reply with an image", async () => {
    const channel = makeChannel([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
    ]);
    const message = makeMessage("$x$", channel);
    await renderPosted(asMessage(message), makeConfig());

    expect(message.reply).not.toHaveBeenCalled();
  });

  it("ignores messages without LaTeX and bots", async () => {
    const plain = makeMessage("Ça coûte 5$ ou 10$");
    const bot = makeMessage("$x$", makeChannel(), { bot: true });
    await renderPosted(asMessage(plain), makeConfig());
    await renderPosted(asMessage(bot), makeConfig());

    expect(plain.reply).not.toHaveBeenCalled();
    expect(bot.reply).not.toHaveBeenCalled();
  });
});

describe("renderEdited", () => {
  it("edits the reply when the text is fixed", async () => {
    renderText.mockRejectedValueOnce(new FormulaError("Missing }"));
    const message = makeMessage("$\\frac{a$");
    await renderPosted(asMessage(message), makeConfig());
    const before = { ...message };

    message.content = "$\\frac{a}{b}$";
    await renderEdited(asAny(before), asAny(message), makeConfig());

    const [payload] = onlyReply(message).edit.mock.calls[0]! as unknown as [
      { files: unknown[] },
    ];
    expect(payload).toMatchObject({ content: "", attachments: [] });
    expect(payload.files).toHaveLength(1);
  });

  it("deletes the reply when the LaTeX is removed", async () => {
    const message = makeMessage("$a$");
    await renderPosted(asMessage(message), makeConfig());
    const reply = onlyReply(message);
    const before = { ...message };

    message.content = "plus rien";
    await renderEdited(asAny(before), asAny(message), makeConfig());

    expect(reply.delete).toHaveBeenCalled();
  });

  it("replies when LaTeX is added to a message", async () => {
    const message = makeMessage("bientôt");
    const before = { ...message };

    message.content = "$a$";
    await renderEdited(asAny(before), asAny(message), makeConfig());

    expect(message.reply).toHaveBeenCalledTimes(1);
  });

  it("finds its earlier reply after a restart instead of posting another", async () => {
    const channel = makeChannel();
    const message = makeMessage("$b$", channel, { id: "forgotten" });
    const earlier = makeReply("old", "forgotten", {
      files: [{ name: "latex.png" }],
    });
    channel.sent.set("old", earlier);

    await renderEdited(
      { partial: true } as unknown as PartialMessage,
      asAny(message),
      makeConfig()
    );

    expect(earlier.edit).toHaveBeenCalled();
    expect(message.reply).not.toHaveBeenCalled();
  });

  it("leaves the replies of other modules alone", async () => {
    const channel = makeChannel();
    const message = makeMessage("$b$", channel, { id: "quoted" });
    const quote = makeReply("quote", "quoted", { content: "> citation" });
    channel.sent.set("quote", quote);

    await renderEdited(
      { partial: true } as unknown as PartialMessage,
      asAny(message),
      makeConfig()
    );

    expect(quote.edit).not.toHaveBeenCalled();
    expect(message.reply).toHaveBeenCalledTimes(1);
  });

  it("deletes a rendering still pending when the LaTeX is removed", async () => {
    let finish!: (png: Buffer) => void;
    renderText.mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve))
    );
    const message = makeMessage("$a$");
    const posted = renderPosted(asMessage(message), makeConfig());
    const before = { ...message };

    message.content = "oups";
    const edited = renderEdited(asAny(before), asAny(message), makeConfig());
    finish(Buffer.from("png"));
    await Promise.all([posted, edited]);

    expect(onlyReply(message).delete).toHaveBeenCalled();
  });

  it("ignores an update of an uncached message that was not just edited", async () => {
    const message = makeMessage("$b$");
    message.editedTimestamp = null;

    await renderEdited(
      { partial: true } as unknown as PartialMessage,
      asAny(message),
      makeConfig()
    );

    expect(message.channel.messages.fetch).not.toHaveBeenCalled();
    expect(message.reply).not.toHaveBeenCalled();
  });

  it("keeps the reply when it can no longer attach files", async () => {
    const channel = makeChannel();
    const message = makeMessage("$a$", channel);
    await renderPosted(asMessage(message), makeConfig());
    const before = { ...message };
    channel.permissionsFor = () =>
      new PermissionsBitField([PermissionFlagsBits.ViewChannel]);

    message.content = "$b$";
    await renderEdited(asAny(before), asAny(message), makeConfig());

    expect(onlyReply(message).edit).not.toHaveBeenCalled();
  });

  it("ignores an update that leaves the text unchanged", async () => {
    const message = makeMessage("$a$");
    await renderEdited(asAny(message), asAny(message), makeConfig());

    expect(renderText).not.toHaveBeenCalled();
    expect(message.channel.messages.fetch).not.toHaveBeenCalled();
  });
});

describe("removeReply", () => {
  it("deletes the rendering of a deleted message", async () => {
    const message = makeMessage("$a$");
    await renderPosted(asMessage(message), makeConfig());
    const reply = onlyReply(message);

    await removeReply(asAny(message));

    expect(message.channel.messages.delete).toHaveBeenCalledWith(reply.id);
  });

  it("deletes a rendering posted after the message was deleted", async () => {
    let finish!: (png: Buffer) => void;
    renderText.mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve))
    );
    const message = makeMessage("$a$");
    const posted = renderPosted(asMessage(message), makeConfig());
    const removed = removeReply(asAny(message));
    finish(Buffer.from("png"));
    await Promise.all([posted, removed]);

    expect(message.channel.messages.delete).toHaveBeenCalled();
  });
});
