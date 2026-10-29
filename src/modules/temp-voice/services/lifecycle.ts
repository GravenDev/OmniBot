import {
  ChannelType,
  PermissionsBitField,
  type CategoryChannel,
  type Guild,
  type GuildMember,
  type PermissionOverwriteOptions,
  type PermissionOverwrites,
  type VoiceBasedChannel,
  type VoiceChannel,
} from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { KeyedQueue } from "#lib/keyed-queue.js";
import { loggerMaker } from "#lib/logger.js";
import type { TempVoiceConfig } from "#modules/temp-voice/temp-voice.config.js";
import { RenameLimiter, renderName } from "./naming.js";
import {
  managedMembers,
  overwriteChanges,
  STAFF_PERMISSIONS,
  type AccessState,
  type Overwrite,
} from "./overwrites.js";
import { postPanel, refreshPanel } from "./panel.js";
import { isProtected, REQUIRED_PERMISSIONS } from "./permissions.js";
import store, { type Hub, type TempChannel } from "./store.js";

const logger = loggerMaker("temp-voice");

const CREATE_COOLDOWN_MS = 10_000;
const NOTICE_LIFETIME_MS = 10_000;
const RECONCILE_GRACE_MS = 60_000;

export const queue = new KeyedQueue();
export const renames = new RenameLimiter();
const lastCreation = new Map<string, number>();

function toOverwrite(overwrite: PermissionOverwrites): Overwrite {
  return {
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield,
    deny: overwrite.deny.bitfield,
  };
}

function baseOverwrites(parent: CategoryChannel | null): Overwrite[] {
  return parent ? parent.permissionOverwrites.cache.map(toOverwrite) : [];
}

export function overwriteOptions(
  overwrite: Overwrite
): PermissionOverwriteOptions {
  const options: PermissionOverwriteOptions = {};
  for (const name of new PermissionsBitField(overwrite.allow).toArray()) {
    options[name] = true;
  }
  for (const name of new PermissionsBitField(overwrite.deny).toArray()) {
    options[name] = false;
  }
  return options;
}

async function botMember(guild: Guild): Promise<GuildMember> {
  return guild.members.me ?? (await guild.members.fetchMe());
}

function botPermissions(
  me: GuildMember,
  parent: CategoryChannel | null
): bigint {
  return (parent ? parent.permissionsFor(me) : me.permissions).bitfield;
}

export function accessState(row: TempChannel): AccessState {
  return {
    ownerId: row.ownerId,
    locked: row.locked,
    hidden: row.hidden,
    trusted: row.trusted,
    blocked: row.blocked,
  };
}

async function grantable(
  channel: VoiceBasedChannel,
  state: AccessState,
  hubId: string
): Promise<Map<string, bigint>> {
  const guild = channel.guild;
  const reference = guild.channels.cache.get(hubId) ?? channel.parent ?? null;
  const bits = new Map<string, bigint>();
  for (const id of [state.ownerId, ...state.trusted]) {
    const member =
      guild.members.cache.get(id) ??
      (await guild.members.fetch(id).catch(() => null));
    bits.set(
      id,
      member
        ? (reference ? reference.permissionsFor(member) : member.permissions)
            .bitfield
        : 0n
    );
  }
  return bits;
}

function staffRoles(guild: Guild): Set<string> {
  return new Set(
    guild.roles.cache
      .filter((role) => role.permissions.any(STAFF_PERMISSIONS))
      .map((role) => role.id)
  );
}

async function writeOverwrite(
  channel: VoiceBasedChannel,
  id: string,
  overwrite: Overwrite | undefined
): Promise<void> {
  if (overwrite) {
    await channel.permissionOverwrites.create(id, overwriteOptions(overwrite), {
      type: overwrite.type,
    });
  } else {
    await channel.permissionOverwrites.delete(id);
  }
}

export async function applyAccess(
  channel: VoiceBasedChannel,
  hubId: string,
  state: AccessState,
  previous?: AccessState
): Promise<void> {
  const me = await botMember(channel.guild);
  const fresh = await channel.fetch(true);
  const current = fresh.permissionOverwrites.cache.map(toOverwrite);
  const changes = overwriteChanges(state, {
    everyoneId: channel.guild.id,
    botId: me.id,
    botPermissions: botPermissions(me, fresh.parent),
    base: baseOverwrites(fresh.parent),
    current,
    grantable: await grantable(fresh, state, hubId),
    staffRoles: staffRoles(channel.guild),
    released: previous ? managedMembers(previous) : [],
  });
  const isBot = (change: (typeof changes)[number]) =>
    change.kind === "set" && change.overwrite.id === me.id;
  changes.sort((a, b) => Number(isBot(b)) - Number(isBot(a)));

  const before = new Map(current.map((o) => [o.id, o]));
  const applied: string[] = [];
  try {
    for (const change of changes) {
      const id = change.kind === "set" ? change.overwrite.id : change.id;
      await writeOverwrite(
        fresh,
        id,
        change.kind === "set" ? change.overwrite : undefined
      );
      applied.push(id);
    }
  } catch (err) {
    for (const id of applied.reverse()) {
      await writeOverwrite(fresh, id, before.get(id)).catch(
        (undoErr: unknown) =>
          logger.error(
            { err: undoErr },
            `Overwrite not restored | channelId = ${channel.id} | id = ${id}`
          )
      );
    }
    throw err;
  }
}

export function humanCount(channel: VoiceBasedChannel): number {
  return channel.members.filter((member) => !member.user.bot).size;
}

function voiceChannel(
  guild: Guild,
  channelId: string
): VoiceBasedChannel | null {
  const channel = guild.channels.cache.get(channelId);
  return channel?.isVoiceBased() ? channel : null;
}

async function notify(
  hub: VoiceBasedChannel,
  member: GuildMember,
  text: string
): Promise<void> {
  try {
    const message = await hub.send({
      content: `<@${member.id}> ${text}`,
      allowedMentions: { users: [member.id] },
    });
    setTimeout(() => {
      message.delete().catch(() => undefined);
    }, NOTICE_LIFETIME_MS).unref();
  } catch {
    logger.debug(`Hub notice not posted | channelId = ${hub.id}`);
  }
}

async function moveTo(
  member: GuildMember,
  channel: VoiceBasedChannel
): Promise<boolean> {
  try {
    await member.voice.setChannel(channel);
    return true;
  } catch (err) {
    logger.debug(
      { err },
      `Member not moved | userId = ${member.id} | channelId = ${channel.id}`
    );
    return false;
  }
}

async function returnToOwnChannel(
  member: GuildMember,
  hubChannel: VoiceBasedChannel
): Promise<boolean> {
  const existing = await store.ownedBy(member.guild.id, member.id);
  if (!existing) {
    return false;
  }
  return queue.run(existing.channelId, async () => {
    const channel = voiceChannel(member.guild, existing.channelId);
    if (!channel) {
      await store.removeChannel(existing.channelId);
      return false;
    }
    if (!(await store.channel(existing.channelId))) {
      return false;
    }
    if (member.voice.channelId === hubChannel.id) {
      await moveTo(member, channel);
    }
    return true;
  });
}

export function joinHub(
  member: GuildMember,
  hubChannel: VoiceBasedChannel,
  hub: Hub,
  config: TempVoiceConfig
): Promise<void> {
  const guild = member.guild;
  const key = `${guild.id}:${member.id}`;
  return queue.run(key, async () => {
    if (member.voice.channelId !== hubChannel.id || member.user.bot) {
      return;
    }
    if (await returnToOwnChannel(member, hubChannel)) {
      return;
    }

    const now = Date.now();
    const last = lastCreation.get(key) ?? 0;
    if (now - last < CREATE_COOLDOWN_MS) {
      await notify(
        hubChannel,
        member,
        config.t("hub.cooldown", {
          time: `<t:${Math.ceil((last + CREATE_COOLDOWN_MS) / 1000)}:R>`,
        })
      );
      return;
    }

    const me = await botMember(guild);
    const parent = hubChannel.parent;
    const missing = (parent ?? hubChannel)
      .permissionsFor(me)
      ?.missing(REQUIRED_PERMISSIONS) ?? [...REQUIRED_PERMISSIONS];
    if (missing.length > 0) {
      logger.warn(
        `Missing permissions | guildId = ${guild.id} | hubId = ${hubChannel.id} | missing = ${missing.join(",")}`
      );
      await notify(hubChannel, member, config.t("hub.unavailable"));
      return;
    }

    const preference = await store.preference(guild.id, member.id);
    let state: AccessState = {
      ownerId: member.id,
      locked: preference?.locked ?? false,
      hidden: preference?.hidden ?? false,
      trusted: preference?.trusted ?? [],
      blocked: (preference?.blocked ?? []).filter((id) => {
        const blocked = guild.members.cache.get(id);
        return !blocked || !isProtected(blocked, hubChannel);
      }),
    };
    lastCreation.set(key, now);
    setTimeout(() => {
      if (lastCreation.get(key) === now) {
        lastCreation.delete(key);
      }
    }, CREATE_COOLDOWN_MS).unref();
    let channel: VoiceChannel;
    try {
      channel = await guild.channels.create({
        name: preference?.name ?? renderName(hub.nameTemplate, member),
        type: ChannelType.GuildVoice,
        userLimit: preference?.userLimit ?? hub.userLimit,
        bitrate: hubChannel.bitrate,
        ...(parent && { parent: parent.id }),
        ...(hubChannel.rtcRegion && { rtcRegion: hubChannel.rtcRegion }),
        reason: `Temporary voice channel of ${member.user.username}`,
      });
    } catch (err) {
      logger.error(
        { err },
        `Temporary channel not created | guildId = ${guild.id} | userId = ${member.id}`
      );
      await notify(hubChannel, member, config.t("hub.unavailable"));
      return;
    }

    let row: TempChannel;
    try {
      try {
        await applyAccess(channel, hubChannel.id, state);
      } catch (err) {
        if (!state.locked && !state.hidden) {
          throw err;
        }
        logger.warn(
          { err },
          `Remembered lock not applied, opening the channel | channelId = ${channel.id}`
        );
        state = { ...state, locked: false, hidden: false };
        await applyAccess(channel, hubChannel.id, state);
      }
      row = await store.createChannel({
        channelId: channel.id,
        guildId: guild.id,
        hubId: hubChannel.id,
        ownerId: member.id,
        locked: state.locked,
        hidden: state.hidden,
        trusted: state.trusted,
        blocked: state.blocked,
      });
    } catch (err) {
      logger.error(
        { err },
        `Temporary channel not set up | guildId = ${guild.id} | channelId = ${channel.id}`
      );
      await channel.delete().catch(() => undefined);
      await notify(hubChannel, member, config.t("hub.unavailable"));
      return;
    }
    if (preference) {
      await store.touchPreference(guild.id, member.id);
    }

    if (!(await moveTo(member, channel))) {
      await removeTempChannel(channel, row, "abandoned");
      return;
    }

    logger.info(
      `Temporary channel created | guildId = ${guild.id} | channelId = ${channel.id} | ownerId = ${member.id}`
    );
    await postPanel(channel, row, config.t, true);
  });
}

export async function removeTempChannel(
  channel: VoiceBasedChannel | null,
  row: TempChannel,
  reason: "empty" | "abandoned" | "deleted" | "owner"
): Promise<boolean> {
  if (channel) {
    try {
      await channel.delete();
    } catch (err) {
      logger.warn(
        { err },
        `Temporary channel not deleted | channelId = ${channel.id}`
      );
      return false;
    }
  }
  await store.removeChannel(row.channelId);
  renames.forget(row.channelId);
  logger.info(
    `Temporary channel removed | guildId = ${row.guildId} | channelId = ${row.channelId} | reason = ${reason}`
  );
  return true;
}

export function memberLeft(
  channel: VoiceBasedChannel,
  userId: string,
  t: TFunction
): Promise<void> {
  return queue.run(channel.id, async () => {
    const row = await store.channel(channel.id);
    if (!row) {
      return;
    }
    if (humanCount(channel) === 0) {
      await removeTempChannel(channel, row, "empty");
    } else if (row.ownerId === userId) {
      await refreshPanel(channel, row, t);
    }
  });
}

export function ownerMoved(
  channel: VoiceBasedChannel,
  userId: string,
  t: TFunction
): Promise<void> {
  return queue.run(channel.id, async () => {
    const row = await store.channel(channel.id);
    if (row?.ownerId === userId) {
      await refreshPanel(channel, row, t);
    }
  });
}

export function channelDeleted(guild: Guild, channelId: string): Promise<void> {
  return queue.run(channelId, async () => {
    if (await store.removeHub(guild.id, channelId)) {
      logger.info(
        `Hub deleted with its channel | guildId = ${guild.id} | channelId = ${channelId}`
      );
    }
    const row = await store.channel(channelId);
    if (row) {
      await removeTempChannel(null, row, "deleted");
    }
  });
}

export async function reconcile(guild: Guild): Promise<void> {
  const now = Date.now();
  for (const hub of await store.hubs(guild.id)) {
    if (!voiceChannel(guild, hub.channelId)) {
      await store.removeHub(guild.id, hub.channelId);
      logger.info(
        `Deleted hub forgotten | guildId = ${guild.id} | channelId = ${hub.channelId}`
      );
    }
  }
  for (const row of await store.channels(guild.id)) {
    await queue.run(row.channelId, async () => {
      const current = await store.channel(row.channelId);
      if (!current) {
        return;
      }
      const channel = voiceChannel(guild, current.channelId);
      if (!channel) {
        await removeTempChannel(null, current, "deleted");
        return;
      }
      if (
        humanCount(channel) === 0 &&
        now - current.createdAt.getTime() > RECONCILE_GRACE_MS
      ) {
        await removeTempChannel(channel, current, "empty");
      }
    });
  }
}

export async function seatWaitingMembers(
  guild: Guild,
  config: TempVoiceConfig
): Promise<void> {
  for (const hub of await store.hubs(guild.id)) {
    const hubChannel = voiceChannel(guild, hub.channelId);
    for (const member of hubChannel?.members.values() ?? []) {
      await joinHub(member, hubChannel!, hub, config);
    }
  }
}
