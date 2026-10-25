import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decrypt, encrypt, ENCRYPTED_PREFIX } from "#lib/crypto.js";

const { create, update, findMany, updateMany, findFirst } = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  findFirst: vi.fn(),
}));
vi.mock("#lib/database.js", () => ({
  default: {
    messageReport: { create, update, findMany, updateMany, findFirst },
  },
  Prisma: {},
}));

const { default: store } = await import("./store.js");

const snapshot = {
  guildId: "g1",
  channelId: "c1",
  messageId: "m1",
  authorId: "u1",
  content: "a reported message",
  attachments: [{ name: "a.png", url: "https://cdn/a.png" }],
  createdAt: new Date("2026-10-20T00:00:00Z"),
};

function row(fields: Record<string, unknown>) {
  return {
    id: 1,
    guildId: "g1",
    channelId: "c1",
    messageId: "m1",
    authorId: "u1",
    messageCreatedAt: snapshot.createdAt,
    messageState: "present",
    reactionKept: false,
    alertChannelId: null,
    alertMessageId: null,
    status: "open",
    handledBy: null,
    handledAt: null,
    createdAt: snapshot.createdAt,
    reporters: [],
    actions: [],
    editedContent: null,
    ...fields,
  };
}

describe("report store encryption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DATA_ENCRYPTION_KEY"] = randomBytes(32).toString("base64");
  });

  afterEach(() => {
    delete process.env["DATA_ENCRYPTION_KEY"];
  });

  it("encrypts the copy of the message it stores", async () => {
    create.mockImplementation(async ({ data }) =>
      row({ ...data, reporters: [] })
    );

    const report = await store.create(
      snapshot,
      { userId: "r1", source: "reaction", reason: null },
      false
    );

    const { data } = create.mock.calls[0]![0];
    expect(data.content.startsWith(ENCRYPTED_PREFIX)).toBe(true);
    expect(data.content).not.toContain("reported");
    expect(typeof data.attachments).toBe("string");
    expect(data.attachments).not.toContain("a.png");
    expect(report.content).toBe("a reported message");
    expect(report.attachments).toEqual(snapshot.attachments);
  });

  it("encrypts the edited text", async () => {
    await store.setMessageState(1, "edited", "the new text");

    const { data } = update.mock.calls[0]![0];
    expect(decrypt(data.editedContent)).toBe("the new text");
    expect(data.editedContent).not.toContain("new text");
  });

  it("reads a report stored before encryption", async () => {
    findFirst.mockResolvedValue(
      row({ content: "old text", attachments: snapshot.attachments })
    );

    const report = await store.byId("g1", 1);

    expect(report?.content).toBe("old text");
    expect(report?.attachments).toEqual(snapshot.attachments);
  });

  it("encrypts the reports stored in clear", async () => {
    findMany.mockResolvedValue([
      {
        id: 1,
        content: "old text",
        editedContent: "old edit",
        attachments: snapshot.attachments,
      },
    ]);
    updateMany.mockResolvedValue({ count: 1 });

    expect(await store.encryptPlaintext()).toBe(1);

    const { where, data } = updateMany.mock.calls[0]![0];
    expect(where).toEqual({
      id: 1,
      content: "old text",
      editedContent: "old edit",
    });
    expect(decrypt(data.content)).toBe("old text");
    expect(decrypt(data.editedContent)).toBe("old edit");
    expect(JSON.parse(decrypt(data.attachments))).toEqual(snapshot.attachments);
  });

  it("keeps an edited text that is already encrypted", async () => {
    const edit = encrypt("new edit");
    findMany.mockResolvedValue([
      { id: 1, content: "old text", editedContent: edit, attachments: [] },
    ]);
    updateMany.mockResolvedValue({ count: 1 });

    await store.encryptPlaintext();

    expect(updateMany.mock.calls[0]![0].data.editedContent).toBe(edit);
  });

  it("leaves the reports in clear without a key", async () => {
    delete process.env["DATA_ENCRYPTION_KEY"];

    expect(await store.encryptPlaintext()).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
