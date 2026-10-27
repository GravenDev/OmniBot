import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  kick: vi.fn(async () => ({ ok: true, key: "kick.done" })),
  revoke: vi.fn(async () => ({ ok: true, key: "revoke.done" })),
  transfer: vi.fn(async () => ({ ok: true, key: "transfer.done" })),
  withChannel: vi.fn(),
}));

vi.mock("#lib/database.js", () => ({ default: {} }));
vi.mock("#modules/temp-voice/services/actions.js", () => actions);

const { default: handler } = await import("./pick.select.js");

const config = { t: (key: string) => key } as any;
const alice = { id: "alice" };
const guild = { members: { cache: new Map([["alice", alice]]) } };

function interaction(values: string[]) {
  return {
    values,
    guild,
    member: { id: "owner" },
    inCachedGuild: () => true,
    deferUpdate: vi.fn(),
    editReply: vi.fn(),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.withChannel.mockImplementation(
    async (_guild, _channelId, _actor, _config, run) => run({ guild })
  );
});

describe("pick select", () => {
  it("kicks the members picked, ignoring those who left the server", async () => {
    const pick = interaction(["alice", "gone"]);
    await handler.execute(pick, ["kick", "c1"], config);
    expect(actions.withChannel.mock.calls[0]![1]).toBe("c1");
    expect(actions.kick).toHaveBeenCalledWith({ guild }, [alice]);
    expect(pick.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: "kick.done", components: [] })
    );
  });

  it("transfers to the member picked, and reports one who left", async () => {
    await handler.execute(interaction(["alice"]), ["transfer", "c1"], config);
    expect(actions.transfer).toHaveBeenCalledWith({ guild }, alice);

    const gone = interaction(["gone"]);
    await handler.execute(gone, ["transfer", "c1"], config);
    expect(gone.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: "select.noMember" })
    );
  });

  it("revokes the ids picked", async () => {
    await handler.execute(interaction(["x", "y"]), ["untrust", "c1"], config);
    expect(actions.revoke).toHaveBeenCalledWith({ guild }, ["x", "y"]);
  });

  it("ignores unknown actions and missing channel ids", async () => {
    const pick = interaction(["alice"]);
    await handler.execute(pick, ["region", "c1"], config);
    await handler.execute(pick, ["kick"], config);
    expect(pick.deferUpdate).not.toHaveBeenCalled();
    expect(actions.withChannel).not.toHaveBeenCalled();
  });
});
