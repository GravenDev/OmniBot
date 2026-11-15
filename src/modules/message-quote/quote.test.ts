import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type Message,
} from "discord.js";
import { beforeAll, describe, expect, it } from "vitest";
import core from "#core/i18n/en.json" with { type: "json" };
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
import en from "./i18n/en.json" with { type: "json" };
import { alone, fakeQuoted, member } from "./quote.fakes.js";
import {
  ACCENT,
  MAX_QUOTES,
  parseMessageLinks,
  quoteContainer,
  quoteReply,
} from "./quote.js";

const GUILD = "100";

const t = createT("en", "message-quote");

beforeAll(async () => {
  await initTestI18n("core", { en: core });
  await initTestI18n("message-quote", { en });
  silenceLogs();
});

function link(channelId: string, messageId: string, guildId = GUILD) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
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
    // The text displays after it: the extras (the footer is in a section).
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
    // The quoter is beside the link, below.
    expect(texts).toEqual([]);
  });

  it("ends with the quoter beside a link to the message", () => {
    const { json } = render(fakeQuoted({ content: "hello" }));
    expect(json.components!.slice(-2)).toMatchObject([
      { type: ComponentType.Separator },
      {
        type: ComponentType.Section,
        components: [
          { type: ComponentType.TextDisplay, content: "-# 💬 Quoted by <@1>" },
        ],
        accessory: {
          style: ButtonStyle.Link,
          url: "https://discord.com/channels/100/200/300",
          label: "Go to message",
        },
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
      [fakeQuoted({ authorId: "2" }), fakeQuoted({ authorId: "2" })].map(alone),
      member,
      t
    );
    expect(reply).not.toHaveProperty("content");
    expect(reply.flags).toBe(MessageFlags.IsComponentsV2);
    expect(reply.allowedMentions).toBe(NO_MENTIONS_REPLY);
    const [first, last] = reply.components.map((container) =>
      (container.toJSON() as unknown as Json).components!.at(-1)!
    );
    expect(first).toMatchObject({
      type: ComponentType.Section,
      accessory: { style: ButtonStyle.Link },
    });
    expect(last!.type).toBe(ComponentType.ActionRow);
    expect(last!.components!.map((b) => b.style)).toEqual([
      ButtonStyle.Link,
      ButtonStyle.Secondary,
    ]);
    expect(last!.components![1]!.custom_id).toBe("message-quote:1:2");
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
      // Each one replies to a long message, quoted under its header.
      [1, 2, 3].map(() => ({
        message: fakeQuoted({
          content: "a".repeat(4000),
          attachments: [
            file("a.pdf"),
            file("b.pdf"),
            file("c.pdf"),
            file("d.pdf"),
            ...Array.from({ length: 12 }, (_, i) => image(`${i}.png`)),
          ],
          embeds: [embed, embed],
        }),
        reply: fakeQuoted({ authorId: "3", content: "q".repeat(4000) }),
      })),
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
      const json = JSON.stringify(container.toJSON());
      expect(json).toContain("a".repeat(300));
      expect(json).toContain("↪ <@3>: qqq");
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
      ].map(alone),
      member,
      t,
      false
    );
    const json = JSON.stringify(reply.components[0]!.toJSON());
    expect(json).not.toContain('"type":12');
    expect(json).toContain("📎 [b.png](https://cdn/b.png)");
  });
});
