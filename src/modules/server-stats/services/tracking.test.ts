import {
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  type Guild,
  type GuildBasedChannel,
} from "discord.js";
import { describe, expect, it } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import type { ServerStatsConfigSchema } from "#modules/server-stats/server-stats.config.js";
import {
  channelShown,
  countedChannelId,
  isPublic,
  isTracked,
} from "./tracking.js";

const everyone = { id: "everyone" };

function fakeChannel(
  options: {
    id?: string;
    parentId?: string | null;
    parent?: { parentId: string | null } | null;
    thread?: boolean;
    type?: ChannelType;
    public?: boolean;
  } = {}
) {
  return {
    id: options.id ?? "200",
    parentId: options.parentId ?? null,
    parent: options.parent ?? null,
    type: options.type ?? ChannelType.GuildText,
    guild: { roles: { everyone } },
    isThread: () => options.thread ?? false,
    permissionsFor: (target: unknown) =>
      target === everyone
        ? new PermissionsBitField(
            options.public === false ? [] : [PermissionFlagsBits.ViewChannel]
          )
        : null,
  } as unknown as GuildBasedChannel;
}

function fakeConfig(
  values: {
    excluded?: string[];
    excludedCategories?: string[];
    includePrivate?: boolean;
  } = {}
) {
  const data: Record<string, unknown> = {
    excludedChannels: (values.excluded ?? []).map((id) => ({ id })),
    excludedCategories: (values.excludedCategories ?? []).map((id) => ({
      id,
    })),
    includePrivateChannels: values.includePrivate ?? false,
    showTopMembers: true,
  };
  return {
    get: (key: string) => data[key],
  } as unknown as ConfigProvider<ServerStatsConfigSchema>;
}

describe("isPublic", () => {
  it("checks whether @everyone can see the channel", () => {
    expect(isPublic(fakeChannel())).toBe(true);
    expect(isPublic(fakeChannel({ public: false }))).toBe(false);
  });

  it("never treats a private thread as public", () => {
    expect(
      isPublic(fakeChannel({ thread: true, type: ChannelType.PrivateThread }))
    ).toBe(false);
  });
});

describe("isTracked", () => {
  it("counts public channels only by default", () => {
    expect(isTracked(fakeChannel(), fakeConfig())).toBe(true);
    expect(isTracked(fakeChannel({ public: false }), fakeConfig())).toBe(false);
  });

  it("counts private channels when asked to", () => {
    expect(
      isTracked(
        fakeChannel({ public: false }),
        fakeConfig({ includePrivate: true })
      )
    ).toBe(true);
  });

  it("skips excluded channels, categories and their threads", () => {
    const config = fakeConfig({ excluded: ["10"], includePrivate: true });
    expect(isTracked(fakeChannel({ id: "10" }), config)).toBe(false);
    expect(isTracked(fakeChannel({ parentId: "10" }), config)).toBe(false);
    expect(
      isTracked(
        fakeChannel({
          thread: true,
          parentId: "11",
          parent: { parentId: "10" },
        }),
        config
      )
    ).toBe(false);
    expect(isTracked(fakeChannel({ parentId: "11" }), config)).toBe(true);
  });
});

describe("countedChannelId", () => {
  it("counts a thread under its parent channel", () => {
    expect(countedChannelId(fakeChannel({ id: "1" }))).toBe("1");
    expect(
      countedChannelId(fakeChannel({ id: "2", thread: true, parentId: "1" }))
    ).toBe("1");
  });
});

describe("excluded categories", () => {
  it("skips the channels and threads of an excluded category", () => {
    const config = fakeConfig({ excludedCategories: ["cat"] });
    expect(isTracked(fakeChannel({ parentId: "cat" }), config)).toBe(false);
    expect(
      isTracked(
        fakeChannel({
          thread: true,
          parentId: "200",
          parent: { parentId: "cat" },
        }),
        config
      )
    ).toBe(false);
  });
});

describe("channelShown", () => {
  it("leaves out a channel excluded or made private since, not a deleted one", () => {
    const guild = {
      channels: {
        cache: new Map([
          ["10", fakeChannel({ id: "10" })],
          ["11", fakeChannel({ id: "11", public: false })],
          ["12", fakeChannel({ id: "12" })],
        ]),
      },
    } as unknown as Guild;
    const shown = channelShown(guild, fakeConfig({ excluded: ["10"] }));
    expect(["10", "11", "12", "deleted"].map(shown)).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });
});
