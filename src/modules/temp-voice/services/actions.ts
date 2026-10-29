import type { Guild, GuildMember, VoiceBasedChannel } from "discord.js";
import { loggerMaker } from "#lib/logger.js";
import type { TempVoiceConfig } from "#modules/temp-voice/temp-voice.config.js";
import { accessMode, modeFlags, type AccessMode } from "./access-mode.js";
import {
  accessState,
  applyAccess,
  queue,
  removeTempChannel,
  renames,
} from "./lifecycle.js";
import { cleanName } from "./naming.js";
import { refreshPanel } from "./panel.js";
import { isModerator, isProtected } from "./permissions.js";
import store, {
  type ChannelState,
  type PreferenceChange,
  type TempChannel,
} from "./store.js";

const logger = loggerMaker("temp-voice");

export const MAX_ACCESS_ENTRIES = 25;

const RENAME_WAIT_MS = 5_000;
const INVITE_COOLDOWN_MS = 10 * 60_000;
const NOTICE_LIFETIME_MS = 15 * 60_000;

const invited = new Set<string>();
const notices = new Map<string, string[]>();

export interface Outcome {
  ok: boolean;
  key: string;
  params?: Record<string, string>;
}

export interface ActionContext {
  guild: Guild;
  channel: VoiceBasedChannel;
  row: TempChannel;
  actor: GuildMember;
  config: TempVoiceConfig;
}

function done(key: string, params?: Record<string, string>): Outcome {
  return params ? { ok: true, key, params } : { ok: true, key };
}

function fail(key: string, params?: Record<string, string>): Outcome {
  return params ? { ok: false, key, params } : { ok: false, key };
}

function mentions(ids: string[]): string {
  return ids.map((id) => `<@${id}>`).join(", ");
}

function isOwner(ctx: ActionContext): boolean {
  return ctx.actor.id === ctx.row.ownerId;
}

function canManage(ctx: ActionContext): boolean {
  return isOwner(ctx) || isModerator(ctx.actor, ctx.channel);
}

export function tempChannelOf(
  guild: Guild,
  channelId: string
): VoiceBasedChannel | null {
  const channel = guild.channels.cache.get(channelId);
  return channel?.isVoiceBased() ? channel : null;
}

export interface Authorized {
  channel: VoiceBasedChannel;
  row: TempChannel;
}

export async function authorize(
  guild: Guild,
  channelId: string,
  actor: GuildMember
): Promise<Authorized | Outcome> {
  const channel = tempChannelOf(guild, channelId);
  if (!channel) {
    return fail("action.gone");
  }
  const row = await store.channel(channelId);
  if (!row) {
    return fail("action.notTemporary");
  }
  return actor.id === row.ownerId || isModerator(actor, channel)
    ? { channel, row }
    : fail("action.notOwner");
}

export async function redrawPanel(
  guild: Guild,
  channelId: string,
  config: TempVoiceConfig
): Promise<void> {
  const channel = tempChannelOf(guild, channelId);
  const row = channel ? await store.channel(channelId) : null;
  if (channel && row) {
    await refreshPanel(channel, row, config.t);
  }
}

export function withChannel(
  guild: Guild,
  channelId: string,
  actor: GuildMember,
  config: TempVoiceConfig,
  action: (ctx: ActionContext) => Promise<Outcome>,
  { ownerOnly = true } = {}
): Promise<Outcome> {
  return queue.run(channelId, async () => {
    const channel = tempChannelOf(guild, channelId);
    if (!channel) {
      return fail("action.gone");
    }
    const row = await store.channel(channelId);
    if (!row) {
      return fail("action.notTemporary");
    }
    const ctx = { guild, channel, row, actor, config };
    if (ownerOnly && !canManage(ctx)) {
      return fail("action.notOwner");
    }
    return action(ctx);
  });
}

async function commit(
  ctx: ActionContext,
  change: Partial<ChannelState>,
  preference?: PreferenceChange
): Promise<TempChannel | null> {
  const next = { ...ctx.row, ...change };
  await applyAccess(
    ctx.channel,
    ctx.row.hubId,
    accessState(next),
    accessState(ctx.row)
  );
  let updated: TempChannel | null;
  try {
    updated = await store.updateChannel(ctx.row.channelId, change);
  } catch (err) {
    await applyAccess(
      ctx.channel,
      ctx.row.hubId,
      accessState(ctx.row),
      accessState(next)
    ).catch((rollbackErr: unknown) =>
      logger.error(
        { err: rollbackErr },
        `Rollback failed | channelId = ${ctx.channel.id}`
      )
    );
    throw err;
  }
  if (!updated) {
    return null;
  }
  await refreshPanel(ctx.channel, updated, ctx.config.t);
  if (preference && isOwner(ctx)) {
    await store.savePreference(ctx.guild.id, ctx.actor.id, preference);
  }
  ctx.row = updated;
  return updated;
}

export async function rename(
  ctx: ActionContext,
  value: string
): Promise<Outcome> {
  const name = cleanName(value);
  if (!name) {
    return fail("rename.invalid");
  }
  const retryAt = renames.retryAt(ctx.channel.id);
  if (retryAt !== null) {
    return fail("rename.rateLimited", {
      time: `<t:${Math.ceil(retryAt / 1000)}:R>`,
    });
  }
  const channelId = ctx.channel.id;
  const at = Date.now();
  renames.record(channelId, at);
  const renamed = ctx.channel.setName(name).then(
    async () => {
      if (isOwner(ctx)) {
        await store.savePreference(ctx.guild.id, ctx.actor.id, { name });
      }
      queue
        .run(channelId, async () => {
          const row = await store.channel(channelId);
          if (row) {
            await refreshPanel(ctx.channel, row, ctx.config.t);
          }
        })
        .catch((err: unknown) =>
          logger.debug(
            { err },
            `Panel not refreshed | channelId = ${channelId}`
          )
        );
    },
    (err: unknown) => {
      renames.release(channelId, at);
      throw err;
    }
  );
  const settled = await Promise.race([
    renamed.then(() => true),
    new Promise<false>((resolve) =>
      setTimeout(() => resolve(false), RENAME_WAIT_MS).unref()
    ),
  ]);
  if (!settled) {
    renamed.catch((err: unknown) =>
      logger.warn({ err }, `Rename failed | channelId = ${channelId}`)
    );
    return done("rename.pending", { name });
  }
  return done("rename.done", { name });
}

export async function setLimit(
  ctx: ActionContext,
  userLimit: number
): Promise<Outcome> {
  await ctx.channel.setUserLimit(userLimit);
  if (isOwner(ctx)) {
    await store.savePreference(ctx.guild.id, ctx.actor.id, { userLimit });
  }
  await refreshPanel(ctx.channel, ctx.row, ctx.config.t);
  return done(userLimit > 0 ? "limit.done" : "limit.removed", {
    limit: String(userLimit),
  });
}

export async function setAccess(
  ctx: ActionContext,
  mode: AccessMode
): Promise<Outcome> {
  if (accessMode(ctx.row) === mode) {
    return done(`mode.${mode}.done`);
  }
  const flags = modeFlags(mode);
  await commit(ctx, flags, flags);
  return done(`mode.${mode}.done`);
}

export async function edit(
  ctx: ActionContext,
  name: string,
  userLimit: number
): Promise<Outcome> {
  const outcomes: Outcome[] = [];
  if (cleanName(name) !== cleanName(ctx.channel.name)) {
    outcomes.push(await rename(ctx, name));
  }
  if (userLimit !== ctx.channel.userLimit) {
    outcomes.push(await setLimit(ctx, userLimit));
  }
  if (outcomes.length === 0) {
    return done("edit.unchanged");
  }
  return {
    ok: outcomes.every((outcome) => outcome.ok),
    key: "edit.done",
    params: {
      details: outcomes
        .map((outcome) => ctx.config.t(outcome.key, outcome.params))
        .join("\n"),
    },
  };
}

function eligibleTargets(
  ctx: ActionContext,
  members: GuildMember[]
): GuildMember[] {
  return members.filter(
    (member) => member.id !== ctx.row.ownerId && !member.user.bot
  );
}

async function rememberAccess(
  ctx: ActionContext,
  {
    trust = [],
    block = [],
    clear = [],
  }: { trust?: string[]; block?: string[]; clear?: string[] }
): Promise<void> {
  if (!isOwner(ctx)) {
    return;
  }
  const preference = await store.preference(ctx.guild.id, ctx.actor.id);
  const untrusted = new Set([...block, ...clear]);
  const unblocked = new Set([...trust, ...clear]);
  const trusted = [
    ...new Set([
      ...(preference?.trusted ?? []).filter((id) => !untrusted.has(id)),
      ...trust,
    ]),
  ];
  const blocked = [
    ...new Set([
      ...(preference?.blocked ?? []).filter((id) => !unblocked.has(id)),
      ...block,
    ]),
  ];
  const overflow = Math.max(
    0,
    trusted.length + blocked.length - MAX_ACCESS_ENTRIES
  );
  await store.savePreference(ctx.guild.id, ctx.actor.id, {
    trusted: trusted.slice(Math.min(overflow, trusted.length)),
    blocked: blocked.slice(Math.max(0, overflow - trusted.length)),
  });
}

export async function trust(
  ctx: ActionContext,
  members: GuildMember[]
): Promise<Outcome> {
  const ids = eligibleTargets(ctx, members).map((member) => member.id);
  if (ids.length === 0) {
    return fail("trust.none");
  }
  const trusted = [...new Set([...ctx.row.trusted, ...ids])];
  if (trusted.length + ctx.row.blocked.length > MAX_ACCESS_ENTRIES) {
    return fail("access.full", { max: String(MAX_ACCESS_ENTRIES) });
  }
  const blocked = ctx.row.blocked.filter((id) => !ids.includes(id));
  await commit(ctx, { trusted, blocked });
  await rememberAccess(ctx, { trust: ids });
  return done("trust.done", { users: mentions(ids) });
}

export function rememberNotice(token: string, ids: string[]): void {
  notices.set(token, ids);
  setTimeout(() => notices.delete(token), NOTICE_LIFETIME_MS).unref();
}

export function noticeMembers(guild: Guild, token: string): GuildMember[] {
  return (notices.get(token) ?? [])
    .map((id) => guild.members.cache.get(id))
    .filter((member) => member !== undefined);
}

export async function notify(
  ctx: ActionContext,
  members: GuildMember[]
): Promise<Outcome> {
  const targets = members.filter((member) =>
    ctx.row.trusted.includes(member.id)
  );
  if (targets.length === 0) {
    return fail("notify.none");
  }
  const sent: string[] = [];
  const failed: string[] = [];
  for (const member of targets) {
    const key = `${ctx.channel.id}:${member.id}`;
    if (invited.has(key)) {
      continue;
    }
    invited.add(key);
    try {
      await member.send({
        content: ctx.config.t("notify.dm", {
          user: ctx.actor.displayName,
          guild: ctx.guild.name,
          channel: ctx.channel.url,
        }),
        allowedMentions: { parse: [] },
      });
      setTimeout(() => invited.delete(key), INVITE_COOLDOWN_MS).unref();
      sent.push(member.id);
    } catch {
      invited.delete(key);
      failed.push(member.id);
    }
  }
  if (sent.length === 0 && failed.length === 0) {
    return done("notify.already");
  }
  if (failed.length === 0) {
    return done("notify.done", { users: mentions(sent) });
  }
  return sent.length === 0
    ? fail("notify.failed", { failed: mentions(failed) })
    : done("notify.partial", {
        users: mentions(sent),
        failed: mentions(failed),
      });
}

export async function revoke(
  ctx: ActionContext,
  ids: string[]
): Promise<Outcome> {
  const targets = new Set(ids);
  const trusted = ctx.row.trusted.filter((id) => !targets.has(id));
  const blocked = ctx.row.blocked.filter((id) => !targets.has(id));
  if (
    trusted.length === ctx.row.trusted.length &&
    blocked.length === ctx.row.blocked.length
  ) {
    return fail("revoke.none");
  }
  await commit(ctx, { trusted, blocked });
  await rememberAccess(ctx, { clear: ids });
  return done("revoke.done", { users: mentions(ids) });
}

function inChannel(ctx: ActionContext, member: GuildMember): boolean {
  return member.voice.channelId === ctx.channel.id;
}

async function disconnect(member: GuildMember): Promise<boolean> {
  try {
    await member.voice.disconnect();
    return true;
  } catch (err) {
    logger.debug({ err }, `Member not disconnected | userId = ${member.id}`);
    return false;
  }
}

export async function block(
  ctx: ActionContext,
  members: GuildMember[]
): Promise<Outcome> {
  const targets = eligibleTargets(ctx, members).filter(
    (member) => member.id !== ctx.actor.id
  );
  const protectedOnes = targets.filter((member) =>
    isProtected(member, ctx.channel)
  );
  const blockable = targets.filter((member) => !protectedOnes.includes(member));
  if (blockable.length === 0) {
    return fail(protectedOnes.length > 0 ? "block.protected" : "block.none");
  }
  const ids = blockable.map((member) => member.id);
  const blocked = [...new Set([...ctx.row.blocked, ...ids])];
  if (blocked.length + ctx.row.trusted.length > MAX_ACCESS_ENTRIES) {
    return fail("access.full", { max: String(MAX_ACCESS_ENTRIES) });
  }
  const trusted = ctx.row.trusted.filter((id) => !ids.includes(id));
  await commit(ctx, { trusted, blocked });
  await rememberAccess(ctx, { block: ids });
  for (const member of blockable) {
    if (inChannel(ctx, member)) {
      await disconnect(member);
    }
  }
  return done("block.done", { users: mentions(ids) });
}

export async function kick(
  ctx: ActionContext,
  members: GuildMember[]
): Promise<Outcome> {
  const targets = eligibleTargets(ctx, members).filter(
    (member) => member.id !== ctx.actor.id && inChannel(ctx, member)
  );
  const kickable = targets.filter(
    (member) => !isProtected(member, ctx.channel)
  );
  if (kickable.length === 0) {
    return fail(targets.length > 0 ? "kick.protected" : "kick.none");
  }
  const kicked: string[] = [];
  for (const member of kickable) {
    if (await disconnect(member)) {
      kicked.push(member.id);
    }
  }
  return kicked.length > 0
    ? done("kick.done", { users: mentions(kicked) })
    : fail("kick.failed");
}

async function changeOwner(
  ctx: ActionContext,
  member: GuildMember
): Promise<void> {
  const previous = ctx.row.ownerId;
  const trusted = ctx.row.trusted.filter((id) => id !== member.id);
  const blocked = ctx.row.blocked.filter((id) => id !== member.id);
  await commit(ctx, { ownerId: member.id, trusted, blocked });
  logger.info(
    `Owner changed | channelId = ${ctx.channel.id} | from = ${previous} | to = ${member.id}`
  );
}

export async function claim(ctx: ActionContext): Promise<Outcome> {
  if (isOwner(ctx)) {
    return fail("claim.alreadyOwner");
  }
  if (ctx.actor.voice.channelId !== ctx.channel.id) {
    return fail("claim.notInChannel");
  }
  if (ctx.channel.members.has(ctx.row.ownerId)) {
    return fail("claim.ownerPresent", { owner: `<@${ctx.row.ownerId}>` });
  }
  if (await store.ownedBy(ctx.guild.id, ctx.actor.id)) {
    return fail("claim.ownsAnother");
  }
  await changeOwner(ctx, ctx.actor);
  return done("claim.done");
}

export async function transfer(
  ctx: ActionContext,
  member: GuildMember
): Promise<Outcome> {
  if (member.id === ctx.row.ownerId || member.user.bot) {
    return fail("transfer.invalid");
  }
  if (member.voice.channelId !== ctx.channel.id) {
    return fail("transfer.notInChannel", { user: `<@${member.id}>` });
  }
  if (await store.ownedBy(ctx.guild.id, member.id)) {
    return fail("transfer.ownsAnother", { user: `<@${member.id}>` });
  }
  await changeOwner(ctx, member);
  return done("transfer.done", { user: `<@${member.id}>` });
}

export async function remove(ctx: ActionContext): Promise<Outcome> {
  return (await removeTempChannel(ctx.channel, ctx.row, "owner"))
    ? done("delete.done")
    : fail("delete.failed");
}
