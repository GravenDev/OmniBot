import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
}));
const poster = vi.hoisted(() => ({ unstick: vi.fn() }));

vi.mock("#modules/sticky/services/store.js", () => ({ default: store }));
vi.mock("#modules/sticky/services/poster.js", () => ({ default: poster }));

const {
  default: command,
  currentContent,
  prefillWait,
  preview,
} = await import("./sticky.command.js");

function fakeInteraction(subcommand: string, channelIds = ["c1"]) {
  return {
    guildId: "g1",
    user: { id: "admin" },
    inCachedGuild: () => true,
    options: {
      getSubcommand: () => subcommand,
      getChannel: () => ({ id: "c1" }),
    },
    deferReply: vi.fn(),
    editReply: vi.fn(),
    guild: {
      channels: { cache: new Map(channelIds.map((id) => [id, {}])) },
    },
  };
}

type Fake = ReturnType<typeof fakeInteraction>;

const config = {
  t: (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key} ${JSON.stringify(vars)}` : key,
} as never;

async function run(interaction: Fake) {
  await command.execute(interaction as never, config);
}

beforeEach(() => {
  vi.clearAllMocks();
  store.list.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("preview", () => {
  it("keeps a short message on one line", () => {
    expect(preview("Read\n\nthe   rules")).toBe("Read the rules");
  });

  it("cuts a long message with an ellipsis", () => {
    expect(preview("x".repeat(200))).toBe(`${"x".repeat(79)}…`);
  });

  it("cuts between characters, not inside an emoji", () => {
    const shown = preview("😀".repeat(100));
    expect(shown).toBe(`${"😀".repeat(79)}…`);
  });

  it("escapes Markdown so a cut cannot leak into the next lines", () => {
    expect(preview("```js\nconsole.log(1)")).not.toContain("```");
    expect(preview(`**${"x".repeat(200)}**`).startsWith("\\*\\*")).toBe(true);
  });

  it("shows links, mentions and timestamps as text", () => {
    expect(preview("[Click](https://x.y)")).toContain("\\[");
    expect(preview("# Title")).toBe("\\# Title");
    expect(preview("<@&123> <t:1:R>")).toBe("\\<@&123> \\<t:1:R>");
  });
});

describe("prefillWait", () => {
  it("waits at most 1.5 s on a fresh interaction", () => {
    expect(prefillWait(Date.now())).toBe(1500);
  });

  it("shrinks with the time the interaction already spent", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    expect(prefillWait(10_000 - 1200)).toBe(1000);
    expect(prefillWait(10_000 - 5000)).toBe(0);
  });
});

describe("currentContent", () => {
  it("returns the current content", async () => {
    store.get.mockResolvedValue({ content: "hello" });
    expect(await currentContent("g1", "c1", 1500)).toBe("hello");
  });

  it("returns null without a sticky or when the lookup fails", async () => {
    store.get.mockResolvedValueOnce(null);
    expect(await currentContent("g1", "c1", 1500)).toBeNull();
    store.get.mockRejectedValueOnce(new Error("database"));
    expect(await currentContent("g1", "c1", 1500)).toBeNull();
  });

  it("gives up on a slow lookup so the modal opens in time", async () => {
    vi.useFakeTimers();
    store.get.mockReturnValue(new Promise(() => {}));
    const result = currentContent("g1", "c1", 800);
    await vi.advanceTimersByTimeAsync(800);
    expect(await result).toBeNull();
  });
});

describe("/sticky remove", () => {
  it.each([
    [{ removed: true, leftover: false }, "remove.done"],
    [{ removed: true, leftover: true }, "remove.leftover"],
    [{ removed: false, leftover: false }, "remove.none"],
  ])("answers %o with %s", async (result, key) => {
    poster.unstick.mockResolvedValue(result);
    const interaction = fakeInteraction("remove");
    await run(interaction);
    expect(poster.unstick).toHaveBeenCalledWith({ id: "c1" });
    expect(interaction.editReply.mock.calls[0]![0]).toContain(key);
  });
});

describe("/sticky list", () => {
  it("says when nothing is set", async () => {
    const interaction = fakeInteraction("list");
    await run(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith("list.empty");
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("lists the stickies and removes only deleted channels", async () => {
    store.list.mockResolvedValue([
      { channelId: "c1", content: "Read the rules", messageId: "m1" },
      { channelId: "gone", content: "Bye", messageId: null },
    ]);
    const interaction = fakeInteraction("list");
    await run(interaction);

    expect(store.remove).toHaveBeenCalledWith("g1", "gone");
    const reply = interaction.editReply.mock.calls[0]![0] as {
      embeds: { data: { description: string } }[];
      allowedMentions: unknown;
    };
    expect(reply.embeds[0]!.data.description).toBe("<#c1> → Read the rules");
    expect(reply.allowedMentions).toEqual({ parse: [] });
  });
});
