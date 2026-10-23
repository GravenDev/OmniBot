import { PermissionFlagsBits, type Message } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { canReplyWithFile } from "./permissions.js";

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
