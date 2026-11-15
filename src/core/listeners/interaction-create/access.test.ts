import {
  type ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { silenceLogs } from "#lib/testing.js";
import { checkAccess, commandAccess, hasAccess } from "./access.js";

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

describe("checkAccess, admin", () => {
  it("lets an administrator through without replying", async () => {
    const { interaction, has, reply } = interactionWith([
      PermissionFlagsBits.Administrator,
    ]);

    expect(await checkAccess(interaction, "admin", t)).toBe(true);
    expect(has).toHaveBeenCalledWith(PermissionFlagsBits.Administrator);
    expect(reply).not.toHaveBeenCalled();
  });

  it.each([
    ["a member without the permission", [PermissionFlagsBits.ManageGuild]],
    ["permissions that cannot be resolved", null],
  ])("refuses %s with the admin message", async (_, granted) => {
    const { interaction, reply } = interactionWith(granted);

    expect(await checkAccess(interaction, "admin", t)).toBe(false);
    expect(reply).toHaveBeenCalledWith({
      content: "<admin.noPermission>",
      flags: MessageFlags.Ephemeral,
    });
  });
});

describe("checkAccess, permissions", () => {
  it("lets a member holding the permissions through", async () => {
    const { interaction, has, reply } = interactionWith([
      PermissionFlagsBits.ManageMessages,
    ]);

    expect(
      await checkAccess(
        interaction,
        { permissions: PermissionFlagsBits.ManageMessages },
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
      await checkAccess(
        interaction,
        { permissions: PermissionFlagsBits.ManageMessages },
        t
      )
    ).toBe(false);
    expect(reply).toHaveBeenCalledWith({
      content: "<interaction.memberMissingPermissions>",
      flags: MessageFlags.Ephemeral,
    });
  });
});

describe("checkAccess, everyone", () => {
  it("lets anyone through without reading permissions nor replying", async () => {
    const { interaction, has, reply } = interactionWith(null);

    expect(await checkAccess(interaction, "everyone", t)).toBe(true);
    expect(has).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
  });
});

describe("commandAccess", () => {
  it.each([
    [true, "admin"],
    [false, "everyone"],
    [undefined, "everyone"],
  ])("maps requiresAdmin %s to %s", (requiresAdmin, access) => {
    expect(commandAccess({ requiresAdmin })).toBe(access);
  });
});

describe("hasAccess", () => {
  it.each([
    ["admin", [PermissionFlagsBits.Administrator], true],
    ["admin", [PermissionFlagsBits.ManageGuild], false],
    ["admin", null, false],
    ["everyone", null, true],
  ] as const)("%s with %s gives %s", (access, granted, expected) => {
    const { interaction, reply } = interactionWith(
      granted === null ? null : [...granted]
    );

    expect(hasAccess(interaction, access)).toBe(expected);
    expect(reply).not.toHaveBeenCalled();
  });

  it("checks the declared permissions", () => {
    const { interaction, has } = interactionWith([
      PermissionFlagsBits.ManageMessages,
    ]);

    expect(
      hasAccess(interaction, {
        permissions: PermissionFlagsBits.ManageMessages,
      })
    ).toBe(true);
    expect(has).toHaveBeenCalledWith(PermissionFlagsBits.ManageMessages);
  });
});
