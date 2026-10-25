import {
  DiscordAPIError,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type Channel,
  type Client,
  type GuildTextBasedChannel,
  type Message,
  type SendableChannels,
} from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import { KeyedQueue } from "#lib/keyed-queue.js";
import { loggerMaker } from "#lib/logger.js";
import { declareService, type Service } from "#lib/service.js";
import type { ReportsConfigSchema } from "../reports.config.js";
import { alertMessage } from "./alert-view.js";
import store, {
  type MessageSnapshot,
  type Report,
  type Reporter,
  type ReportExpiry,
} from "./store.js";

const logger = loggerMaker("reports");

export type ReportOutcome =
  | "created"
  | "added"
  | "reopened"
  | "duplicate"
  | "unconfigured";

export type Ineligibility = "bot" | "self" | "alertChannel";

type Config = ConfigProvider<ReportsConfigSchema>;

const VARIATION_SELECTOR = /️/g;

export function matchesEmoji(
  configured: string,
  emoji: { id: string | null; name: string | null }
): boolean {
  const custom = configured.match(/^<a?:\w+:(\d+)>$/);
  if (custom) {
    return emoji.id === custom[1];
  }
  return (
    emoji.id === null &&
    emoji.name !== null &&
    emoji.name.replace(VARIATION_SELECTOR, "") ===
      configured.replace(VARIATION_SELECTOR, "")
  );
}

export function snapshotOf(message: Message<true>): MessageSnapshot {
  return {
    guildId: message.guildId,
    channelId: message.channelId,
    messageId: message.id,
    authorId: message.author.id,
    content: message.content,
    attachments: [
      ...[...message.attachments.values()].map((attachment) => ({
        name: attachment.name,
        url: attachment.url,
      })),
      ...[...message.stickers.values()].map((sticker) => ({
        name: sticker.name,
        url: sticker.url,
      })),
    ],
    createdAt: message.createdAt,
  };
}

export function ineligibility(
  message: Pick<Message<true>, "author" | "system" | "channelId" | "channel">,
  reporterId: string,
  alertChannelId: string | undefined
): Ineligibility | null {
  if (message.author.bot || message.system) {
    return "bot";
  }
  if (message.author.id === reporterId) {
    return "self";
  }
  const parentId = message.channel.isThread() ? message.channel.parentId : null;
  if (
    alertChannelId &&
    (message.channelId === alertChannelId || parentId === alertChannelId)
  ) {
    return "alertChannel";
  }
  return null;
}

export function canPost(
  channel: Channel | null | undefined
): channel is GuildTextBasedChannel {
  if (!channel?.isSendable() || channel.isDMBased()) {
    return false;
  }
  const me = channel.guild.members.me;
  return (
    !me ||
    (channel
      .permissionsFor(me)
      ?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ]) ??
      false)
  );
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof DiscordAPIError &&
    (error.code === RESTJSONErrorCodes.UnknownMessage ||
      error.code === RESTJSONErrorCodes.UnknownChannel)
  );
}

class ReportService implements Service {
  private readonly queue = new KeyedQueue();

  private key(report: Pick<Report, "guildId" | "messageId">): string {
    return `${report.guildId}:${report.messageId}`;
  }

  async report(
    client: Client,
    config: Config,
    snapshot: MessageSnapshot,
    reporter: Omit<Reporter, "reportedAt">,
    reactionKept: boolean
  ): Promise<ReportOutcome> {
    if (!canPost(config.get("alertChannel"))) {
      return "unconfigured";
    }

    return this.queue.run(this.key(snapshot), async () => {
      const existing = await store.byMessage(
        snapshot.guildId,
        snapshot.messageId
      );

      if (!existing) {
        const created = await store.create(snapshot, reporter, reactionKept);
        logger.info(
          `Report created | guildId = ${snapshot.guildId} | reportId = ${created.id}`
        );
        await this.publish(client, config, snapshot.guildId, created.id, false);
        return "created";
      }

      if (!(await store.addReporter(existing.id, reporter, reactionKept))) {
        return "duplicate";
      }

      const reopened = existing.status !== "open";
      if (reopened) {
        await store.setStatus(existing.id, "open", null);
      }
      await this.publish(
        client,
        config,
        snapshot.guildId,
        existing.id,
        reopened
      );
      return reopened ? "reopened" : "added";
    });
  }

  async withExpiry<T>(
    guildId: string,
    reportId: number,
    task: (expiry: ReportExpiry) => Promise<T>
  ): Promise<T | null> {
    const first = await store.expiryOf(guildId, reportId);
    if (!first) {
      return null;
    }
    return this.queue.run(this.key(first), async () => {
      const expiry = await store.expiryOf(guildId, reportId);
      return expiry ? task(expiry) : null;
    });
  }

  async withReport<T>(
    guildId: string,
    reportId: number,
    task: (report: Report) => Promise<T>
  ): Promise<T | null> {
    const first = await store.byId(guildId, reportId);
    if (!first) {
      return null;
    }
    return this.queue.run(this.key(first), async () => {
      const report = await store.byId(guildId, reportId);
      return report ? task(report) : null;
    });
  }

  async messageChanged(
    client: Client,
    config: Config,
    guildId: string,
    messageId: string,
    change:
      | { deleted: true }
      | { deleted: false; content: () => Promise<string> }
  ): Promise<void> {
    await this.queue.run(`${guildId}:${messageId}`, async () => {
      const report = await store.byMessage(guildId, messageId);
      if (!report || report.messageState === "deleted") {
        return;
      }
      if (change.deleted) {
        await store.setMessageState(report.id, "deleted");
      } else {
        const content = await change.content().catch(() => null);
        if (
          content === null ||
          content === (report.editedContent ?? report.content)
        ) {
          return;
        }
        await store.setMessageState(report.id, "edited", content);
      }
      await this.publish(client, config, guildId, report.id, false);
    });
  }

  async publish(
    client: Client,
    config: Config,
    guildId: string,
    reportId: number,
    reopened: boolean
  ): Promise<void> {
    const report = await store.byId(guildId, reportId);
    if (!report) {
      return;
    }

    const moderatorRoleId = config.get("moderatorRole")?.id ?? null;
    const view = alertMessage(report, {
      t: config.t,
      history: await store.authorHistory(
        report.guildId,
        report.authorId,
        report.id
      ),
      moderatorRoleId,
    });

    const alertChannel = await this.editAlert(client, report, view);
    if (alertChannel) {
      if (reopened) {
        await alertChannel.send({
          content: config.t("alert.reopened", {
            id: report.id,
            role: moderatorRoleId ? `<@&${moderatorRoleId}>` : "",
          }),
          allowedMentions: {
            parse: [],
            roles: moderatorRoleId ? [moderatorRoleId] : [],
          },
          reply: {
            messageReference: report.alertMessageId!,
            failIfNotExists: false,
          },
        });
      }
      return;
    }

    if (report.status !== "open") {
      logger.info(
        `Alert gone for a closed report, not republished | guildId = ${report.guildId} | reportId = ${report.id}`
      );
      return;
    }

    const channel = config.get("alertChannel");
    if (!canPost(channel)) {
      logger.warn(
        `No usable alert channel | guildId = ${report.guildId} | reportId = ${report.id}`
      );
      return;
    }
    const sent = await channel.send(view);
    await store.setAlert(report.id, sent.channelId, sent.id);
  }

  private async editAlert(
    client: Client,
    report: Report,
    view: ReturnType<typeof alertMessage>
  ): Promise<SendableChannels | null> {
    if (!report.alertChannelId || !report.alertMessageId) {
      return null;
    }
    try {
      const channel = await client.channels.fetch(report.alertChannelId);
      if (!channel?.isSendable()) {
        return null;
      }
      await channel.messages.edit(report.alertMessageId, view);
      return channel;
    } catch (error) {
      if (isMissing(error)) {
        return null;
      }
      throw error;
    }
  }
}

export default declareService(new ReportService());
