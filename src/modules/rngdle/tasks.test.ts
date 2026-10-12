import type { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";
import type { RngdleConfigSchema } from "./rngdle.config.js";

const send = vi.hoisted(() => vi.fn());

vi.mock("#core/services/config.service.js", () => ({
  default: {
    getConfigForModuleIn: async () => ({
      t: (key: string) => key,
      locale: "en",
      get: () => ({ isSendable: () => true, send }),
    }),
  },
}));
vi.mock("#core/services/mention.service.js", () => ({
  default: { mentionable: async (_guildId: string, ids: string[]) => ids },
}));
vi.mock("#core/services/module.service.js", () => ({
  default: { getActivatedGuildIds: async () => ["guild"] },
}));
vi.mock("./services/sync.js", () => ({
  default: { syncAll: async () => undefined },
}));
vi.mock("./services/views.js", () => ({
  dailyLeaderboard: async () => ({
    image: Buffer.from("png"),
    winnerIds: ["winner"],
  }),
  dailyRecap: async () => ({
    participants: 4,
    rarest: null,
    worst: null,
    streaks: [],
  }),
}));

const { rngdleTasks } = await import("./tasks.js");

describe("daily leaderboard task", () => {
  it("posts the recap text with the profile and overall leaderboard buttons", async () => {
    const task = rngdleTasks({
      id: "rngdle",
    } as unknown as Module<RngdleConfigSchema>).find(
      (declared) => declared.id === "daily-leaderboard"
    )!;

    await task.run({} as Client<true>);

    const [message] = send.mock.calls[0]! as [
      {
        content: string;
        components: { toJSON(): { components: { custom_id?: string }[] } }[];
      },
    ];
    expect(message.content.split("\n")).toEqual([
      "daily.message",
      "daily.participants",
    ]);
    expect(
      message.components.flatMap((row) =>
        row.toJSON().components.map((button) => button.custom_id)
      )
    ).toEqual(["rngdle-nav:profile", "rngdle-nav:overall"]);
  });
});
