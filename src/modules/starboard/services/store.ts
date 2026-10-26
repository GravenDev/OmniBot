import prisma, { Prisma } from "#lib/database.js";
import { declareService, type Service } from "#lib/service.js";
import type { Tally } from "./tally.js";

export interface StarboardEntry {
  messageId: string;
  guildId: string;
  channelId: string;
  parentChannelId: string | null;
  starboardChannelId: string;
  starboardMessageId: string | null;
  tally: Tally | null;
}

type Row = Omit<StarboardEntry, "tally"> & { tally: Prisma.JsonValue };

function entryOf(row: Row): StarboardEntry {
  return { ...row, tally: row.tally as Tally | null };
}

class StarboardStore implements Service {
  async find(messageId: string): Promise<StarboardEntry | null> {
    const row = await prisma.starboardEntry.findUnique({
      where: { messageId },
    });
    return row && entryOf(row);
  }

  async findInvolving(messageIds: string[]): Promise<StarboardEntry[]> {
    const rows = await prisma.starboardEntry.findMany({
      where: {
        OR: [
          { messageId: { in: messageIds } },
          { starboardMessageId: { in: messageIds } },
        ],
      },
    });
    return rows.map(entryOf);
  }

  async create(entry: StarboardEntry): Promise<void> {
    await prisma.starboardEntry.create({
      data: {
        ...entry,
        tally: entry.tally
          ? (entry.tally as unknown as Prisma.InputJsonObject)
          : Prisma.DbNull,
      },
    });
  }

  async saveTally(messageId: string, tally: Tally): Promise<void> {
    await prisma.starboardEntry.updateMany({
      where: { messageId },
      data: { tally: tally as unknown as Prisma.InputJsonObject },
    });
  }

  async listForChannel(
    guildId: string,
    channelId: string
  ): Promise<StarboardEntry[]> {
    const rows = await prisma.starboardEntry.findMany({
      where: { guildId, OR: [{ channelId }, { parentChannelId: channelId }] },
    });
    return rows.map(entryOf);
  }

  async dismiss(messageId: string, starboardMessageId: string): Promise<void> {
    await prisma.starboardEntry.updateMany({
      where: { messageId, starboardMessageId },
      data: { starboardMessageId: null },
    });
  }

  async remove(messageId: string): Promise<void> {
    await prisma.starboardEntry.deleteMany({ where: { messageId } });
  }

  async removeForChannel(guildId: string, channelId: string): Promise<void> {
    await prisma.starboardEntry.deleteMany({
      where: {
        guildId,
        OR: [
          { channelId },
          { parentChannelId: channelId },
          { starboardChannelId: channelId },
        ],
      },
    });
  }
}

export default declareService(new StarboardStore());
