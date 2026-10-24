import {
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type Message,
  type PermissionsString,
} from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { canReplyWithFile, missingBotPermissions } from "./permissions.js";

function messageIn(thread: boolean, granted: boolean | null) {
  const has = vi.fn(() => granted ?? false);
  const message = {
    client: { user: { id: "bot" } },
    channel: {
      isThread: () => thread,
      permissionsFor: () => (granted === null ? null : { has }),
    },
  } as unknown as Message<true>;
  return { message, has };
}

describe("canReplyWithFile", () => {
  it.each([
    [false, PermissionFlagsBits.SendMessages],
    [true, PermissionFlagsBits.SendMessagesInThreads],
  ])("asks for the right send permission (thread: %s)", (thread, send) => {
    const { message, has } = messageIn(thread, true);

    expect(canReplyWithFile(message)).toBe(true);
    expect(has).toHaveBeenCalledWith([
      PermissionFlagsBits.ViewChannel,
      send,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.ReadMessageHistory,
    ]);
  });

  it("refuses when a permission is missing or cannot be resolved", () => {
    expect(canReplyWithFile(messageIn(false, false).message)).toBe(false);
    expect(canReplyWithFile(messageIn(false, null).message)).toBe(false);
  });
});

describe("missingBotPermissions", () => {
  const required: PermissionsString[] = ["ViewChannel", "SendMessages"];

  function channelGranting(granted: PermissionsString[] | null) {
    return {
      permissionsFor: () =>
        granted === null
          ? null
          : {
              missing: (wanted: PermissionsString[]) =>
                wanted.filter((permission) => !granted.includes(permission)),
            },
    } as unknown as GuildBasedChannel;
  }

  it("lists the permissions the bot lacks", async () => {
    const guild = { members: { me: {} } } as unknown as Guild;
    expect(
      await missingBotPermissions(
        guild,
        channelGranting(["ViewChannel"]),
        required
      )
    ).toEqual(["SendMessages"]);
  });

  it("fetches the bot member when it is not cached", async () => {
    const fetchMe = vi.fn(async () => ({}));
    const guild = { members: { me: null, fetchMe } } as unknown as Guild;
    await missingBotPermissions(guild, channelGranting(required), required);
    expect(fetchMe).toHaveBeenCalled();
  });

  it("counts unresolved permissions as missing", async () => {
    const guild = { members: { me: {} } } as unknown as Guild;
    expect(
      await missingBotPermissions(guild, channelGranting(null), required)
    ).toEqual(required);
  });
});
