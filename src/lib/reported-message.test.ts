import {
  ButtonBuilder,
  ButtonStyle,
  Collection,
  ComponentType,
  type Message,
} from "discord.js";
import { beforeAll, describe, expect, it } from "vitest";
import en from "#core/i18n/en.json" with { type: "json" };
import { COMPONENTS_TEXT_LIMIT } from "./format.js";
import { createT } from "./i18n.js";
import { reportedMessage } from "./reported-message.js";
import { componentCount, initTestI18n, textLength } from "./testing.js";

const t = createT("en", "core");

beforeAll(async () => {
  await initTestI18n("core", { en });
});

function fakeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    channelId: "general",
    content: "a very good message",
    createdAt: new Date(0),
    url: "https://discord.com/channels/g/general/m1",
    author: {
      id: "author",
      username: "author_name",
      displayAvatarURL: () => "https://cdn.discordapp.com/avatars/author.png",
    },
    member: null,
    webhookId: null,
    attachments: new Collection(),
    embeds: [],
    stickers: new Collection(),
    components: [],
    messageSnapshots: new Collection(),
    ...overrides,
  } as unknown as Message<true>;
}

function render(
  message: Message<true>,
  options: Partial<Parameters<typeof reportedMessage>[2]> = {}
) {
  const container = reportedMessage(message, t, {
    accent: 0x123456,
    footer: "-# footer line",
    ...options,
  });
  const json = container.toJSON();
  return { container, json, text: JSON.stringify(json) };
}

describe("reportedMessage", () => {
  it("lays out the header and text beside the avatar, then the footer", () => {
    const { json } = render(fakeMessage());
    expect(json.accent_color).toBe(0x123456);
    expect(json.components.map((component) => component.type)).toEqual([
      ComponentType.Section,
      ComponentType.Separator,
      ComponentType.TextDisplay,
      ComponentType.ActionRow,
    ]);
    const section = json.components[0] as {
      components: { content: string }[];
      accessory: { type: number; media: { url: string } };
    };
    expect(section.components[0]!.content).toMatch(
      /^-# <@author> in <#general> · <t:0:R>\n\na very good message$/
    );
    expect(section.accessory).toMatchObject({
      type: ComponentType.Thumbnail,
      media: { url: "https://cdn.discordapp.com/avatars/author.png" },
    });
    expect(json.components[2]).toMatchObject({ content: "-# footer line" });
  });

  it("ends with a link to the message, then the module's own buttons", () => {
    const extra = new ButtonBuilder()
      .setCustomId("extra")
      .setLabel("Extra")
      .setStyle(ButtonStyle.Secondary);
    const { json } = render(fakeMessage(), { buttons: [extra] });
    const row = json.components.at(-1) as {
      components: { style: number; url?: string; label: string }[];
    };
    expect(row.components).toMatchObject([
      {
        style: ButtonStyle.Link,
        url: "https://discord.com/channels/g/general/m1",
        label: "Go to message",
      },
      { custom_id: "extra" },
    ]);
  });

  it("has no accent colour when given none", () => {
    expect(render(fakeMessage(), { accent: null }).json.accent_color).toBe(
      undefined
    );
  });

  it("names a webhook's author instead of mentioning an unknown user", () => {
    const { text } = render(
      fakeMessage({
        webhookId: "author",
        author: {
          id: "author",
          username: "Proxy_*name*",
          displayAvatarURL: () => "https://cdn/avatar.png",
        },
      })
    );
    expect(text).toContain("-# **Proxy\\\\_\\\\*name\\\\*** in <#general>");
    expect(text).not.toContain("<@author>");
  });

  it("tells a forwarded message apart", () => {
    const snapshot = fakeMessage({ content: "forwarded words" });
    const { text } = render(
      fakeMessage({
        content: "",
        messageSnapshots: new Collection([["s", snapshot]]),
      })
    );
    expect(text).toMatch(
      /<t:0:R>\\n-# ↪ Forwarded message\\n\\nforwarded words/
    );
  });

  it("says the message has no text only when nothing else is shown", () => {
    const empty = render(fakeMessage({ content: "" }), {
      emptyText: "*nothing*",
    }).text;
    expect(empty).toContain("\\n\\n*nothing*");
    const file = {
      id: "a1",
      name: "notes.pdf",
      contentType: "application/pdf",
      spoiler: false,
      url: "https://cdn/notes.pdf",
    };
    const withFile = render(
      fakeMessage({
        content: "",
        attachments: new Collection([["a1", file]]),
      }),
      { emptyText: "*nothing*" }
    ).text;
    expect(withFile).not.toContain("*nothing*");
  });

  it("does not say there is no text above an image", () => {
    const image = {
      id: "a1",
      name: "cat.png",
      contentType: "image/png",
      spoiler: false,
      url: "https://cdn/cat.png",
    };
    const message = fakeMessage({
      content: "",
      attachments: new Collection([["a1", image]]),
    });
    expect(render(message, { emptyText: "*nothing*" }).text).not.toContain(
      "*nothing*"
    );
  });

  it("leaves the gallery out when asked to", () => {
    const image = {
      id: "a1",
      name: "cat.png",
      contentType: "image/png",
      spoiler: false,
      url: "https://cdn/cat.png",
    };
    const message = fakeMessage({
      attachments: new Collection([["a1", image]]),
    });
    expect(render(message).text).toContain('"type":12');
    const without = render(message, { withMedia: false }).text;
    expect(without).not.toContain('"type":12');
    expect(without).toContain("📎 [cat.png](https://cdn/cat.png)");
  });

  it("hides a link preview whose image link is under a spoiler", () => {
    const { text } = render(
      fakeMessage({
        content: "||https://example.com/i.png||",
        embeds: [
          {
            data: { type: "rich" },
            description: "the reveal",
            image: { url: "https://example.com/i.png" },
          },
        ],
      })
    );
    expect(text).toContain('"spoiler":true');
    expect(text).not.toContain("the reveal");
  });

  it("hides a link preview whose link a component's spoiler covers", () => {
    const { text } = render(
      fakeMessage({
        content: "",
        components: [{ type: 10, content: "||https://example.com/end||" }],
        embeds: [
          {
            url: "https://example.com/end",
            data: { type: "article" },
            title: "The ending",
            image: { url: "https://example.com/end.png" },
          },
        ],
      })
    );
    expect(text).toContain('"spoiler":true');
    expect(text).not.toContain("The ending");
  });

  it("hides a preview whose link Discord rewrote, when the text has a spoiler", () => {
    // The link under the spoiler is not the preview's url: short link,
    // redirect, trailing slash.
    const { text } = render(
      fakeMessage({
        content: "||https://youtu.be/abc||",
        embeds: [
          {
            url: "https://www.youtube.com/watch?v=abc",
            data: { type: "video" },
            title: "The ending",
            thumbnail: { url: "https://i.ytimg.com/vi/abc/0.jpg" },
          },
        ],
      })
    );
    expect(text).toContain('"spoiler":true');
    expect(text).not.toContain("The ending");
  });

  it("shows a preview whose link is in the clear, beside a spoiler", () => {
    const { text } = render(
      fakeMessage({
        content: "see https://example.com/post and ||the twist||",
        embeds: [
          {
            url: "https://example.com/post",
            data: { type: "article" },
            title: "A post",
            image: { url: "https://example.com/post.png" },
          },
        ],
      })
    );
    expect(text).not.toContain('"spoiler":true');
    expect(text).toContain("A post");
  });

  it("shows a preview when the text has no spoiler", () => {
    const { text } = render(
      fakeMessage({
        content: "https://youtu.be/abc",
        embeds: [
          {
            url: "https://www.youtube.com/watch?v=abc",
            data: { type: "video" },
            title: "A video",
            thumbnail: { url: "https://i.ytimg.com/vi/abc/0.jpg" },
          },
        ],
      })
    );
    expect(text).not.toContain('"spoiler":true');
    expect(text).toContain("A video");
  });

  it("keeps a spoilered file's name and link under the spoiler", () => {
    const file = (id: string, name: string, spoiler: boolean) => ({
      id,
      name,
      contentType: "application/pdf",
      spoiler,
      url: `https://cdn/${name}`,
    });
    const { text } = render(
      fakeMessage({
        content: "",
        attachments: new Collection([
          ["a1", file("a1", "SPOILER_ending.pdf", true)],
          ["a2", file("a2", "notes.pdf", false)],
          ["a3", file("a3", "hidden.pdf", false)],
        ]),
        // A file component under a spoiler container hides the third one.
        components: [
          {
            type: 17,
            spoiler: true,
            components: [
              {
                type: 13,
                file: { url: "https://cdn/hidden.pdf", attachment_id: "a3" },
              },
            ],
          },
        ],
      })
    );
    expect(text).toContain(
      "||📎 [SPOILER\\\\_ending.pdf](https://cdn/SPOILER_ending.pdf)||"
    );
    expect(text).toContain("\\n📎 [notes.pdf](https://cdn/notes.pdf)");
    expect(text).toContain("||📎 [hidden.pdf](https://cdn/hidden.pdf)||");
  });

  it("lists the media as files when the gallery is left out", () => {
    const image = (id: string, spoiler: boolean) => ({
      id,
      name: `${id}.png`,
      contentType: "image/png",
      spoiler,
      url: `https://cdn/${id}.png`,
    });
    const { text } = render(
      fakeMessage({
        content: "",
        attachments: new Collection([
          ["a1", image("a1", false)],
          ["a2", image("a2", true)],
        ]),
      }),
      { emptyText: "*nothing*", withMedia: false }
    );
    expect(text).toContain("📎 [a1.png](https://cdn/a1.png)");
    expect(text).toContain("||📎 [a2.png](https://cdn/a2.png)||");
    expect(text).not.toContain("*nothing*");
  });

  it("shows the picture of a link preview that only has a thumbnail", () => {
    const { json } = render(
      fakeMessage({
        content: "https://news.example/story",
        embeds: [
          {
            url: "https://news.example/story",
            data: { type: "article" },
            title: "A story",
            thumbnail: { url: "https://news.example/og.png" },
          },
        ],
      })
    );
    expect(json.components).toContainEqual(
      expect.objectContaining({
        type: ComponentType.MediaGallery,
        items: [
          expect.objectContaining({
            media: { url: "https://news.example/og.png" },
          }),
        ],
      })
    );
  });

  it("gives the extras the whole share when the message has no text", () => {
    const files = Array.from({ length: 3 }, (_, index) => {
      const id = `a${index}`;
      return [
        id,
        {
          id,
          name: `${id}.pdf`,
          contentType: "application/pdf",
          spoiler: false,
          url: `https://cdn/${id}.pdf?${"x".repeat(200)}`,
        },
      ] as const;
    });
    const { text } = render(
      fakeMessage({ content: "", attachments: new Collection(files) }),
      { textLimit: 1000 }
    );
    expect(text).toContain("📎 [a2.pdf]");
    expect(text).not.toContain("more file");
  });

  it("keeps a file's name inside its link", () => {
    const file = {
      id: "a1",
      name: "a](https://elsewhere.example) [b.txt",
      contentType: "text/plain",
      spoiler: false,
      url: "https://cdn/b.txt",
    };
    const { json } = render(
      fakeMessage({ attachments: new Collection([["a1", file]]) })
    );
    const line = (json.components[1] as { content: string }).content;
    expect(line).toBe(
      "📎 [a\\](https://elsewhere.example) \\[b.txt](https://cdn/b.txt)"
    );
  });

  it("names the stickers when the gallery is left out", () => {
    const sticker = {
      name: "Party",
      format: 1,
      url: "https://cdn/sticker.png",
    };
    const { text } = render(
      fakeMessage({
        content: "",
        stickers: new Collection([["s1", sticker]]),
      }),
      { emptyText: "*nothing*", withMedia: false }
    );
    expect(text).toContain("Sticker: Party");
    expect(text).not.toContain("*nothing*");
  });

  it("quotes the text of a forwarded message replied to", () => {
    const reply = fakeMessage({
      author: { id: "other" },
      content: "",
      messageSnapshots: new Collection([
        ["s", fakeMessage({ content: "forwarded words" })],
      ]),
    }) as unknown as Message;
    expect(render(fakeMessage(), { reply }).text).toContain(
      "↪ Replying to <@other>: forwarded words"
    );
  });

  it("mentions the bot behind a slash command's response", () => {
    // Its webhook id is the application's, but its author is a real user.
    const { text } = render(
      fakeMessage({
        webhookId: "author",
        interactionMetadata: { id: "i1" },
      })
    );
    expect(text).toContain("-# <@author> in <#general>");
  });

  it("shows once an upload an embed also shows", () => {
    const chart = {
      id: "a1",
      name: "chart.png",
      contentType: "image/png",
      spoiler: false,
      url: "https://cdn.discordapp.com/attachments/1/2/chart.png?ex=1&hm=2",
    };
    const { text } = render(
      fakeMessage({
        content: "",
        attachments: new Collection([["a1", chart]]),
        embeds: [
          {
            data: { type: "rich" },
            title: "Stats",
            image: {
              url: "https://cdn.discordapp.com/attachments/1/2/chart.png?ex=3",
            },
          },
        ],
      })
    );
    expect(text.match(/chart\.png/g)).toHaveLength(1);
  });

  it("keeps an embed title's markup from spilling onto the next lines", () => {
    const { text } = render(
      fakeMessage({
        embeds: [{ data: { type: "rich" }, title: "A || B" }],
      })
    );
    expect(text).toContain("> **A \\\\|\\\\| B**");
  });

  it("keeps the buttons' labels within the text limit", () => {
    const extra = new ButtonBuilder()
      .setCustomId("extra")
      .setLabel("Delete")
      .setStyle(ButtonStyle.Secondary);
    const { container } = render(fakeMessage({ content: "c".repeat(4000) }), {
      buttons: [extra],
      textLimit: 1000,
    });
    const labels = "Go to message".length + "Delete".length;
    expect(textLength([container]) + labels).toBeLessThanOrEqual(1000);
  });

  it("fits a share of the text limit, however long the parts", () => {
    const reply = fakeMessage({
      author: { id: "other" },
      content: "r".repeat(500),
    }) as unknown as Message;
    const files = ["a.pdf", "b.pdf", "c.pdf"].map((name) => ({
      id: name,
      name,
      contentType: "application/pdf",
      spoiler: false,
      url: `https://cdn/${name}?${"x".repeat(600)}`,
    }));
    const embed = {
      title: "T",
      description: "line\n".repeat(300),
      data: { type: "rich" },
    };
    const share = Math.floor(COMPONENTS_TEXT_LIMIT / 3);
    const { container } = render(
      fakeMessage({
        content: "c".repeat(4000),
        embeds: [embed, embed],
        attachments: new Collection(files.map((file) => [file.id, file])),
      }),
      { reply, textLimit: share }
    );
    expect(textLength([container])).toBeLessThanOrEqual(share);
    expect(JSON.stringify(container.toJSON())).toContain("c".repeat(100));
  });
});

describe("the reported container", () => {
  it("counts every nested component", () => {
    const { container } = render(fakeMessage(), {
      buttons: [
        new ButtonBuilder()
          .setCustomId("x")
          .setLabel("x")
          .setStyle(ButtonStyle.Secondary),
      ],
    });
    // Container, section, its text and thumbnail, separator, footer text,
    // action row and its two buttons.
    expect(componentCount([container])).toBe(9);
  });
});
