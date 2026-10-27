import prisma from "#lib/database.js";
import { RevisionCache, RevisionCounter } from "#lib/revision-cache.js";
import { declareService, type Service } from "#lib/service.js";

export interface Hub {
  channelId: string;
  nameTemplate: string;
  userLimit: number;
}

export interface TempChannel {
  channelId: string;
  guildId: string;
  hubId: string;
  ownerId: string;
  locked: boolean;
  hidden: boolean;
  trusted: string[];
  blocked: string[];
  panelMessageId: string | null;
  createdAt: Date;
}

export type ChannelState = Pick<
  TempChannel,
  "ownerId" | "locked" | "hidden" | "trusted" | "blocked" | "panelMessageId"
>;

export interface Preference {
  name: string | null;
  userLimit: number | null;
  locked: boolean;
  hidden: boolean;
  trusted: string[];
  blocked: string[];
}

export type PreferenceChange = Partial<Preference>;

const CACHE_TTL_MS = 5 * 60_000;

class TempVoiceStore implements Service {
  private readonly hubCache = new RevisionCache(CACHE_TTL_MS);
  private readonly hubRevisions = new RevisionCounter();

  private hubMap(guildId: string): Promise<Map<string, Hub>> {
    return this.hubCache.get(
      guildId,
      this.hubRevisions.get(guildId),
      async () => {
        const rows = await prisma.tempVoiceHub.findMany({ where: { guildId } });
        return new Map(
          rows.map(({ channelId, nameTemplate, userLimit }) => [
            channelId,
            { channelId, nameTemplate, userLimit },
          ])
        );
      }
    );
  }

  async hub(guildId: string, channelId: string): Promise<Hub | null> {
    const hub = (await this.hubMap(guildId)).get(channelId);
    return hub ? { ...hub } : null;
  }

  async hubs(guildId: string): Promise<Hub[]> {
    return [...(await this.hubMap(guildId)).values()].map((hub) => ({
      ...hub,
    }));
  }

  async saveHub(guildId: string, hub: Hub): Promise<void> {
    const { channelId, nameTemplate, userLimit } = hub;
    await prisma.tempVoiceHub.upsert({
      where: { guildId_channelId: { guildId, channelId } },
      create: { guildId, channelId, nameTemplate, userLimit },
      update: { nameTemplate, userLimit },
    });
    this.hubRevisions.bump(guildId);
  }

  async removeHub(guildId: string, channelId: string): Promise<boolean> {
    const { count } = await prisma.tempVoiceHub.deleteMany({
      where: { guildId, channelId },
    });
    this.hubRevisions.bump(guildId);
    return count > 0;
  }

  channel(channelId: string): Promise<TempChannel | null> {
    return prisma.tempVoiceChannel.findUnique({ where: { channelId } });
  }

  ownedBy(guildId: string, ownerId: string): Promise<TempChannel | null> {
    return prisma.tempVoiceChannel.findFirst({
      where: { guildId, ownerId },
      orderBy: { createdAt: "desc" },
    });
  }

  async guildIds(): Promise<string[]> {
    const rows = await prisma.tempVoiceChannel.findMany({
      select: { guildId: true },
      distinct: ["guildId"],
    });
    return rows.map(({ guildId }) => guildId);
  }

  channels(guildId: string): Promise<TempChannel[]> {
    return prisma.tempVoiceChannel.findMany({ where: { guildId } });
  }

  async createChannel(
    channel: Omit<TempChannel, "createdAt" | "panelMessageId">
  ): Promise<TempChannel> {
    return prisma.tempVoiceChannel.create({ data: channel });
  }

  async updateChannel(
    channelId: string,
    change: Partial<ChannelState>
  ): Promise<TempChannel | null> {
    const { count } = await prisma.tempVoiceChannel.updateMany({
      where: { channelId },
      data: change,
    });
    return count > 0 ? this.channel(channelId) : null;
  }

  async removeGuildChannels(guildId: string): Promise<number> {
    const { count } = await prisma.tempVoiceChannel.deleteMany({
      where: { guildId },
    });
    return count;
  }

  async removeChannel(channelId: string): Promise<boolean> {
    const { count } = await prisma.tempVoiceChannel.deleteMany({
      where: { channelId },
    });
    return count > 0;
  }

  async preference(
    guildId: string,
    userId: string
  ): Promise<Preference | null> {
    const row = await prisma.tempVoicePreference.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    if (!row) {
      return null;
    }
    const { name, userLimit, locked, hidden, trusted, blocked } = row;
    return { name, userLimit, locked, hidden, trusted, blocked };
  }

  async savePreference(
    guildId: string,
    userId: string,
    change: PreferenceChange
  ): Promise<void> {
    await prisma.tempVoicePreference.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId, ...change },
      update: change,
    });
  }

  async touchPreference(guildId: string, userId: string): Promise<void> {
    await prisma.tempVoicePreference.updateMany({
      where: { guildId, userId },
      data: { updatedAt: new Date() },
    });
  }

  async forgetPreference(guildId: string, userId: string): Promise<boolean> {
    const { count } = await prisma.tempVoicePreference.deleteMany({
      where: { guildId, userId },
    });
    return count > 0;
  }

  async purgePreferencesBefore(date: Date): Promise<number> {
    const { count } = await prisma.tempVoicePreference.deleteMany({
      where: { updatedAt: { lt: date } },
    });
    return count;
  }
}

export default declareService(new TempVoiceStore());
