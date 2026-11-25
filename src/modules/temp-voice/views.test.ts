import { Collection } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  deleteConfirmation,
  editModal,
  membersSheet,
  notifyRow,
  outcomeText,
  transferSelect,
} from "./views.js";

const t = (key: string, params?: Record<string, string>) =>
  params ? `${key} ${JSON.stringify(params)}` : key;

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
    panelMessageId: "m1",
    createdAt: new Date(),
    ...change,
  };
}

function member(id: string, bot = false) {
  return {
    id,
    displayName: `Name ${id}`,
    user: { bot, username: `user_${id}` },
  };
}

function voiceChannel(
  memberIds: string[],
  extra: Record<string, unknown> = {}
) {
  const members = new Collection(
    memberIds.map((id) => [id, member(id, id.startsWith("bot"))] as const)
  );
  return { id: "c1", name: "Salon", userLimit: 4, members, ...extra } as any;
}

function guildWith(names: Record<string, string> = {}) {
  const cache = new Map(
    Object.entries(names).map(([id, displayName]) => [id, { displayName }])
  );
  return { members: { cache } } as any;
}

const json = (component: { toJSON(): unknown }) => component.toJSON() as any;

describe("outcomeText", () => {
  it("translates the outcome's key with its parameters", () => {
    expect(
      outcomeText(t, { ok: true, key: "rename.done", params: { name: "x" } })
    ).toBe('rename.done {"name":"x"}');
  });
});

describe("editModal", () => {
  it("is prefilled with the channel's name and limit", () => {
    const modal = json(
      editModal(t, voiceChannel([], { name: "a".repeat(150) }))
    );
    expect(modal.custom_id).toBe("tempvoice-modal:edit:c1");
    const [name, limit] = modal.components.map((r: any) => r.components[0]);
    expect(name.value).toBe("a".repeat(100));
    expect(name.max_length).toBe(100);
    expect(limit.value).toBe("4");
  });
});

describe("membersSheet", () => {
  it("lists present humans, invited and blocked members", () => {
    const sheet = membersSheet(
      t,
      guildWith(),
      voiceChannel(["owner", "guest", "bot1"]),
      row({ trusted: ["friend"], blocked: [] }),
      "owner"
    );
    expect(sheet.content.split("\n")).toEqual([
      "members.title",
      `members.present ${JSON.stringify({ users: "<@owner>, <@guest>" })}`,
      `members.trusted ${JSON.stringify({ users: "<@friend>" })}`,
      `members.blocked ${JSON.stringify({ users: "members.nobody" })}`,
    ]);
  });

  it("shortens a long list with the count of the members left out", () => {
    const trusted = Array.from({ length: 23 }, (_, i) => `u${i}`);
    const { content } = membersSheet(
      t,
      guildWith(),
      voiceChannel([]),
      row({ trusted }),
      "owner"
    );
    const line = content.split("\n")[2]!;
    expect(line).toContain("<@u19>");
    expect(line).not.toContain("<@u20>");
    expect(line).toContain('members.more {\\"count\\":\\"3\\"}');
  });

  it("offers kick only for present members other than the owner, the actor and bots", () => {
    const { components } = membersSheet(
      t,
      guildWith(),
      voiceChannel(["owner", "mod", "guest", "bot1"]),
      row(),
      "mod"
    );
    const ids = components.map((c) => json(c).components[0].custom_id);
    expect(ids).toEqual([
      "tempvoice-users:trust:c1",
      "tempvoice-users:block:c1",
      "tempvoice-pick:kick:c1",
    ]);
    const kick = json(components[2]!).components[0];
    expect(kick.options.map((o: any) => o.value)).toEqual(["guest"]);
    expect(kick.options[0]).toMatchObject({
      label: "Name guest",
      description: "user_guest",
    });
    expect(kick.max_values).toBe(1);
  });

  it("lets the owner remove invites and blocks, named when known", () => {
    const { components } = membersSheet(
      t,
      guildWith({ friend: "Friend" }),
      voiceChannel(["owner"]),
      row({ trusted: ["friend"], blocked: ["foe"] }),
      "owner"
    );
    expect(components).toHaveLength(3);
    const revoke = json(components[2]!).components[0];
    expect(revoke.custom_id).toBe("tempvoice-pick:untrust:c1");
    expect(revoke.max_values).toBe(2);
    expect(revoke.options).toEqual([
      { label: "Friend", description: "revoke.kind.trusted", value: "friend" },
      { label: "foe", description: "revoke.kind.blocked", value: "foe" },
    ]);
  });
});

describe("transferSelect", () => {
  it("offers one present member other than the owner", () => {
    const view = transferSelect(
      t,
      voiceChannel(["owner", "a", "b"]),
      row(),
      "owner"
    );
    expect(view.content).toBe("select.transfer");
    const menu = json(view.components[0]!).components[0];
    expect(menu.custom_id).toBe("tempvoice-pick:transfer:c1");
    expect(menu.max_values).toBe(1);
    expect(menu.options.map((o: any) => o.value)).toEqual(["a", "b"]);
  });

  it("says so when nobody else is in the channel", () => {
    expect(
      transferSelect(t, voiceChannel(["owner", "bot1"]), row(), "owner")
    ).toEqual({ content: "transfer.empty", components: [] });
  });
});

describe("deleteConfirmation", () => {
  it("counts the humans who will be disconnected, the actor aside", () => {
    const view = deleteConfirmation(
      t,
      voiceChannel(["owner", "guest", "bot1"]),
      "c1",
      "owner"
    );
    expect(view.content).toBe(
      `delete.confirm ${JSON.stringify({ name: "Salon", count: "1" })}`
    );
    const ids = json(view.components[0]!).components.map(
      (b: any) => b.custom_id
    );
    expect(ids).toEqual(["tempvoice:deleteConfirm:c1", "tempvoice:cancel:c1"]);
  });
});

describe("notifyRow", () => {
  it("carries the request's token in the button", () => {
    expect(json(notifyRow(t, "c1", "tok")).components[0].custom_id).toBe(
      "tempvoice:notify:c1:tok"
    );
  });
});
