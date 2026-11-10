import {
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
} from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import handler, { deleteButton } from "./delete.button.js";

const config = { t: (key: string) => key } as unknown as ConfigProvider<{}>;

function fakeInteraction(userId: string, canManageMessages = false) {
  const remove = vi.fn(async () => ({}));
  const reply = vi.fn(async () => ({}));
  const interaction = {
    user: { id: userId },
    memberPermissions: {
      has: (permission: bigint) =>
        canManageMessages && permission === PermissionFlagsBits.ManageMessages,
    },
    message: { delete: remove },
    reply,
  } as unknown as ButtonInteraction;
  return { interaction, remove, reply };
}

describe("deleteButton", () => {
  it("encodes each allowed member once", () => {
    const button = deleteButton((key) => key, ["1", "2", "1"]).toJSON();
    expect(button).toMatchObject({
      custom_id: "message-quote:1:2",
      emoji: { name: "🗑️" },
    });
  });
});

describe("delete handler", () => {
  it("lets the quoter and the quoted authors delete the quote", async () => {
    for (const userId of ["1", "2"]) {
      const { interaction, remove } = fakeInteraction(userId);
      await handler.execute(interaction, ["1", "2"], config);
      expect(remove).toHaveBeenCalledOnce();
    }
  });

  it("lets moderators delete any quote", async () => {
    const { interaction, remove } = fakeInteraction("9", true);
    await handler.execute(interaction, ["1", "2"], config);
    expect(remove).toHaveBeenCalledOnce();
  });

  it("refuses anybody else privately", async () => {
    const { interaction, remove, reply } = fakeInteraction("9");
    await handler.execute(interaction, ["1", "2"], config);
    expect(remove).not.toHaveBeenCalled();
    const [payload] = reply.mock.calls[0] as unknown as [
      { content?: string; components: { toJSON(): unknown }[]; flags: number },
    ];
    expect(payload.content).toBeUndefined();
    expect(payload.flags).toBe(
      MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    );
    expect(payload.components.map((component) => component.toJSON())).toEqual([
      { type: 10, content: "delete.notAllowed" },
    ]);
  });
});
