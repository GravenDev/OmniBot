import {
  ButtonStyle,
  Collection,
  ComponentType,
  type Message,
  MessageFlags,
  StickerFormatType,
} from "discord.js";
import { beforeAll, describe, expect, it } from "vitest";
import core from "#core/i18n/en.json" with { type: "json" };
import { createT } from "#lib/i18n.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import { initTestI18n } from "#lib/testing.js";
import en from "#modules/starboard/i18n/en.json" with { type: "json" };
import { counterLine, starboardMessage } from "./view.js";

const t = createT("en", "starboard");

beforeAll(async () => {
  await initTestI18n("core", { en: core });
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
  it("shows the text and image of a message laid out with components", () => {
    const { json } = render(
      fakeMessage({
        content: "",
        components: [
          { type: 10, content: "🎂 **Joyeux anniversaire !**" },
          { type: 12, items: [{ media: { url: "https://cdn/card.webp" } }] },
          { type: 10, content: "<@1>" },
        ],
      })
    );
    expect(json).toContain("🎂 **Joyeux anniversaire !**\\n<@1>");
    expect(json).toContain("https://cdn/card.webp");
  });

  it("shows a forwarded message laid out with components", () => {
    const { json } = render(
      fakeMessage({
        content: "",
        messageSnapshots: new Collection([
          [
            "s",
            fakeMessage({
              content: "",
              components: [
                { type: 10, content: "🎂 forwarded" },
                {
                  type: 12,
                  items: [{ media: { url: "https://cdn/card.webp" } }],
                },
              ],
            }),
          ],
        ]),
      })
    );
    expect(json).toContain("🎂 forwarded");
    expect(json).toContain("https://cdn/card.webp");
  });

  it("shows an uploaded image once, with the spoiler of its gallery", () => {
    const card = {
      id: "a1",
      ...attachment("card.png", "image/png"),
    };
    const { payload } = render(
      fakeMessage({
        content: "",
        attachments: new Collection([["a1", card]]),
        components: [
          {
            type: 12,
            items: [
              {
                media: { url: card.url, attachment_id: "a1" },
                spoiler: true,
              },
            ],
          },
        ],
      })
    );
    const items = JSON.stringify(payload.components).match(/card\.png/g);
    expect(items).toHaveLength(1);
    expect(JSON.stringify(payload.components)).toContain('"spoiler":true');
  });

  it("keeps the spoiler of an upload's file name when a gallery shows it", () => {
    const card = {
      id: "a1",
      ...attachment("SPOILER_card.png", "image/png", true),
    };
    const { json } = render(
      fakeMessage({
        content: "",
        attachments: new Collection([["a1", card]]),
        components: [
          {
            type: 12,
            items: [{ media: { url: card.url, attachment_id: "a1" } }],
          },
        ],
      })
    );
    expect(json).toContain('"spoiler":true');
  });

  it("keeps hidden an upload a spoiler container shows as a thumbnail", () => {
    const thumb = { id: "a1", ...attachment("t.png", "image/png") };
    const { json } = render(
      fakeMessage({
        content: "",
        attachments: new Collection([["a1", thumb]]),
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
                  media: { url: thumb.url, attachment_id: "a1" },
                },
              },
            ],
          },
        ],
      })
    );
    expect(json).toContain('"spoiler":true');
  });

  it("hides a gallery upload another component shows as a spoiler", () => {
    const card = { id: "a1", ...attachment("card.png", "image/png") };
    const { json } = render(
      fakeMessage({
        content: "",
        attachments: new Collection([["a1", card]]),
        components: [
          {
            type: 12,
            items: [{ media: { url: card.url, attachment_id: "a1" } }],
          },
          {
            type: 13,
            file: { url: card.url, attachment_id: "a1" },
            spoiler: true,
          },
        ],
      })
    );
    expect(json).toContain('"spoiler":true');
  });

  it("ends with the counter above a link to the message", () => {
    const { payload } = render(fakeMessage());
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    const json = payload.components[0]!.toJSON();
    expect(json.accent_color).toBe(0xf5c518);
    expect(json.components.slice(-3)).toMatchObject([
      { type: ComponentType.Separator },
      { type: ComponentType.TextDisplay, content: "⭐ **4**" },
      {
        type: ComponentType.ActionRow,
        components: [
          {
            style: ButtonStyle.Link,
            url: "https://discord.com/channels/g/general/m1",
            label: "Go to message",
          },
        ],
      },
    ]);
  });

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

  it("shows the origin as small text, set apart from the content", () => {
    const { json } = render(fakeMessage());

    expect(json).toMatch(
      /-# <@author> in <#general> · <t:\d+:R>\\n\\na very good message/
    );
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

  it("shows the text of a reply laid out with components", () => {
    const reply = fakeMessage({
      author: { id: "other" },
      content: "",
      components: [{ type: 10, content: "🎂 happy birthday" }],
    }) as unknown as Message;

    const { json } = render(fakeMessage(), reply);

    expect(json).toContain("↪ Replying to <@other>: 🎂 happy birthday");
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
    expect(json).toMatch(
      /-# <@author> in <#general> · <t:\d+:R>\\n-# ↪ Forwarded message\\n\\nforwarded words/
    );
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

  it("keeps a link preview hidden when its link is under a spoiler", () => {
    const embed = {
      url: "https://example.com/ending.png",
      title: "The ending",
      description: "big reveal",
      data: { type: "image" },
      image: { url: "https://example.com/ending.png" },
    };
    const { json } = render(
      fakeMessage({
        content: "look ||https://example.com/ending.png||",
        embeds: [embed],
      })
    );

    expect(json).toContain('"spoiler":true');
    expect(json).not.toContain("big reveal");
  });
});
