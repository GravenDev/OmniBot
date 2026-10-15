import {
  ActionRowBuilder,
  DiscordAPIError,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import { parseDuration } from "#lib/duration.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { loggerMaker } from "#lib/logger.js";
import type { ReportsConfigSchema } from "../reports.config.js";
import { messageUrl } from "../services/alert-view.js";
import {
  applySanction,
  fetchMember,
  MAX_BAN_PURGE_SECONDS,
  MAX_TIMEOUT_SECONDS,
  rankOf,
  sanctionBlock,
  targetRankOf,
  type Sanction,
} from "../services/moderation.js";
import reportService from "../services/report.service.js";
import store, { type Report } from "../services/store.js";

const logger = loggerMaker("reports");

type Config = ConfigProvider<ReportsConfigSchema>;
type Direct = "delete" | "dismiss" | "abusive" | "reopen";

const PERMISSIONS: Record<Direct | Sanction, bigint> = {
  delete: PermissionFlagsBits.ManageMessages,
  dismiss: PermissionFlagsBits.ManageMessages,
  abusive: PermissionFlagsBits.ManageMessages,
  reopen: PermissionFlagsBits.ManageMessages,
  warn: PermissionFlagsBits.ModerateMembers,
  timeout: PermissionFlagsBits.ModerateMembers,
  kick: PermissionFlagsBits.KickMembers,
  ban: PermissionFlagsBits.BanMembers,
};

const REASON_MAX = 400;
const DEFAULT_TIMEOUT = "1h";

function reportIdOf(args: string[]): number | null {
  const id = Number(args[0]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function tell(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  content: string
): Promise<void> {
  const payload = { content, flags: MessageFlags.Ephemeral } as const;
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

function discordErrorKey(error: unknown): string {
  if (
    error instanceof DiscordAPIError &&
    (error.code === RESTJSONErrorCodes.MissingPermissions ||
      error.code === RESTJSONErrorCodes.MissingAccess)
  ) {
    return "error.botPermissions";
  }
  if (
    error instanceof DiscordAPIError &&
    error.code === RESTJSONErrorCodes.CannotSendMessagesToThisUser
  ) {
    return "error.dmClosed";
  }
  return "error.actionFailed";
}

function isUnknownMessage(error: unknown): boolean {
  return (
    error instanceof DiscordAPIError &&
    (error.code === RESTJSONErrorCodes.UnknownMessage ||
      error.code === RESTJSONErrorCodes.UnknownChannel)
  );
}

async function deleteReported(
  interaction: ButtonInteraction,
  config: Config,
  report: Report
): Promise<void> {
  if (report.messageState === "deleted") {
    await tell(interaction, config.t("error.alreadyDeleted"));
    return;
  }

  let failed = false;
  try {
    const guild = interaction.guild!;
    const channel = await guild.channels.fetch(report.channelId);
    if (!channel?.isTextBased()) {
      throw new Error(`Not a text channel | channelId = ${report.channelId}`);
    }
    const moderator = await guild.members.fetch(interaction.user.id);
    if (
      !channel.permissionsFor(moderator).has(PermissionFlagsBits.ManageMessages)
    ) {
      await tell(interaction, config.t("error.memberCannotDelete"));
      return;
    }
    await channel.messages.delete(report.messageId);
  } catch (error) {
    if (!isUnknownMessage(error)) {
      logger.warn({ err: error }, `Delete failed | reportId = ${report.id}`);
      failed = true;
      await tell(interaction, config.t(discordErrorKey(error)));
    }
  }

  await store.addAction(report.id, {
    moderatorId: interaction.user.id,
    action: "delete",
    reason: null,
    duration: null,
    failed,
  });
  if (!failed) {
    await store.setMessageState(report.id, "deleted");
  }
}

async function runDirect(
  action: Direct,
  interaction: ButtonInteraction,
  config: Config,
  report: Report
): Promise<void> {
  if (action === "delete") {
    await deleteReported(interaction, config, report);
    return;
  }
  if (action === "reopen") {
    if (report.status === "open") {
      await tell(interaction, config.t("error.alreadyOpen"));
      return;
    }
    await store.setStatus(report.id, "open", null);
  } else {
    if (report.status !== "open") {
      await tell(interaction, config.t("error.alreadyClosed"));
      return;
    }
    await store.setStatus(
      report.id,
      action === "dismiss" ? "dismissed" : "abusive",
      interaction.user.id
    );
  }
  await store.addAction(report.id, {
    moderatorId: interaction.user.id,
    action,
    reason: null,
    duration: null,
    failed: false,
  });
}

function directButton(action: Direct) {
  return declareInteractionHandler<ButtonInteraction, ReportsConfigSchema>({
    customId: `report-${action}`,
    access: { permissions: PERMISSIONS[action] },
    check: (interaction): interaction is ButtonInteraction =>
      interaction.isButton(),
    execute: async (interaction, args, config) => {
      const reportId = reportIdOf(args);
      if (!reportId) {
        await tell(interaction, config.t("error.notFound"));
        return;
      }

      await interaction.deferUpdate();
      const done = await reportService.withReport(
        interaction.guildId!,
        reportId,
        async (report) => {
          await runDirect(action, interaction, config, report);
          await reportService.publish(
            interaction.client,
            config,
            report.guildId,
            report.id,
            false
          );
          return true;
        }
      );
      if (!done) {
        await tell(interaction, config.t("error.notFound"));
      }
    },
  });
}

function textInput(
  id: string,
  label: string,
  style: TextInputStyle,
  required: boolean,
  options: { value?: string; placeholder?: string; max?: number } = {}
) {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(options.max ?? REASON_MAX);
  if (options.value) input.setValue(options.value);
  if (options.placeholder) input.setPlaceholder(options.placeholder);
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

function sanctionModal(sanction: Sanction, reportId: number, config: Config) {
  const t = config.t;
  const modal = new ModalBuilder()
    .setCustomId(`report-${sanction}-modal:${reportId}`)
    .setTitle(t(`modal.${sanction}.title`, { id: reportId }));

  if (sanction === "timeout") {
    modal.addComponents(
      textInput("duration", t("modal.duration"), TextInputStyle.Short, true, {
        value: DEFAULT_TIMEOUT,
        placeholder: t("modal.durationPlaceholder"),
        max: 20,
      })
    );
  }
  modal.addComponents(
    textInput(
      "reason",
      t(sanction === "warn" ? "modal.warnReason" : "modal.reason"),
      TextInputStyle.Paragraph,
      sanction === "warn"
    )
  );
  if (sanction === "ban") {
    modal.addComponents(
      textInput("purge", t("modal.purge"), TextInputStyle.Short, false, {
        placeholder: t("modal.purgePlaceholder"),
        max: 20,
      })
    );
  }
  return modal;
}

function sanctionButton(sanction: Sanction) {
  return declareInteractionHandler<ButtonInteraction, ReportsConfigSchema>({
    customId: `report-${sanction}`,
    access: { permissions: PERMISSIONS[sanction] },
    check: (interaction): interaction is ButtonInteraction =>
      interaction.isButton(),
    execute: async (interaction, args, config) => {
      const reportId = reportIdOf(args);
      const report = reportId
        ? await store.byId(interaction.guildId!, reportId)
        : null;
      if (!report) {
        await tell(interaction, config.t("error.notFound"));
        return;
      }
      if (report.status !== "open") {
        await tell(interaction, config.t("error.alreadyClosed"));
        return;
      }
      await interaction.showModal(sanctionModal(sanction, report.id, config));
    },
  });
}

interface SanctionFields {
  reason: string | null;
  duration: number | null;
  purgeSeconds: number | null;
}

function readFields(
  sanction: Sanction,
  interaction: ModalSubmitInteraction
): SanctionFields | "invalidDuration" | "invalidPurge" {
  const reason = interaction.fields.getTextInputValue("reason").trim() || null;

  let duration: number | null = null;
  if (sanction === "timeout") {
    duration = parseDuration(interaction.fields.getTextInputValue("duration"));
    if (duration === null || duration > MAX_TIMEOUT_SECONDS) {
      return "invalidDuration";
    }
  }

  let purgeSeconds: number | null = null;
  if (sanction === "ban") {
    const raw = interaction.fields.getTextInputValue("purge").trim();
    if (raw) {
      purgeSeconds = parseDuration(raw);
      if (purgeSeconds === null || purgeSeconds > MAX_BAN_PURGE_SECONDS) {
        return "invalidPurge";
      }
    }
  }

  return { reason, duration, purgeSeconds };
}

async function runSanction(
  sanction: Sanction,
  interaction: ModalSubmitInteraction,
  config: Config,
  report: Report,
  fields: SanctionFields
): Promise<void> {
  if (report.status !== "open") {
    await tell(interaction, config.t("error.alreadyClosed"));
    return;
  }

  const guild = interaction.guild!;
  const moderator = await guild.members.fetch(interaction.user.id);
  const member = await fetchMember(guild, report.authorId);
  const block = sanctionBlock(
    sanction,
    rankOf(moderator),
    member ? targetRankOf(member) : null
  );
  if (block) {
    await tell(interaction, config.t(`block.${block}`));
    return;
  }

  let failed = false;
  try {
    await applySanction(guild, member, report.authorId, sanction, {
      ...fields,
      auditReason: config.t("audit.reason", {
        id: report.id,
        moderator: interaction.user.username,
        reason: fields.reason ?? "—",
      }),
      warnMessage: config.t("warn.dm", {
        guild: guild.name,
        reason: fields.reason ?? "",
        url: messageUrl(report),
      }),
    });
  } catch (error) {
    logger.warn(
      { err: error },
      `Sanction failed | sanction = ${sanction} | reportId = ${report.id}`
    );
    failed = true;
    await tell(interaction, config.t(discordErrorKey(error)));
  }

  await store.addAction(report.id, {
    moderatorId: interaction.user.id,
    action: sanction,
    reason: fields.reason,
    duration: fields.duration,
    failed,
  });
  if (!failed) {
    await store.setStatus(report.id, "resolved", interaction.user.id);
  }
}

function sanctionModalHandler(sanction: Sanction) {
  return declareInteractionHandler<ModalSubmitInteraction, ReportsConfigSchema>(
    {
      customId: `report-${sanction}-modal`,
      access: { permissions: PERMISSIONS[sanction] },
      check: (interaction): interaction is ModalSubmitInteraction =>
        interaction.isModalSubmit(),
      execute: async (interaction, args, config) => {
        const reportId = reportIdOf(args);
        if (!reportId) {
          await tell(interaction, config.t("error.notFound"));
          return;
        }

        const fields = readFields(sanction, interaction);
        if (typeof fields === "string") {
          await tell(interaction, config.t(`error.${fields}`));
          return;
        }

        if (interaction.isFromMessage()) {
          await interaction.deferUpdate();
        } else {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }

        const done = await reportService.withReport(
          interaction.guildId!,
          reportId,
          async (report) => {
            await runSanction(sanction, interaction, config, report, fields);
            await reportService.publish(
              interaction.client,
              config,
              report.guildId,
              report.id,
              false
            );
            return true;
          }
        );
        if (!done) {
          await tell(interaction, config.t("error.notFound"));
        }
      },
    }
  );
}

const SANCTIONS: Sanction[] = ["warn", "timeout", "kick", "ban"];
const DIRECT: Direct[] = ["delete", "dismiss", "abusive", "reopen"];

export const alertButtonHandlers = [
  ...DIRECT.map(directButton),
  ...SANCTIONS.map(sanctionButton),
];

export const alertModalHandlers = SANCTIONS.map(sanctionModalHandler);
