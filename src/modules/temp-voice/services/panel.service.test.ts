import { beforeEach, describe, expect, it, vi } from "vitest";
import { silenceLogs } from "#lib/testing.js";

const tempVoiceChannel = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("#lib/database.js", () => ({ default: { tempVoiceChannel } }));

const { default: panel } = await import("./panel.service.js");

silenceLogs();

const t = (key: string) => key;

function row(change: Record<string, unknown> = {}) {
  return {
    channelId: "c1",
    guildId: "g1",
    hubId: "h1",
    ownerId: "owner",
    locked: false,
    hidden: false,
    trusted: [] as string[],
    blocked: [] as string[],
    panelMessageId: null as string | null,
    createdAt: new Date(),
    ...change,
  };
}

function voiceChannel() {
  return {
    id: "c1",
    name: "Salon",
    userLimit: 0,
    members: new Map([["owner", {}]]),
    send: vi.fn(async () => ({ id: "m1" })),
    messages: { edit: vi.fn(async () => undefined) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tempVoiceChannel.updateMany.mockResolvedValue({ count: 1 });
});

describe("post", () => {
  it("posts the panel in the channel and remembers its message", async () => {
    const channel = voiceChannel();
    expect(await panel.post(channel as any, row(), t)).toBe(true);

    const [message] = channel.send.mock.calls[0] as unknown as [any];
    expect(JSON.stringify(message.components)).toContain("tempvoice:edit:c1");
    expect(tempVoiceChannel.updateMany).toHaveBeenCalledWith({
      where: { channelId: "c1" },
      data: { panelMessageId: "m1" },
    });
  });

  it("reports a panel Discord refused, without storing a message", async () => {
    const channel = voiceChannel();
    channel.send.mockRejectedValueOnce(new Error("Missing Access"));

    expect(await panel.post(channel as any, row(), t)).toBe(false);
    expect(tempVoiceChannel.updateMany).not.toHaveBeenCalled();
  });
});

describe("refresh", () => {
  it("edits the posted panel, dropping the embeds of older versions", async () => {
    const channel = voiceChannel();
    await panel.refresh(channel as any, row({ panelMessageId: "m1" }), t);

    const [id, message] = channel.messages.edit.mock.calls[0] as unknown as [
      string,
      any,
    ];
    expect(id).toBe("m1");
    expect(message.embeds).toEqual([]);
    expect(JSON.stringify(message.components)).toContain("tempvoice:edit:c1");
  });

  it("does nothing without a posted panel, and survives a deleted one", async () => {
    const channel = voiceChannel();
    await panel.refresh(channel as any, row(), t);
    expect(channel.messages.edit).not.toHaveBeenCalled();

    channel.messages.edit.mockRejectedValueOnce(new Error("Unknown Message"));
    await expect(
      panel.refresh(channel as any, row({ panelMessageId: "m1" }), t)
    ).resolves.toBeUndefined();
  });
});
