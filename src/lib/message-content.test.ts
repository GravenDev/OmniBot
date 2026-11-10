import { describe, expect, it } from "vitest";
import {
  componentsMedia,
  componentsText,
  hiddenAttachments,
} from "./message-content.js";

// A celebration as the bot posts it: a heading, the card, then the mentions;
// one component as discord.js gives it (with toJSON), the others as JSON.
const announcement = {
  components: [
    { toJSON: () => ({ type: 10, content: "🎉 **Ancienneté**" }) },
    {
      type: 12,
      items: [{ media: { url: "https://cdn/card.webp" } }],
    },
    {
      type: 17,
      components: [
        { type: 10, content: "**5 ans** · <@1>" },
        {
          type: 9,
          components: [{ type: 10, content: "inside a section" }],
          accessory: { type: 2, label: "a button" },
        },
        {
          type: 12,
          items: [{ media: { url: "https://cdn/x.png" }, spoiler: true }],
        },
      ],
    },
  ],
};

describe("componentsText", () => {
  it("reads the text displays in order, sections and containers included", () => {
    expect(componentsText(announcement as never)).toBe(
      "🎉 **Ancienneté**\n**5 ans** · <@1>\ninside a section"
    );
  });

  it("reads nothing from a message without components", () => {
    expect(componentsText({ components: [] } as never)).toBe("");
    expect(componentsText({} as never)).toBe("");
  });
});

describe("componentsMedia", () => {
  it("lists the gallery media, keeping their spoiler", () => {
    expect(componentsMedia(announcement as never)).toEqual([
      { url: "https://cdn/card.webp", spoiler: false },
      { url: "https://cdn/x.png", spoiler: true },
    ]);
  });

  it("ignores buttons and rows of a classic message", () => {
    const classic = { components: [{ components: [{ customId: "x" }] }] };
    expect(componentsMedia(classic as never)).toEqual([]);
    expect(componentsText(classic as never)).toBe("");
  });
});

describe("a container marked as a spoiler", () => {
  const hidden = {
    components: [
      {
        type: 17,
        spoiler: true,
        components: [
          { type: 10, content: "the ||end|| of the film" },
          { type: 12, items: [{ media: { url: "https://cdn/end.png" } }] },
        ],
      },
      { type: 10, content: "visible" },
    ],
  };

  it("keeps its text behind a spoiler", () => {
    expect(componentsText(hidden as never)).toBe(
      "||the end of the film||\nvisible"
    );
  });

  it("keeps its media behind a spoiler", () => {
    expect(componentsMedia(hidden as never)).toEqual([
      { url: "https://cdn/end.png", spoiler: true },
    ]);
  });
});

it("gives the attachment a gallery item shows, to not show it twice", () => {
  const uploaded = {
    components: [
      {
        type: 12,
        items: [
          { media: { url: "https://cdn/card.webp", attachment_id: "42" } },
        ],
      },
    ],
  };
  expect(componentsMedia(uploaded as never)).toEqual([
    { url: "https://cdn/card.webp", spoiler: false, attachmentId: "42" },
  ]);
});

describe("hiddenAttachments", () => {
  it("lists the uploads any component shows behind a spoiler", () => {
    const message = {
      components: [
        {
          type: 17,
          spoiler: true,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: "x" }],
              accessory: { type: 11, media: { url: "u", attachment_id: "1" } },
            },
          ],
        },
        { type: 13, file: { url: "f", attachment_id: "2" }, spoiler: true },
        {
          type: 12,
          items: [
            { media: { url: "a", attachment_id: "3" }, spoiler: true },
            { media: { url: "b", attachment_id: "4" } },
          ],
        },
        { type: 11, media: { url: "c", attachment_id: "5" } },
      ],
    };
    expect([...hiddenAttachments(message as never)].sort()).toEqual([
      "1",
      "2",
      "3",
    ]);
  });
});

it("closes the spoiler of a hidden text ending with a backslash", () => {
  const message = {
    components: [
      { type: 17, spoiler: true, components: [{ type: 10, content: "a\\" }] },
    ],
  };
  expect(componentsText(message as never)).toBe("||a||");
});

it("keeps the escaped backslashes ending a hidden text", () => {
  const message = {
    components: [
      {
        type: 17,
        spoiler: true,
        components: [{ type: 10, content: "C:\\\\" }],
      },
    ],
  };
  expect(componentsText(message as never)).toBe("||C:\\\\||");
});

it("drops one backslash of an odd run ending a hidden text", () => {
  const message = {
    components: [
      {
        type: 17,
        spoiler: true,
        components: [{ type: 10, content: "a" + "\\".repeat(5) }],
      },
    ],
  };
  expect(componentsText(message as never)).toBe(`||a${"\\".repeat(4)}||`);
});
