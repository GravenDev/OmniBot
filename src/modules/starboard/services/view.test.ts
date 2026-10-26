import { Collection, type Message, StickerFormatType } from "discord.js";
import { beforeAll, describe, expect, it } from "vitest";
import { createT } from "#lib/i18n.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import { initTestI18n } from "#lib/testing.js";
import en from "#modules/starboard/i18n/en.json" with { type: "json" };
import { counterLine, starboardMessage } from "./view.js";

const t = createT("en", "starboard");

beforeAll(async () => {
  await initTestI18n("starboard", { en });
});

function attachment(name: string, contentType: string, spoiler = false) {
  return {
    name,
    contentType,
    spoiler,
    url: `https://cdn.discordapp.com/attachments/1/2/${name}`,
  };
}

function fakeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    channelId: "general",
    content: "a very good message",
    createdAt: new Date(0),
    url: "https://discord.com/channels/g/general/m1",
    author: {
      id: "author",
      displayAvatarURL: () => "https://cdn.discordapp.com/avatars/author.png",
    },
    member: null,
    attachments: new Collection(),
    embeds: [],
    stickers: new Collection(),
    messageSnapshots: new Collection(),
    ...overrides,
  } as unknown as Message<true>;
}

function render(message: Message<true>, reply: Message | null = null) {
  const payload = starboardMessage(
    message,
    reply,
    { reactions: [{ emoji: "⭐", count: 4 }], total: 4 },
    "⭐",
    t
  );
  return { payload, json: JSON.stringify(payload.components) };
}

describe("counterLine", () => {
  it("shows the single emoji with its count", () => {
    expect(
      counterLine({ reactions: [{ emoji: "⭐", count: 3 }], total: 3 }, "⭐", t)
    ).toBe("⭐ **3**");
  });

  it("adds the member total when several emojis are counted", () => {
    expect(
      counterLine(
        {
          reactions: [
            { emoji: "⭐", count: 3 },
            { emoji: "🌟", count: 2 },
          ],
          total: 4,
        },
        "⭐",
        t
      )
    ).toBe("⭐ **3** · 🌟 **2** · **4** members");
  });

  it("falls back to the first configured emoji at zero", () => {
    expect(counterLine({ reactions: [], total: 0 }, "🌟", t)).toBe("🌟 **0**");
  });
});

describe("starboardMessage", () => {
  it("never pings anyone", () => {
    expect(render(fakeMessage()).payload.allowedMentions).toBe(NO_MENTIONS);
  });

  it("shows the author, channel, content and a link to the message", () => {
    const { json } = render(fakeMessage());

    expect(json).toContain("<@author> in <#general>");
    expect(json).toContain("a very good message");
    expect(json).toContain("https://discord.com/channels/g/general/m1");
    expect(json).toContain("Go to message");
  });

  it("truncates a long content", () => {
    const { json } = render(fakeMessage({ content: "x".repeat(3000) }));

    expect(json).not.toContain("x".repeat(1501));
    expect(json).toContain("…");
  });

  it("puts images in a gallery, keeping spoilers, and lists other files", () => {
    const files = [
      attachment("cat.png", "image/png", true),
      attachment("notes.pdf", "application/pdf"),
    ];
    const { json } = render(
      fakeMessage({
        attachments: new Collection(files.map((file) => [file.name, file])),
      })
    );

    expect(json).toContain('"spoiler":true');
    expect(json).toContain("cat.png");
    expect(json).toContain("📎 [notes.pdf]");
  });

  it("renders stickers, as text when Discord cannot show them as images", () => {
    const stickers = new Collection([
      [
        "s1",
        {
          name: "wave",
          format: StickerFormatType.PNG,
          url: "https://media.discordapp.net/stickers/s1.png",
        },
      ],
      [
        "s2",
        {
          name: "dance",
          format: StickerFormatType.Lottie,
          url: "https://media.discordapp.net/stickers/s2.json",
        },
      ],
    ]);
    const { json } = render(fakeMessage({ content: "", stickers }));

    expect(json).toContain("stickers/s1.png");
    expect(json).toContain("Sticker: dance");
    expect(json).not.toContain("s2.json");
  });

  it("quotes the embeds of the message", () => {
    const embed = {
      title: "Release",
      description: "v2 is out",
      data: { type: "rich" },
      image: { url: "https://example.com/banner.png" },
    };
    const { json } = render(fakeMessage({ embeds: [embed] }));

    expect(json).toContain("> **Release**\\n> v2 is out");
    expect(json).toContain("https://example.com/banner.png");
  });

  it("shows the message being replied to", () => {
    const reply = fakeMessage({
      id: "m0",
      author: { id: "other" },
      content: "the question\nover two lines",
    }) as unknown as Message;

    const { json } = render(fakeMessage(), reply);

    expect(json).toContain(
      "↪ Replying to <@other>: the question over two lines"
    );
  });

  it("shows the content of a forwarded message", () => {
    const snapshot = {
      content: "forwarded words",
      attachments: new Collection(),
      embeds: [],
      stickers: new Collection(),
    };
    const { json } = render(
      fakeMessage({
        content: "",
        messageSnapshots: new Collection([["s", snapshot]]),
      })
    );

    expect(json).toContain("Forwarded message");
    expect(json).toContain("forwarded words");
  });

  it("stays within Discord's 4000 characters of text", () => {
    const longUrl = (name: string) =>
      `https://cdn.discordapp.com/attachments/1/2/${name}?${"x".repeat(1000)}`;
    const files = ["a.pdf", "b.pdf", "c.pdf", "d.pdf"].map((name) => ({
      ...attachment(name, "application/pdf"),
      url: longUrl(name),
    }));
    const embed = {
      title: "T",
      description: "line\n".repeat(300),
      data: { type: "rich" },
    };
    const reply = fakeMessage({
      author: { id: "other" },
      content: "r".repeat(500),
    }) as unknown as Message;

    const { payload } = render(
      fakeMessage({
        content: "c".repeat(4000),
        embeds: [embed, embed],
        attachments: new Collection(files.map((file) => [file.name, file])),
      }),
      reply
    );

    const texts: string[] = [];
    const collect = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(collect);
      } else if (node && typeof node === "object") {
        const record = node as Record<string, unknown>;
        if (record["type"] === 10 && typeof record["content"] === "string") {
          texts.push(record["content"]);
        }
        Object.values(record).forEach(collect);
      }
    };
    collect(payload.components.map((component) => component.toJSON()));

    expect(texts.join("").length).toBeLessThanOrEqual(4000);
  });
});
