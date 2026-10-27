import { OverwriteType, PermissionFlagsBits } from "discord.js";

export interface Overwrite {
  id: string;
  type: OverwriteType;
  allow: bigint;
  deny: bigint;
}

export interface AccessState {
  ownerId: string;
  locked: boolean;
  hidden: boolean;
  trusted: string[];
  blocked: string[];
}

export interface OverwriteContext {
  everyoneId: string;
  botId: string;
  botPermissions: bigint;
  base: Overwrite[];
  current?: Overwrite[];
  grantable?: ReadonlyMap<string, bigint>;
  staffRoles?: ReadonlySet<string>;
  released?: readonly string[];
}

export type OverwriteChange =
  | { kind: "set"; overwrite: Overwrite }
  | { kind: "delete"; id: string };

const VIEW = PermissionFlagsBits.ViewChannel;
const CONNECT = PermissionFlagsBits.Connect;

const MEMBER_ALLOW = VIEW | CONNECT;
const BLOCKED_DENY = VIEW | CONNECT;
const BOT_ALLOW =
  VIEW |
  CONNECT |
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.MoveMembers |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.EmbedLinks |
  PermissionFlagsBits.ReadMessageHistory;
export const STAFF_PERMISSIONS =
  PermissionFlagsBits.Administrator |
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.MoveMembers;

function grant(overwrite: Overwrite, bits: bigint): void {
  overwrite.allow |= bits;
  overwrite.deny &= ~bits;
}

function forbid(overwrite: Overwrite, bits: bigint): void {
  overwrite.deny |= bits;
  overwrite.allow &= ~bits;
}

function restore(overwrite: Overwrite, bits: bigint, base?: Overwrite): void {
  overwrite.allow = (overwrite.allow & ~bits) | ((base?.allow ?? 0n) & bits);
  overwrite.deny = (overwrite.deny & ~bits) | ((base?.deny ?? 0n) & bits);
}

function copy(overwrite: Overwrite): Overwrite {
  return { ...overwrite };
}

function isStaff(overwrite: Overwrite, context: OverwriteContext): boolean {
  return (
    overwrite.id !== context.everyoneId &&
    ((overwrite.allow & STAFF_PERMISSIONS) !== 0n ||
      (context.staffRoles?.has(overwrite.id) ?? false))
  );
}

export function managedMembers(state: AccessState): string[] {
  return [...new Set([state.ownerId, ...state.trusted, ...state.blocked])];
}

export function desiredOverwrites(
  state: AccessState,
  context: OverwriteContext
): Overwrite[] {
  const base = new Map(context.base.map((o) => [o.id, o]));
  const current = new Map(
    (context.current ?? context.base).map((o) => [o.id, copy(o)])
  );
  const result = new Map<string, Overwrite>(current);

  const roleIds = new Set([
    context.everyoneId,
    ...context.base
      .filter((o) => o.type === OverwriteType.Role)
      .map((o) => o.id),
  ]);
  for (const id of roleIds) {
    const overwrite = current.get(id) ?? {
      id,
      type: OverwriteType.Role,
      allow: 0n,
      deny: 0n,
    };
    if (isStaff(overwrite, context)) {
      continue;
    }
    if (state.locked) {
      forbid(overwrite, CONNECT);
    } else {
      restore(overwrite, CONNECT, base.get(id));
    }
    if (state.hidden) {
      forbid(overwrite, VIEW);
    } else {
      restore(overwrite, VIEW, base.get(id));
    }
    result.set(id, overwrite);
  }

  const allowed = (id: string) =>
    MEMBER_ALLOW & context.botPermissions & (context.grantable?.get(id) ?? ~0n);
  const blocked = new Set(state.blocked);
  blocked.delete(state.ownerId);
  const members = new Map<string, (o: Overwrite) => void>();
  for (const id of blocked) {
    members.set(id, (o) => forbid(o, BLOCKED_DENY));
  }
  for (const id of state.trusted) {
    if (!blocked.has(id)) {
      members.set(id, (o) => grant(o, allowed(id)));
    }
  }
  members.set(state.ownerId, (o) => grant(o, allowed(state.ownerId)));
  members.set(context.botId, (o) =>
    grant(o, BOT_ALLOW & context.botPermissions)
  );

  for (const id of context.released ?? []) {
    if (!members.has(id) && current.get(id)?.type === OverwriteType.Member) {
      const original = base.get(id);
      if (original) {
        result.set(id, copy(original));
      } else {
        result.delete(id);
      }
    }
  }
  for (const [id, apply] of members) {
    const overwrite = copy(
      base.get(id) ?? { id, type: OverwriteType.Member, allow: 0n, deny: 0n }
    );
    apply(overwrite);
    result.set(id, overwrite);
  }

  return [...result.values()].filter(
    (o) => o.allow !== 0n || o.deny !== 0n || current.has(o.id)
  );
}

export function overwriteChanges(
  state: AccessState,
  context: OverwriteContext & { current: Overwrite[] }
): OverwriteChange[] {
  const desired = new Map(
    desiredOverwrites(state, context).map((o) => [o.id, o])
  );
  const changes: OverwriteChange[] = [];
  for (const overwrite of desired.values()) {
    const existing = context.current.find((o) => o.id === overwrite.id);
    if (
      !existing ||
      existing.allow !== overwrite.allow ||
      existing.deny !== overwrite.deny
    ) {
      changes.push({ kind: "set", overwrite });
    }
  }
  for (const existing of context.current) {
    if (!desired.has(existing.id)) {
      changes.push({ kind: "delete", id: existing.id });
    }
  }
  return changes;
}
