import {
  type ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { silenceLogs } from "#lib/testing.js";
import { requireAdmin, requirePermissions } from "./require-admin.js";

beforeAll(() => {
  silenceLogs();
});

const t = ((key: string) => `<${key}>`) as never;

function interactionWith(granted: bigint[] | null) {
  const has = vi.fn((wanted: bigint) => granted?.includes(wanted) ?? false);
  const reply = vi.fn(async () => undefined);
  const interaction = {
    guildId: "guild",
    user: { id: "user" },
    memberPermissions: granted === null ? null : { has },
    reply,
  } as unknown as ChatInputCommandInteraction;
  return { interaction, has, reply };
}

describe("requireAdmin", () => {
  it("lets an administrator through without replying", async () => {
    const { interaction, has, reply } = interactionWith([
      PermissionFlagsBits.Administrator,
    ]);

    expect(await requireAdmin(interaction, t)).toBe(true);
    expect(has).toHaveBeenCalledWith(PermissionFlagsBits.Administrator);
    expect(reply).not.toHaveBeenCalled();
  });

  it.each([
    ["a member without the permission", [PermissionFlagsBits.ManageGuild]],
    ["permissions that cannot be resolved", null],
  ])("refuses %s with the admin message", async (_, granted) => {
    const { interaction, reply } = interactionWith(granted);

    expect(await requireAdmin(interaction, t)).toBe(false);
    expect(reply).toHaveBeenCalledWith({
      content: "<admin.noPermission>",
      flags: MessageFlags.Ephemeral,
    });
  });
});

describe("requirePermissions", () => {
  it("lets a member holding the permissions through", async () => {
    const { interaction, has, reply } = interactionWith([
      PermissionFlagsBits.ManageMessages,
    ]);

    expect(
      await requirePermissions(
        interaction,
        PermissionFlagsBits.ManageMessages,
        t
      )
    ).toBe(true);
    expect(has).toHaveBeenCalledWith(PermissionFlagsBits.ManageMessages);
    expect(reply).not.toHaveBeenCalled();
  });

  it.each([
    ["a member lacking them", [PermissionFlagsBits.ViewChannel]],
    ["permissions that cannot be resolved", null],
  ])("refuses %s with the missing permissions message", async (_, granted) => {
    const { interaction, reply } = interactionWith(granted);

    expect(
      await requirePermissions(
        interaction,
        PermissionFlagsBits.ManageMessages,
        t
      )
    ).toBe(false);
    expect(reply).toHaveBeenCalledWith({
      content: "<interaction.memberMissingPermissions>",
      flags: MessageFlags.Ephemeral,
    });
  });
});
