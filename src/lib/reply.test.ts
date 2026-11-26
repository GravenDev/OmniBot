import { MessageFlags, type RepliableInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { replyEphemeral } from "./reply.js";

function interaction(state: { replied?: boolean; deferred?: boolean }) {
  return {
    replied: false,
    deferred: false,
    ...state,
    reply: vi.fn(async () => ({})),
    followUp: vi.fn(async () => ({})),
  };
}

const payload = { content: "hello", flags: MessageFlags.Ephemeral };

describe("replyEphemeral", () => {
  it("replies to an interaction not answered yet", async () => {
    const fake = interaction({});
    await replyEphemeral(fake as unknown as RepliableInteraction, "hello");

    expect(fake.reply).toHaveBeenCalledWith(payload);
    expect(fake.followUp).not.toHaveBeenCalled();
  });

  it.each([
    ["answered", { replied: true }],
    ["deferred", { deferred: true }],
  ])("follows up an interaction already %s", async (_, state) => {
    const fake = interaction(state);
    await replyEphemeral(fake as unknown as RepliableInteraction, "hello");

    expect(fake.followUp).toHaveBeenCalledWith(payload);
    expect(fake.reply).not.toHaveBeenCalled();
  });

  it("forwards the allowed mentions when the caller supplies them", async () => {
    const fake = interaction({});
    const mentions = { parse: [], repliedUser: false };
    await replyEphemeral(
      fake as unknown as RepliableInteraction,
      "hello",
      mentions
    );

    expect(fake.reply).toHaveBeenCalledWith({
      ...payload,
      allowedMentions: mentions,
    });
  });
});
