import type {
  ChatInputCommandInteraction,
  PermissionsString,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  set: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
}));

vi.mock("#modules/autoreact/services/store.js", () => ({ default: store }));

const { default: command, parseEmoji } = await import("./autoreact.command.js");

const hype = { id: "111111111111111111", name: "hype", animated: false };
const ALL_PERMISSIONS: PermissionsString[] = [
  "ViewChannel",
  "ReadMessageHistory",
  "AddReactions",
];

interface FakeOptions {
  subcommand?: string;
  emoji?: string;
  guildEmojis?: (typeof hype)[];
  clientEmojiIds?: string[];
  granted?: PermissionsString[];
  channelIds?: string[];
}

function fakeInteraction(options: FakeOptions = {}) {
  const granted = options.granted ?? ALL_PERMISSIONS;
  const channel = {
    id: "c1",
    permissionsFor: () => ({
      missing: (required: PermissionsString[]) =>
        required.filter((permission) => !granted.includes(permission)),
    }),
  };
  return {
    guildId: "g1",
    user: { id: "admin" },
    inCachedGuild: () => true,
    options: {
      getSubcommand: () => options.subcommand ?? "set",
      getChannel: () => channel,
      getString: () => options.emoji ?? "👍",
    },
    deferReply: vi.fn(),
    editReply: vi.fn(),
    guild: {
      emojis: {
        fetch: async () =>
          new Map((options.guildEmojis ?? []).map((e) => [e.id, e])),
      },
      members: { me: {}, fetchMe: vi.fn() },
      channels: {
        cache: new Map((options.channelIds ?? ["c1"]).map((id) => [id, {}])),
      },
    },
    client: {
      emojis: {
        resolve: (id: string) =>
          (options.clientEmojiIds ?? []).includes(id) ? {} : null,
      },
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

function asInteraction(interaction: Fake) {
  return interaction as unknown as ChatInputCommandInteraction<"cached">;
}

beforeEach(() => {
  vi.clearAllMocks();
  store.remove.mockResolvedValue(1);
  store.list.mockResolvedValue([]);
});

describe("parseEmoji", () => {
  it("accepts a Unicode emoji", async () => {
    expect(await parseEmoji(asInteraction(fakeInteraction()), " 👍 ")).toBe(
      "👍"
    );
  });

  it("resolves a fetched guild emoji by name", async () => {
    const interaction = asInteraction(fakeInteraction({ guildEmojis: [hype] }));
    expect(await parseEmoji(interaction, "hype")).toBe(`<:hype:${hype.id}>`);
  });

  it("accepts a guild emoji missing from the client cache", async () => {
    const interaction = asInteraction(fakeInteraction({ guildEmojis: [hype] }));
    expect(await parseEmoji(interaction, `<:hype:${hype.id}>`)).toBe(
      `<:hype:${hype.id}>`
    );
  });

  it("accepts an emoji from another server the bot is in", async () => {
    const id = "222222222222222222";
    const interaction = asInteraction(
      fakeInteraction({ clientEmojiIds: [id] })
    );
    expect(await parseEmoji(interaction, `<:other:${id}>`)).toBe(
      `<:other:${id}>`
    );
  });

  it("rejects a custom emoji the bot cannot use", async () => {
    expect(
      await parseEmoji(
        asInteraction(fakeInteraction()),
        "<:other:333333333333333333>"
      )
    ).toBeNull();
  });

  it("rejects text that is not an emoji", async () => {
    expect(
      await parseEmoji(asInteraction(fakeInteraction()), "hello world")
    ).toBeNull();
  });
});

describe("/autoreact set", () => {
  it("saves the reaction and confirms", async () => {
    const interaction = fakeInteraction();
    await run(interaction);
    expect(store.set).toHaveBeenCalledWith("g1", "c1", "👍");
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("set.done")
    );
  });

  it("refuses an invalid emoji", async () => {
    const interaction = fakeInteraction({ emoji: "hello" });
    await run(interaction);
    expect(store.set).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("set.invalidEmoji")
    );
  });

  it("refuses a channel where the bot cannot react", async () => {
    const interaction = fakeInteraction({ granted: ["ViewChannel"] });
    await run(interaction);
    expect(store.set).not.toHaveBeenCalled();
    const reply = interaction.editReply.mock.calls[0]![0] as string;
    expect(reply).toContain("set.missingPermissions");
    expect(reply).toContain("permission.ReadMessageHistory");
    expect(reply).toContain("permission.AddReactions");
    expect(reply).not.toContain("permission.ViewChannel");
  });
});

describe("/autoreact remove", () => {
  it("removes the channel's reaction", async () => {
    const interaction = fakeInteraction({ subcommand: "remove" });
    await run(interaction);
    expect(store.remove).toHaveBeenCalledWith("g1", "c1");
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("remove.done")
    );
  });

  it("says when there was nothing to remove", async () => {
    store.remove.mockResolvedValue(0);
    const interaction = fakeInteraction({ subcommand: "remove" });
    await run(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("remove.none")
    );
  });
});

describe("/autoreact list", () => {
  it("says when nothing is set", async () => {
    const interaction = fakeInteraction({ subcommand: "list" });
    await run(interaction);
    expect(interaction.editReply).toHaveBeenCalledWith("list.empty");
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("lists the reactions and removes only deleted channels", async () => {
    store.list.mockResolvedValue([
      { channelId: "c1", emoji: "👍" },
      { channelId: "gone", emoji: "🎉" },
    ]);
    const interaction = fakeInteraction({ subcommand: "list" });
    await run(interaction);

    expect(store.remove).toHaveBeenCalledWith("g1", "gone");
    const reply = interaction.editReply.mock.calls[0]![0] as {
      embeds: { data: { description: string } }[];
    };
    expect(reply.embeds[0]!.data.description).toBe("<#c1> → 👍");
  });
});
