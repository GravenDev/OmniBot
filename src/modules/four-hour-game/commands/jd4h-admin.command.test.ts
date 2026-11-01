import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  setScore: vi.fn(async () => "created" as const),
  deleteScore: vi.fn(async () => true),
}));
vi.mock("#modules/four-hour-game/services/four-hour-game.service.js", () => ({
  default: service,
}));

const { default: command } = await import("./jd4h-admin.command.js");

function interaction(subcommand: "set" | "unset") {
  const calls: string[] = [];
  const deferReply = vi.fn(async () => {
    calls.push("defer");
  });
  const editReply = vi.fn(async () => {
    calls.push("edit");
  });
  service.setScore.mockImplementation(async () => {
    calls.push("write");
    return "created";
  });
  service.deleteScore.mockImplementation(async () => {
    calls.push("write");
    return true;
  });
  return {
    calls,
    deferReply,
    editReply,
    interaction: {
      inGuild: () => true,
      guildId: "guild",
      user: { id: "admin" },
      deferReply,
      editReply,
      options: {
        getUser: () => ({ id: "member" }),
        getInteger: () => 5,
        getSubcommand: () => subcommand,
      },
    } as unknown as ChatInputCommandInteraction,
  };
}

const config = { t: (key: string) => key } as never;

describe("/jd4h-admin access", () => {
  it("is checked by the command dispatcher, before anything runs", () => {
    expect(command.requiresAdmin).toBe(true);
  });
});

describe("/jd4h-admin set", () => {
  it("asks for a score of at least 1, unset being the way to remove it", () => {
    const set = command.data
      .toJSON()
      .options?.find((option) => option.name === "set") as
      | { options?: { name: string; min_value?: number }[] }
      | undefined;
    const score = set?.options?.find((option) => option.name === "score");
    expect(score?.min_value).toBe(1);
  });
});

describe("/jd4h-admin replies", () => {
  it.each(["set", "unset"] as const)(
    "%s defers its private reply before waiting for the guild's queue",
    async (subcommand) => {
      const { calls, deferReply, interaction: i } = interaction(subcommand);

      await command.execute(i, config);

      expect(deferReply).toHaveBeenCalledWith({
        flags: MessageFlags.Ephemeral,
      });
      expect(calls).toEqual(["defer", "write", "edit"]);
    }
  );
});
