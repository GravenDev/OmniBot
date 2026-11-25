import {
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import { describe, expect, it } from "vitest";
import {
  desiredOverwrites,
  overwriteChanges,
  type AccessState,
  type Overwrite,
} from "./overwrites.js";

const VIEW = PermissionFlagsBits.ViewChannel;
const CONNECT = PermissionFlagsBits.Connect;
const SPEAK = PermissionFlagsBits.Speak;
const ALL = PermissionsBitField.All;

const everyone = "guild";
const bot = "bot";
const member = "role-member";

function state(change: Partial<AccessState> = {}): AccessState {
  return {
    ownerId: "owner",
    locked: false,
    hidden: false,
    trusted: [],
    blocked: [],
    ...change,
  };
}

function role(id: string, allow = 0n, deny = 0n): Overwrite {
  return { id, type: OverwriteType.Role, allow, deny };
}

const base = [role(everyone, 0n, VIEW), role(member, VIEW | CONNECT)];

function desired(access: AccessState, botPermissions = ALL) {
  return new Map(
    desiredOverwrites(access, {
      everyoneId: everyone,
      botId: bot,
      botPermissions,
      base,
    }).map((o) => [o.id, o])
  );
}

describe("desiredOverwrites", () => {
  it("keeps the category permissions of an open channel", () => {
    const result = desired(state());
    expect(result.get(everyone)).toEqual(role(everyone, 0n, VIEW));
    expect(result.get(member)).toEqual(role(member, VIEW | CONNECT));
  });

  it("gives the owner and the bot access", () => {
    const result = desired(state());
    expect(result.get("owner")?.allow).toBe(VIEW | CONNECT);
    expect(result.get(bot)?.allow).toBeTruthy();
    expect(result.get(bot)!.allow & PermissionFlagsBits.ManageChannels).toBe(
      PermissionFlagsBits.ManageChannels
    );
  });

  it("denies Connect to every role when locked, even one allowed by the category", () => {
    const result = desired(state({ locked: true }));
    expect(result.get(everyone)!.deny & CONNECT).toBe(CONNECT);
    expect(result.get(member)!.deny & CONNECT).toBe(CONNECT);
    expect(result.get(member)!.allow & CONNECT).toBe(0n);
    expect(result.get(member)!.allow & VIEW).toBe(VIEW);
  });

  it("denies ViewChannel to every role when hidden", () => {
    const result = desired(state({ hidden: true }));
    expect(result.get(member)!.deny & VIEW).toBe(VIEW);
    expect(result.get(member)!.allow & VIEW).toBe(0n);
  });

  it("lets trusted members in and keeps blocked members out", () => {
    const result = desired(
      state({ locked: true, trusted: ["friend"], blocked: ["troll"] })
    );
    expect(result.get("friend")!.allow).toBe(VIEW | CONNECT);
    expect(result.get("troll")!.deny).toBe(VIEW | CONNECT);
  });

  it("never blocks the owner, and blocking wins over trust", () => {
    const result = desired(
      state({ trusted: ["both"], blocked: ["both", "owner"] })
    );
    expect(result.get("owner")!.deny).toBe(0n);
    expect(result.get("both")!.allow).toBe(0n);
    expect(result.get("both")!.deny).toBe(VIEW | CONNECT);
  });

  it("only grants the permissions the bot holds", () => {
    const result = desired(state(), VIEW | CONNECT);
    expect(result.get("owner")!.allow).toBe(VIEW | CONNECT);
    expect(result.get(bot)!.allow).toBe(VIEW | CONNECT);
  });
});

describe("overwriteChanges", () => {
  const context = (current: Overwrite[]) => ({
    everyoneId: everyone,
    botId: bot,
    botPermissions: ALL,
    base,
    current,
  });

  it("changes nothing when the channel already matches", () => {
    const current = desiredOverwrites(state({ locked: true }), context(base));
    expect(overwriteChanges(state({ locked: true }), context(current))).toEqual(
      []
    );
  });

  it("restores the category permissions on unlock", () => {
    const locked = desiredOverwrites(state({ locked: true }), context(base));
    const changes = overwriteChanges(state(), context(locked));
    const memberChange = changes.find(
      (c) => c.kind === "set" && c.overwrite.id === member
    );
    expect(memberChange).toEqual({
      kind: "set",
      overwrite: role(member, VIEW | CONNECT),
    });
  });

  it("deletes the overwrite of a member no longer trusted, and of a former owner", () => {
    const current = desiredOverwrites(
      state({ trusted: ["friend"] }),
      context(base)
    );
    const changes = overwriteChanges(state({ ownerId: "friend" }), {
      ...context(current),
      released: ["owner", "friend"],
    });
    expect(changes).toContainEqual({ kind: "delete", id: "owner" });
    expect(changes).not.toContainEqual({ kind: "delete", id: "friend" });
  });

  it("keeps member overwrites it never managed", () => {
    const manual = {
      id: "stranger",
      type: OverwriteType.Member,
      allow: 0n,
      deny: SPEAK,
    };
    const current = [...desiredOverwrites(state(), context(base)), manual];
    const changes = overwriteChanges(state(), {
      ...context(current),
      released: ["owner"],
    });
    expect(changes).toEqual([]);
  });

  it("never touches staff roles, but locks roles holding permissions the bot lacks", () => {
    const staff = role(
      "staff",
      VIEW | CONNECT | PermissionFlagsBits.MoveMembers
    );
    const soundboard = role(
      "soundboard",
      VIEW | CONNECT | PermissionFlagsBits.UseSoundboard
    );
    const result = new Map(
      desiredOverwrites(state({ locked: true }), {
        everyoneId: everyone,
        botId: bot,
        botPermissions:
          PermissionsBitField.All & ~PermissionFlagsBits.UseSoundboard,
        base: [...base, staff, soundboard],
      }).map((o) => [o.id, o])
    );
    expect(result.get("staff")).toEqual(staff);
    expect(result.get("soundboard")!.deny & CONNECT).toBe(CONNECT);
    expect(result.get("soundboard")!.allow & CONNECT).toBe(0n);
  });

  it("never locks out a role that is staff through its server permissions", () => {
    const mods = role("mods", VIEW);
    const result = new Map(
      desiredOverwrites(state({ locked: true, hidden: true }), {
        everyoneId: everyone,
        botId: bot,
        botPermissions: ALL,
        base: [...base, mods],
        staffRoles: new Set(["mods"]),
      }).map((o) => [o.id, o])
    );
    expect(result.get("mods")).toEqual(mods);
  });

  it("leaves a role overwrite added by hand intact through lock and unlock", () => {
    const manual = role("guests", VIEW | CONNECT);
    const open = [...desiredOverwrites(state(), context(base)), manual];
    const locked = desiredOverwrites(state({ locked: true }), context(open));
    expect(locked.find((o) => o.id === "guests")).toEqual(manual);
    const reopened = desiredOverwrites(state(), context(locked));
    expect(reopened.find((o) => o.id === "guests")).toEqual(manual);
  });

  it("only grants members what they already hold on the hub", () => {
    const result = new Map(
      desiredOverwrites(state({ trusted: ["jailed"] }), {
        everyoneId: everyone,
        botId: bot,
        botPermissions: ALL,
        base,
        grantable: new Map([
          ["jailed", 0n],
          ["owner", VIEW | CONNECT],
        ]),
      }).map((o) => [o.id, o])
    );
    expect(result.has("jailed")).toBe(false);
    expect(result.get("owner")!.allow).toBe(VIEW | CONNECT);
  });

  it("keeps a role overwrite added by hand", () => {
    const current = [
      ...desiredOverwrites(state(), context(base)),
      role("mods", VIEW | CONNECT),
    ];
    const changes = overwriteChanges(state(), context(current));
    expect(changes).not.toContainEqual({ kind: "delete", id: "mods" });
  });
});
