import { ChannelType, type PermissionsString } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const poster = vi.hoisted(() => ({ set: vi.fn() }));

vi.mock("#modules/sticky/services/poster.js", () => ({ default: poster }));
vi.mock("#modules/sticky/services/store.js", () => ({ default: {} }));

const { default: handler } = await import("./sticky.modal.js");

interface FakeOptions {
  channelId?: string;
  type?: ChannelType;
  content?: string;
  granted?: PermissionsString[];
}

function fakeInteraction(options: FakeOptions = {}) {
  const granted = options.granted ?? ["ViewChannel", "SendMessages"];
  const channel = {
    id: "c1",
    type: options.type ?? ChannelType.GuildText,
    permissionsFor: () => ({
      missing: (required: PermissionsString[]) =>
        required.filter((permission) => !granted.includes(permission)),
    }),
  };
  return {
    guildId: "g1",
    user: { id: "admin" },
    inCachedGuild: () => true,
    deferReply: vi.fn(),
    editReply: vi.fn(),
    fields: { getTextInputValue: () => options.content ?? " Read the rules " },
    guild: {
      members: { me: {} },
      channels: { cache: new Map([["c1", channel]]) },
    },
  };
}

type Fake = ReturnType<typeof fakeInteraction>;

const config = {
  t: (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key} ${JSON.stringify(vars)}` : key,
} as never;

async function run(interaction: Fake, channelId = "c1") {
  await handler.execute(interaction as never, [channelId], config);
}

function reply(interaction: Fake): string {
  return interaction.editReply.mock.calls[0]![0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  poster.set.mockResolvedValue(true);
});

describe("sticky modal", () => {
  it("saves the trimmed content, posts it and confirms", async () => {
    const interaction = fakeInteraction();
    await run(interaction);
    expect(poster.set).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c1" }),
      "Read the rules"
    );
    expect(reply(interaction)).toContain("set.done");
  });

  it("says when the message is saved but not posted", async () => {
    poster.set.mockResolvedValue(false);
    const interaction = fakeInteraction();
    await run(interaction);
    expect(reply(interaction)).toContain("set.notPosted");
  });

  it("refuses a channel that no longer exists", async () => {
    const interaction = fakeInteraction();
    await run(interaction, "gone");
    expect(poster.set).not.toHaveBeenCalled();
    expect(reply(interaction)).toBe("set.unknownChannel");
  });

  it("refuses a channel that is not a text or announcement channel", async () => {
    const interaction = fakeInteraction({ type: ChannelType.GuildVoice });
    await run(interaction);
    expect(poster.set).not.toHaveBeenCalled();
  });

  it("refuses blank content", async () => {
    const interaction = fakeInteraction({ content: "   " });
    await run(interaction);
    expect(poster.set).not.toHaveBeenCalled();
    expect(reply(interaction)).toBe("set.empty");
  });

  it("names the permissions the bot lacks", async () => {
    const interaction = fakeInteraction({ granted: ["ViewChannel"] });
    await run(interaction);
    expect(poster.set).not.toHaveBeenCalled();
    expect(reply(interaction)).toContain("set.missingPermissions");
    expect(reply(interaction)).toContain("permission.SendMessages");
    expect(reply(interaction)).not.toContain("permission.ViewChannel");
  });
});
