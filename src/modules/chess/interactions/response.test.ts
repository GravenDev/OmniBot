import { MessageFlags } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChessMessage } from "../views.js";
import {
  beginButtonEdit,
  deferWithEphemeralStatus,
  finishButtonStatus,
  respondToButton,
} from "./response.js";

const ephemeral: ChessMessage = {
  components: [],
  flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  allowedMentions: { parse: [] },
};
const publicMessage: ChessMessage = {
  components: [],
  flags: MessageFlags.IsComponentsV2,
  allowedMentions: { parse: [] },
};

function interaction(originalEphemeral: boolean) {
  const edit = vi.fn(async () => undefined);
  const deferred = { edit };
  const deferUpdate = vi.fn(async () => deferred);
  const webhook = {
    editMessage: vi.fn(async () => undefined),
    deleteMessage: vi.fn(async () => undefined),
  };
  const followUp = vi.fn(async () => ({ id: "status-id" }));
  return {
    message: { flags: { has: vi.fn(() => originalEphemeral) } },
    deferUpdate,
    followUp,
    deferred,
    webhook,
  };
}

describe("button responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses one acknowledgement for several edits of the same message", async () => {
    const fake = interaction(true);
    const edit = await beginButtonEdit(fake as never);
    await edit(ephemeral);
    await edit(publicMessage);

    expect(fake.deferUpdate).toHaveBeenCalledTimes(1);
    expect(fake.deferred.edit).toHaveBeenCalledTimes(2);
    expect(fake.followUp).not.toHaveBeenCalled();
  });

  it("replaces an ephemeral board while navigating it", async () => {
    const fake = interaction(true);
    await respondToButton(fake as never, ephemeral, true);
    expect(fake.deferred.edit).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.IsComponentsV2 })
    );
    expect(fake.followUp).not.toHaveBeenCalled();
  });

  it("edits the board itself when navigating a public message", async () => {
    const fake = interaction(false);
    await respondToButton(fake as never, ephemeral, true);
    expect(fake.deferred.edit).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.IsComponentsV2 })
    );
    expect(fake.followUp).not.toHaveBeenCalled();
  });

  it("follows up an ephemeral message with a public selected game", async () => {
    const fake = interaction(true);
    await respondToButton(fake as never, publicMessage);
    expect(fake.deferUpdate).toHaveBeenCalled();
    expect(fake.deferred.edit).not.toHaveBeenCalled();
    expect(fake.followUp).toHaveBeenCalledWith(publicMessage);
  });

  it("keeps the board when analysis produces an ephemeral result", async () => {
    const fake = interaction(true);
    const flow = await deferWithEphemeralStatus(fake as never, ephemeral);
    await finishButtonStatus(flow, fake as never, ephemeral);
    expect(fake.deferred.edit).not.toHaveBeenCalled();
    // The ephemeral status is edited through the interaction webhook: the
    // channel endpoint answers Unknown Message (10008) for those messages.
    expect(fake.webhook.editMessage).toHaveBeenCalledWith(
      "status-id",
      expect.objectContaining({ flags: MessageFlags.IsComponentsV2 })
    );
  });

  it("deletes the status when a public result follows a list pick", async () => {
    const fake = interaction(true);
    const flow = await deferWithEphemeralStatus(fake as never, ephemeral);
    await finishButtonStatus(flow, fake as never, publicMessage);
    expect(fake.webhook.deleteMessage).toHaveBeenCalledWith("status-id");
    expect(fake.followUp).toHaveBeenLastCalledWith(publicMessage);
  });
});
