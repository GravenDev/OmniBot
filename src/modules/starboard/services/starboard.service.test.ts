import { Collection, DiscordAPIError, MessageType } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestConfig, silenceLogs } from "#lib/testing.js";
import { starboardConfigSchema } from "#modules/starboard/starboard.config.js";

vi.mock("#lib/database.js", () => ({ default: {}, Prisma: {} }));

const mocks = vi.hoisted(() => ({
  store: {
    find: vi.fn(),
    findInvolving: vi.fn(),
    create: vi.fn(),
    dismiss: vi.fn(),
    remove: vi.fn(),
    saveTally: vi.fn(),
    listForChannel: vi.fn(),
    removeForChannel: vi.fn(),
  },
  tally: { tallyReactions: vi.fn(), upperBound: vi.fn() },
  ineligibility: vi.fn(),
  view: vi.fn(() => ({ rendered: true })),
}));

vi.mock("./store.js", () => ({ default: mocks.store }));
vi.mock("./tally.js", () => mocks.tally);
vi.mock("./view.js", () => ({ starboardMessage: mocks.view }));
vi.mock("./eligibility.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./eligibility.js")>()),
  ineligibility: mocks.ineligibility,
}));

const { default: starboard, isCounted } =
  await import("./starboard.service.js");

function apiError(code: number) {
  return new DiscordAPIError(
    { code, message: "error" },
    code,
    404,
    "GET",
    "https://discord.com/api/v10/channels/1/messages/2",
    {}
  );
}

const starboardMessages = {
  edit: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
};
const sent = { id: "sb1", delete: vi.fn(async () => undefined) };
const board = {
  id: "board",
  isSendable: () => true,
  isDMBased: () => false,
  send: vi.fn(async () => sent),
};
const bulkDelete = vi.fn(
  async (ids: string[]) => new Collection(ids.map((id) => [id, {}]))
);
const client = {
  channels: {
    fetch: vi.fn(async () => ({
      isTextBased: () => true,
      isDMBased: () => false,
      messages: starboardMessages,
      bulkDelete: bulkDelete,
    })),
  },
};

function fakeMessage(channelId = "general", parentId: string | null = null) {
  const message = {
    id: "m1",
    guildId: "g1",
    channelId,
    channel: { isThread: () => parentId !== null, parentId },
    type: MessageType.Default,
    client,
    inGuild: () => true,
    fetch: vi.fn(async () => message),
  };
  return message;
}

type Values = Parameters<
  typeof makeTestConfig<typeof starboardConfigSchema>
>[2];

function config(values: Values = {}) {
  return makeTestConfig("starboard", starboardConfigSchema, {
    channel: board as never,
    ...values,
  });
}

const entry = {
  messageId: "m1",
  guildId: "g1",
  channelId: "general",
  parentChannelId: null,
  starboardChannelId: "board",
  starboardMessageId: "sb1",
  tally: null,
};

const stored = { reactions: [{ emoji: "⭐", count: 9 }], total: 9 };

beforeAll(() => {
  silenceLogs();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.find.mockResolvedValue(null);
  mocks.ineligibility.mockReturnValue(null);
  mocks.tally.upperBound.mockReturnValue(3);
  mocks.tally.tallyReactions.mockResolvedValue({
    reactions: [{ emoji: "⭐", count: 3 }],
    total: 3,
  });
});

describe("isCounted", () => {
  it("matches the configured emojis only", () => {
    expect(isCounted({ id: null, name: "⭐" }, config())).toBe(true);
    expect(isCounted({ id: null, name: "👍" }, config())).toBe(false);
  });
});

describe("refresh of a message not yet on the starboard", () => {
  it("reposts it once enough members reacted", async () => {
    await starboard.refresh(fakeMessage() as never, config());

    expect(board.send).toHaveBeenCalledWith({ rendered: true });
    expect(mocks.store.create).toHaveBeenCalledWith({
      ...entry,
      tally: { reactions: [{ emoji: "⭐", count: 3 }], total: 3 },
    });
  });

  it("records the parent of a message posted in a thread", async () => {
    await starboard.refresh(fakeMessage("thread", "forum") as never, config());

    expect(mocks.store.create).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "thread", parentChannelId: "forum" })
    );
  });

  it("does not fetch a cached message below the threshold", async () => {
    mocks.tally.upperBound.mockReturnValue(2);
    const message = fakeMessage();

    await starboard.refresh(message as never, config());

    expect(message.fetch).not.toHaveBeenCalled();
  });

  it("does not fetch the reposts the starboard itself holds", async () => {
    const message = fakeMessage("board");

    await starboard.refresh(message as never, config());

    expect(message.fetch).not.toHaveBeenCalled();
  });

  it("applies the latest config to a burst of reactions", async () => {
    const message = fakeMessage();

    await Promise.all([
      starboard.refresh(message as never, config()),
      starboard.refresh(message as never, config({ threshold: 5 })),
    ]);

    expect(board.send).not.toHaveBeenCalled();
  });

  it("reposts without media when Discord refuses them", async () => {
    board.send.mockRejectedValueOnce(apiError(50035));

    await starboard.refresh(fakeMessage() as never, config());

    expect(board.send).toHaveBeenCalledTimes(2);
    expect(mocks.view.mock.calls.at(-1)?.at(-1)).toBe(false);
    expect(mocks.store.create).toHaveBeenCalled();
  });

  it("does not look up the reactors while the raw count is too low", async () => {
    mocks.tally.upperBound.mockReturnValue(2);

    await starboard.refresh(fakeMessage() as never, config());

    expect(mocks.tally.tallyReactions).not.toHaveBeenCalled();
    expect(board.send).not.toHaveBeenCalled();
  });

  it("does not repost it when too few different members count", async () => {
    mocks.tally.tallyReactions.mockResolvedValue({
      reactions: [{ emoji: "⭐", count: 2 }],
      total: 2,
    });

    await starboard.refresh(fakeMessage() as never, config());

    expect(board.send).not.toHaveBeenCalled();
  });

  it("does nothing for an ineligible message", async () => {
    mocks.ineligibility.mockReturnValue("audience");

    await starboard.refresh(fakeMessage() as never, config());

    expect(board.send).not.toHaveBeenCalled();
  });

  it("does nothing until the starboard channel is set", async () => {
    await starboard.refresh(fakeMessage() as never, config({ channel: null }));

    expect(board.send).not.toHaveBeenCalled();
  });

  it("deletes the repost when it cannot be recorded", async () => {
    mocks.store.create.mockRejectedValueOnce(new Error("db down"));

    await starboard.refresh(fakeMessage() as never, config());

    expect(sent.delete).toHaveBeenCalled();
  });

  it("checks the message once for a burst of reactions", async () => {
    const message = fakeMessage();

    await Promise.all([
      starboard.refresh(message as never, config()),
      starboard.refresh(message as never, config()),
      starboard.refresh(message as never, config()),
    ]);

    expect(message.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("refresh of a message already on the starboard", () => {
  beforeEach(() => {
    mocks.store.find.mockResolvedValue(entry);
  });

  it("updates the repost in place", async () => {
    await starboard.refresh(fakeMessage() as never, config());

    expect(starboardMessages.edit).toHaveBeenCalledWith("sb1", {
      rendered: true,
    });
    expect(board.send).not.toHaveBeenCalled();
  });

  it("keeps it below the threshold by default", async () => {
    mocks.tally.tallyReactions.mockResolvedValue({ reactions: [], total: 0 });

    await starboard.refresh(fakeMessage() as never, config());

    expect(starboardMessages.edit).toHaveBeenCalled();
    expect(mocks.store.remove).not.toHaveBeenCalled();
  });

  it("removes it below the threshold when configured to", async () => {
    mocks.tally.tallyReactions.mockResolvedValue({ reactions: [], total: 0 });

    await starboard.refresh(
      fakeMessage() as never,
      config({ belowThreshold: "remove" })
    );

    expect(starboardMessages.delete).toHaveBeenCalledWith("sb1");
    expect(mocks.store.remove).toHaveBeenCalledWith("m1");
  });

  it("stops following it once a moderator deleted the repost", async () => {
    starboardMessages.edit.mockRejectedValueOnce(apiError(10008));

    await starboard.refresh(fakeMessage() as never, config());

    expect(mocks.store.dismiss).toHaveBeenCalledWith("m1", "sb1");
  });

  it("leaves a dismissed message alone", async () => {
    mocks.store.find.mockResolvedValue({ ...entry, starboardMessageId: null });

    await starboard.refresh(fakeMessage() as never, config());

    expect(mocks.tally.tallyReactions).not.toHaveBeenCalled();
    expect(starboardMessages.edit).not.toHaveBeenCalled();
  });

  it("removes the repost when the original message is gone", async () => {
    const message = fakeMessage();
    message.fetch.mockRejectedValueOnce(apiError(10008));

    await starboard.refresh(message as never, config());

    expect(starboardMessages.delete).toHaveBeenCalledWith("sb1");
    expect(mocks.store.remove).toHaveBeenCalledWith("m1");
  });

  it("removes the repost once the source channel got more private", async () => {
    mocks.ineligibility.mockReturnValue("audience");

    await starboard.refresh(fakeMessage() as never, config());

    expect(starboardMessages.edit).not.toHaveBeenCalled();
    expect(starboardMessages.delete).toHaveBeenCalledWith("sb1");
    expect(mocks.store.remove).toHaveBeenCalledWith("m1");
  });

  it("keeps updating it when only the watched channels changed", async () => {
    mocks.ineligibility.mockReturnValue("channel");

    await starboard.refresh(fakeMessage() as never, config());

    expect(starboardMessages.edit).toHaveBeenCalled();
  });

  it("records the new count", async () => {
    await starboard.refresh(fakeMessage() as never, config());

    expect(mocks.store.saveTally).toHaveBeenCalledWith("m1", {
      reactions: [{ emoji: "⭐", count: 3 }],
      total: 3,
    });
  });

  it("does not edit the repost when the count did not change", async () => {
    mocks.store.find.mockResolvedValue({
      ...entry,
      tally: { reactions: [{ emoji: "⭐", count: 3 }], total: 3 },
    });

    await starboard.refresh(fakeMessage() as never, config());

    expect(starboardMessages.edit).not.toHaveBeenCalled();
    expect(mocks.store.saveTally).not.toHaveBeenCalled();
  });

  it("keeps a repost a moderator deleted meanwhile dismissed", async () => {
    mocks.tally.tallyReactions.mockResolvedValue({ reactions: [], total: 0 });
    starboardMessages.delete.mockRejectedValueOnce(apiError(10008));

    await starboard.refresh(
      fakeMessage() as never,
      config({ belowThreshold: "remove" })
    );

    expect(mocks.store.dismiss).toHaveBeenCalledWith("m1", "sb1");
    expect(mocks.store.remove).not.toHaveBeenCalled();
  });

  it("re-renders an edit with the stored count", async () => {
    mocks.store.find.mockResolvedValue({ ...entry, tally: stored });

    await starboard.refreshContent(fakeMessage() as never, config());

    expect(mocks.tally.tallyReactions).not.toHaveBeenCalled();
    expect(mocks.view.mock.calls.at(-1)?.[2]).toBe(stored);
    expect(starboardMessages.edit).toHaveBeenCalled();
  });

  it("recounts an edit when no count is stored", async () => {
    await starboard.refreshContent(fakeMessage() as never, config());

    expect(mocks.tally.tallyReactions).toHaveBeenCalled();
  });

  it("logs instead of throwing when Discord refuses", async () => {
    starboardMessages.edit.mockRejectedValueOnce(apiError(50013));

    await expect(
      starboard.refresh(fakeMessage() as never, config())
    ).resolves.toBeUndefined();
  });
});

describe("refreshIfStarred", () => {
  it("does not stop a full refresh queued right after it", async () => {
    const message = fakeMessage();

    await Promise.all([
      starboard.refreshIfStarred(message as never, config()),
      starboard.refresh(message as never, config()),
    ]);

    expect(board.send).toHaveBeenCalled();
  });

  it("ignores messages that are not on the starboard", async () => {
    const message = fakeMessage();

    await starboard.refreshIfStarred(message as never, config());
    await starboard.refreshContent(message as never, config());

    expect(message.fetch).not.toHaveBeenCalled();
  });
});

describe("while a repost is being created", () => {
  function holdSend() {
    let release = () => {};
    board.send.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(sent);
        })
    );
    return () => release();
  }

  it("applies a change that came in meanwhile", async () => {
    mocks.store.find.mockResolvedValueOnce(null).mockResolvedValue(entry);
    const release = holdSend();
    const creating = starboard.refresh(fakeMessage() as never, config());
    await vi.waitFor(() => expect(board.send).toHaveBeenCalled());

    const change = starboard.refreshIfStarred(fakeMessage() as never, config());
    release();
    await Promise.all([creating, change]);

    expect(mocks.store.create).toHaveBeenCalled();
    expect(starboardMessages.edit).toHaveBeenCalledWith("sb1", {
      rendered: true,
    });
  });

  it("removes it when the original is deleted meanwhile", async () => {
    const release = holdSend();
    const creating = starboard.refresh(fakeMessage() as never, config());
    await vi.waitFor(() => expect(board.send).toHaveBeenCalled());

    mocks.store.findInvolving.mockResolvedValue([entry]);
    mocks.store.find.mockResolvedValue(entry);
    const deletion = starboard.handleDeletions(["m1"], client as never);
    release();
    await Promise.all([creating, deletion]);

    expect(starboardMessages.delete).toHaveBeenCalledWith("sb1");
    expect(mocks.store.remove).toHaveBeenCalledWith("m1");
  });
});

describe("handleChannelDeletion", () => {
  it("removes the reposts of the deleted channel's messages at once", async () => {
    mocks.store.listForChannel.mockResolvedValue([
      entry,
      { ...entry, messageId: "m2", starboardMessageId: "sb2" },
      { ...entry, messageId: "m3", starboardMessageId: null },
    ]);

    await starboard.handleChannelDeletion("g1", "general", client as never);

    expect(client.channels.fetch).toHaveBeenCalledTimes(1);
    expect(bulkDelete).toHaveBeenCalledWith(["sb1", "sb2"], true);
    expect(starboardMessages.delete).not.toHaveBeenCalled();
    expect(mocks.store.removeForChannel).toHaveBeenCalledWith("g1", "general");
  });

  it("deletes one by one what bulk deletion left", async () => {
    mocks.store.listForChannel.mockResolvedValue([entry]);
    bulkDelete.mockRejectedValueOnce(apiError(50013));

    await starboard.handleChannelDeletion("g1", "general", client as never);

    expect(starboardMessages.delete).toHaveBeenCalledWith("sb1");
  });
});

describe("handleDeletion", () => {
  it("removes the repost of a deleted message", async () => {
    mocks.store.findInvolving.mockResolvedValue([entry]);
    mocks.store.find.mockResolvedValue(entry);

    await starboard.handleDeletion("m1", client as never);

    expect(starboardMessages.delete).toHaveBeenCalledWith("sb1");
    expect(mocks.store.remove).toHaveBeenCalledWith("m1");
  });

  it("dismisses a message whose repost was deleted", async () => {
    mocks.store.findInvolving.mockResolvedValue([entry]);

    await starboard.handleDeletion("sb1", client as never);

    expect(mocks.store.dismiss).toHaveBeenCalledWith("m1", "sb1");
    expect(mocks.store.remove).not.toHaveBeenCalled();
  });

  it("ignores unrelated messages", async () => {
    mocks.store.findInvolving.mockResolvedValue([]);

    await starboard.handleDeletion("other", client as never);

    expect(mocks.store.remove).not.toHaveBeenCalled();
    expect(mocks.store.dismiss).not.toHaveBeenCalled();
  });
});

describe("handleDeletions", () => {
  it("looks every deleted message up in one query", async () => {
    mocks.store.findInvolving.mockResolvedValue([
      entry,
      { ...entry, messageId: "m2", starboardMessageId: "sb2" },
    ]);
    mocks.store.find.mockResolvedValue(entry);

    await starboard.handleDeletions(["m1", "sb2", "x"], client as never);

    expect(mocks.store.findInvolving).toHaveBeenCalledTimes(1);
    expect(mocks.store.findInvolving).toHaveBeenCalledWith(["m1", "sb2", "x"]);
    expect(mocks.store.remove).toHaveBeenCalledWith("m1");
    expect(mocks.store.dismiss).toHaveBeenCalledWith("m2", "sb2");
  });
});

describe("deletion of a repost while its original is refreshed", () => {
  it("waits for the refresh before dismissing", async () => {
    mocks.store.find.mockResolvedValue(entry);
    mocks.store.findInvolving.mockResolvedValue([entry]);
    let release = () => {};
    starboardMessages.edit.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          release = () => resolve(undefined);
        })
    );
    const refreshing = starboard.refresh(fakeMessage() as never, config());
    await vi.waitFor(() => expect(starboardMessages.edit).toHaveBeenCalled());

    const deletion = starboard.handleDeletion("sb1", client as never);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.store.dismiss).not.toHaveBeenCalled();

    release();
    await Promise.all([refreshing, deletion]);
    expect(mocks.store.dismiss).toHaveBeenCalledWith("m1", "sb1");
  });
});
