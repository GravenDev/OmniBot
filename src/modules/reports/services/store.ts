import prisma, { Prisma } from "#lib/database.js";
import { declareService, type Service } from "#lib/service.js";

export type ReportStatus = "open" | "resolved" | "dismissed" | "abusive";
export type MessageState = "present" | "edited" | "deleted";
export type ReportSource = "reaction" | "menu";
export type ActionType =
  | "delete"
  | "warn"
  | "timeout"
  | "kick"
  | "ban"
  | "softban"
  | "dismiss"
  | "abusive"
  | "reopen";

export interface ReportedAttachment {
  name: string;
  url: string;
}

export interface MessageSnapshot {
  guildId: string;
  channelId: string;
  messageId: string;
  authorId: string;
  content: string;
  attachments: ReportedAttachment[];
  createdAt: Date;
}

export interface Reporter {
  userId: string;
  source: ReportSource;
  reason: string | null;
  reportedAt: Date;
}

export interface Action {
  moderatorId: string;
  action: ActionType;
  reason: string | null;
  duration: number | null;
  failed: boolean;
  createdAt: Date;
}

export interface Report {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string;
  authorId: string;
  content: string;
  attachments: ReportedAttachment[];
  messageCreatedAt: Date;
  messageState: MessageState;
  editedContent: string | null;
  reactionKept: boolean;
  alertChannelId: string | null;
  alertMessageId: string | null;
  status: ReportStatus;
  handledBy: string | null;
  handledAt: Date | null;
  createdAt: Date;
  reporters: Reporter[];
  actions: Action[];
}

export interface AuthorHistory {
  total: number;
  sanctioned: number;
}

const include = {
  reporters: { orderBy: { reportedAt: "asc" } },
  actions: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.MessageReportInclude;

type Row = Prisma.MessageReportGetPayload<{ include: typeof include }>;

function toReport(row: Row): Report {
  return {
    ...row,
    attachments: row.attachments as unknown as ReportedAttachment[],
    messageState: row.messageState as MessageState,
    status: row.status as ReportStatus,
    reporters: row.reporters.map((reporter) => ({
      userId: reporter.userId,
      source: reporter.source as ReportSource,
      reason: reporter.reason,
      reportedAt: reporter.reportedAt,
    })),
    actions: row.actions.map((action) => ({
      moderatorId: action.moderatorId,
      action: action.action as ActionType,
      reason: action.reason,
      duration: action.duration,
      failed: action.failed,
      createdAt: action.createdAt,
    })),
  };
}

class ReportStore implements Service {
  async byMessage(guildId: string, messageId: string): Promise<Report | null> {
    const row = await prisma.messageReport.findUnique({
      where: { guildId_messageId: { guildId, messageId } },
      include,
    });
    return row ? toReport(row) : null;
  }

  async byId(guildId: string, id: number): Promise<Report | null> {
    const row = await prisma.messageReport.findFirst({
      where: { id, guildId },
      include,
    });
    return row ? toReport(row) : null;
  }

  async create(
    snapshot: MessageSnapshot,
    reporter: Omit<Reporter, "reportedAt">,
    reactionKept: boolean
  ): Promise<Report> {
    const row = await prisma.messageReport.create({
      data: {
        guildId: snapshot.guildId,
        channelId: snapshot.channelId,
        messageId: snapshot.messageId,
        authorId: snapshot.authorId,
        content: snapshot.content,
        attachments: snapshot.attachments as unknown as Prisma.InputJsonValue,
        messageCreatedAt: snapshot.createdAt,
        reactionKept,
        reporters: { create: reporter },
      },
      include,
    });
    return toReport(row);
  }

  async addReporter(
    reportId: number,
    reporter: Omit<Reporter, "reportedAt">,
    reactionKept: boolean
  ): Promise<boolean> {
    const { count } = await prisma.messageReporter.createMany({
      data: [{ reportId, ...reporter }],
      skipDuplicates: true,
    });
    if (count > 0 && reactionKept) {
      await prisma.messageReport.update({
        where: { id: reportId },
        data: { reactionKept: true },
      });
    }
    return count > 0;
  }

  async setAlert(
    reportId: number,
    alertChannelId: string,
    alertMessageId: string
  ): Promise<void> {
    await prisma.messageReport.update({
      where: { id: reportId },
      data: { alertChannelId, alertMessageId },
    });
  }

  async setMessageState(
    reportId: number,
    messageState: MessageState,
    editedContent?: string
  ): Promise<void> {
    await prisma.messageReport.update({
      where: { id: reportId },
      data: {
        messageState,
        ...(editedContent === undefined ? {} : { editedContent }),
      },
    });
  }

  async setStatus(
    reportId: number,
    status: ReportStatus,
    moderatorId: string | null
  ): Promise<void> {
    const open = status === "open";
    await prisma.messageReport.update({
      where: { id: reportId },
      data: {
        status,
        handledBy: open ? null : moderatorId,
        handledAt: open ? null : new Date(),
      },
    });
  }

  async addAction(
    reportId: number,
    action: Omit<Action, "createdAt">
  ): Promise<void> {
    await prisma.reportAction.create({ data: { reportId, ...action } });
  }

  async authorHistory(
    guildId: string,
    authorId: string,
    excludeId: number
  ): Promise<AuthorHistory> {
    const where = {
      guildId,
      authorId,
      id: { not: excludeId },
      status: { not: "abusive" },
    };
    const [total, sanctioned] = await Promise.all([
      prisma.messageReport.count({ where }),
      prisma.messageReport.count({
        where: { ...where, status: { equals: "resolved" } },
      }),
    ]);
    return { total, sanctioned };
  }

  async guildIds(): Promise<string[]> {
    const rows = await prisma.messageReport.findMany({
      distinct: ["guildId"],
      select: { guildId: true },
    });
    return rows.map((row) => row.guildId);
  }

  async closedBefore(
    guildId: string,
    before: Date
  ): Promise<Pick<Report, "id" | "alertChannelId" | "alertMessageId">[]> {
    return prisma.messageReport.findMany({
      where: { guildId, status: { not: "open" }, handledAt: { lt: before } },
      select: { id: true, alertChannelId: true, alertMessageId: true },
    });
  }

  async delete(reportId: number): Promise<void> {
    await prisma.messageReport.deleteMany({ where: { id: reportId } });
  }
}

export default declareService(new ReportStore());
