import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ContainerBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type ModalSubmitInteraction,
} from "discord.js";
import coreModule from "#core/core.module.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { replyWithCoreT } from "#core/utils/core-config.js";
import {
  ConfigType,
  fetchGuildEmojis,
  isChannelRecordsEntry,
  resolveEmoji,
  type ChannelRecord,
  type ChannelRecordOutcome,
  type ChannelRecordsConfigEntry,
} from "#lib/config.js";
import { preview, truncate } from "#lib/format.js";
import { createT, type TFunction } from "#lib/i18n.js";
import {
  declareInteractionHandler,
  type CompatibleInteraction,
} from "#lib/interaction.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import type { Registry } from "#lib/registry.js";
import { Colors } from "#utils/colors.js";
import {
  getConfigEntry,
  refreshSourceConfigMessage,
  resolveConfigurableModule,
} from "./config-edit.js";

export const RECORDS_PER_PAGE = 7;

const TITLE_MAX = 45;
const CHANNEL_INPUT = "channel";
const PREFILL_WAIT_MS = 1500;
const MODAL_DEADLINE_MS = 2200;

const logger = loggerMaker("config");

export function prefillWait(createdTimestamp: number): number {
  const left = MODAL_DEADLINE_MS - (Date.now() - createdTimestamp);
  return Math.min(PREFILL_WAIT_MS, Math.max(0, left));
}

export function withDeadline<T>(
  promise: Promise<T>,
  waitMs: number
): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs);
  });
  return Promise.race([promise.catch(() => null), timeout]).finally(() =>
    clearTimeout(timer)
  );
}

interface Resolved {
  module: Module;
  key: string;
  entry: ChannelRecordsConfigEntry;
}

function sortRecords(records: ChannelRecord[]): ChannelRecord[] {
  return [...records].sort((a, b) =>
    BigInt(a.channelId) < BigInt(b.channelId) ? -1 : 1
  );
}

export function pageOfChannel(
  records: ChannelRecord[],
  channelId: string | undefined
): number {
  const index = sortRecords(records).findIndex(
    (record) => record.channelId === channelId
  );
  return index < 0 ? 0 : Math.floor(index / RECORDS_PER_PAGE);
}

function entryName(
  key: string,
  entry: ChannelRecordsConfigEntry,
  t: TFunction
) {
  return t("config." + key + ".name", { defaultValue: entry.name });
}

function fieldName(
  key: string,
  field: string,
  entry: ChannelRecordsConfigEntry,
  t: TFunction
): string {
  return t("config." + key + ".fields." + field, {
    defaultValue: entry.fields[field]?.name ?? field,
  });
}

function recordLine(
  entry: ChannelRecordsConfigEntry,
  record: ChannelRecord
): string {
  const values = Object.entries(entry.fields).map(([field, spec]) => {
    const value = record.values[field] ?? "";
    return spec.type === ConfigType.EMOJI ? value : preview(value);
  });
  return [`<#${record.channelId}>`, ...values].join(" → ");
}

export function channelRecordsEditorMessage(
  { module, key, entry }: Resolved,
  records: ChannelRecord[],
  sourceMessageId: string,
  t: TFunction,
  page = 0,
  notice?: ChannelRecordOutcome
): ContainerBuilder[] {
  const sorted = sortRecords(records);
  const pageCount = Math.max(1, Math.ceil(sorted.length / RECORDS_PER_PAGE));
  const currentPage = Math.min(Math.max(page, 0), pageCount - 1);
  const container = new ContainerBuilder().setAccentColor(Colors.Turquoise);

  const moduleName = t("modules." + module.id + ".name", {
    defaultValue: module.name,
  });
  const name = entryName(key, entry, t);
  let header = t(
    name === moduleName
      ? "channelRecords.headerSingle"
      : "channelRecords.header",
    {
      moduleName,
      entryName: name,
      entryDesc: t("config." + key + ".description", {
        defaultValue: entry.description,
      }),
    }
  );
  if (pageCount > 1) {
    header +=
      "\n" + t("config.page", { current: currentPage + 1, total: pageCount });
  }
  if (notice) {
    header += `\n\n${notice.ok ? "✅" : "❌"} ${notice.message}`;
  }
  container.addTextDisplayComponents((text) => text.setContent(header));
  container.addSeparatorComponents((separator) => separator.setDivider(true));

  const idSuffix = `${module.id}:${key}:${sourceMessageId}`;
  const shown = sorted.slice(
    currentPage * RECORDS_PER_PAGE,
    (currentPage + 1) * RECORDS_PER_PAGE
  );

  if (shown.length === 0) {
    container.addTextDisplayComponents((text) =>
      text.setContent(t("channelRecords.empty"))
    );
  }

  for (const record of shown) {
    container.addTextDisplayComponents((text) =>
      text.setContent(recordLine(entry, record))
    );
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`channel-records-edit:${idSuffix}:${record.channelId}`)
          .setLabel(t("channelRecords.edit"))
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(
            `channel-records-remove:${idSuffix}:${currentPage}:${record.channelId}`
          )
          .setLabel(t("channelRecords.remove"))
          .setStyle(ButtonStyle.Danger)
      )
    );
  }

  const row = new ActionRowBuilder<ButtonBuilder>();
  if (pageCount > 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`channel-records-page:${idSuffix}:${currentPage - 1}`)
        .setLabel(t("config.previous"))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0)
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`channel-records-add:${idSuffix}`)
      .setLabel(t("channelRecords.add"))
      .setStyle(ButtonStyle.Success)
  );
  if (pageCount > 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`channel-records-page:${idSuffix}:${currentPage + 1}`)
        .setLabel(t("config.next"))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === pageCount - 1)
    );
  }
  container.addActionRowComponents(row);

  return [container];
}

export function channelRecordModal(
  { module, key, entry }: Resolved,
  sourceMessageId: string,
  t: TFunction,
  record?: ChannelRecord,
  channelName?: string
): ModalBuilder {
  const name = entryName(key, entry, t);
  const title = record
    ? t("channelRecords.editTitle", {
        name,
        channel: channelName ?? `#${record.channelId}`,
      })
    : t("channelRecords.addTitle", { name });
  const modal = new ModalBuilder()
    .setCustomId(
      `channel-records-modal:${module.id}:${key}:${sourceMessageId}` +
        (record ? `:${record.channelId}` : "")
    )
    .setTitle(truncate(title, TITLE_MAX));

  if (!record) {
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel(
          truncate(
            t("config." + key + ".channel", {
              defaultValue: entry.channel.name,
            }),
            TITLE_MAX
          )
        )
        .setChannelSelectMenuComponent(
          new ChannelSelectMenuBuilder()
            .setCustomId(CHANNEL_INPUT)
            .setChannelTypes(...entry.channel.channelTypes)
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true)
        )
    );
  }

  for (const [field, spec] of Object.entries(entry.fields)) {
    const input = new TextInputBuilder()
      .setCustomId(field)
      .setStyle(
        spec.multiline ? TextInputStyle.Paragraph : TextInputStyle.Short
      )
      .setRequired(true);
    if (spec.maxLength) {
      input.setMaxLength(spec.maxLength);
    }
    if (spec.type === ConfigType.EMOJI) {
      input.setPlaceholder(t("config.emoji.placeholder"));
    }
    const current = record?.values[field];
    if (current) {
      input.setValue(
        spec.maxLength
          ? Array.from(current).slice(0, spec.maxLength).join("")
          : current
      );
    }
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel(truncate(fieldName(key, field, entry, t), TITLE_MAX))
        .setTextInputComponent(input)
    );
  }

  return modal;
}

async function resolve(
  interaction: CompatibleInteraction,
  moduleId: string | undefined,
  key: string | undefined
): Promise<Resolved | null> {
  const module = resolveConfigurableModule(moduleId);
  const entry = module && key ? getConfigEntry(module, key) : undefined;
  if (!module || !key || !isChannelRecordsEntry(entry)) {
    await replyWithCoreT(interaction, "interaction.configOptionNotFound");
    return null;
  }
  if (!(await isModuleEnabled(module, interaction.guildId!))) {
    await replyWithCoreT(interaction, "interaction.moduleNotEnabled");
    return null;
  }
  return { module, key, entry };
}

async function isModuleEnabled(module: Module, guildId: string) {
  return (
    module.id === coreModule.id ||
    (await moduleService.getModuleStateFromGuildIdIn(module.id, guildId))
      .activated
  );
}

async function moduleT(module: Module, guildId: string): Promise<TFunction> {
  return createT(await configService.getLocaleForGuild(guildId), module.id);
}

async function editorComponents(
  resolved: Resolved,
  guildId: string,
  sourceMessageId: string,
  page: number | ((records: ChannelRecord[]) => number),
  notice?: ChannelRecordOutcome
): Promise<ContainerBuilder[]> {
  const [t, records] = await Promise.all([
    moduleT(resolved.module, guildId),
    resolved.entry.source.list(guildId),
  ]);
  return channelRecordsEditorMessage(
    resolved,
    records,
    sourceMessageId,
    t,
    typeof page === "number" ? page : page(records),
    notice
  );
}

export async function openChannelRecordsEditor(
  interaction: ButtonInteraction,
  module: Module,
  key: string,
  sourceMessageId: string
): Promise<void> {
  const entry = getConfigEntry(module, key);
  if (!isChannelRecordsEntry(entry)) {
    return;
  }
  if (!(await isModuleEnabled(module, interaction.guildId!))) {
    await replyWithCoreT(interaction, "interaction.moduleNotEnabled");
    return;
  }
  const guild = interaction.guild!;
  const [t, records] = await Promise.all([
    moduleT(module, guild.id),
    entry.source.list(guild.id),
  ]);
  const deleted = records.filter(
    ({ channelId }) => !guild.channels.cache.has(channelId)
  );
  await interaction.reply({
    components: channelRecordsEditorMessage(
      { module, key, entry },
      records.filter((record) => !deleted.includes(record)),
      sourceMessageId,
      t
    ),
    flags: MessageFlags.Ephemeral + MessageFlags.IsComponentsV2,
  });
  for (const { channelId } of deleted) {
    try {
      await entry.source.remove(guild, channelId, {
        t,
        userId: interaction.user.id,
      });
    } catch (err) {
      logger.warn(
        { err },
        `Could not remove the record of a deleted channel | module = ${module.id} | key = ${key} | channelId = ${channelId}`
      );
    }
  }
  if (deleted.length > 0) {
    await refreshSourceConfigMessage(interaction, module, sourceMessageId, key);
  }
}

async function readValues(
  interaction: ModalSubmitInteraction,
  { key, entry }: Resolved,
  t: TFunction
): Promise<{ values: Record<string, string> } | { error: string }> {
  const values: Record<string, string> = {};
  for (const [field, spec] of Object.entries(entry.fields)) {
    const typed = interaction.fields.getTextInputValue(field).trim();
    if (!typed) {
      return {
        error: t("channelRecords.emptyField", {
          field: fieldName(key, field, entry, t),
        }),
      };
    }
    if (spec.type === ConfigType.EMOJI) {
      const emoji = resolveEmoji(
        typed,
        await fetchGuildEmojis(interaction.guild)
      );
      if (!emoji) {
        return { error: t("channelRecords.invalidEmoji", { value: typed }) };
      }
      values[field] = emoji;
    } else {
      values[field] = typed;
    }
  }
  return { values };
}

async function saveFromModal(
  interaction: ModalSubmitInteraction,
  guild: Guild,
  resolved: Resolved,
  channelId: string | undefined,
  t: TFunction
): Promise<ChannelRecordOutcome> {
  if (!channelId) {
    return { ok: false, message: t("channelRecords.noChannel") };
  }
  const read = await readValues(interaction, resolved, t);
  if ("error" in read) {
    return { ok: false, message: read.error };
  }
  return resolved.entry.source.save(
    guild,
    { channelId, values: read.values },
    { t, userId: interaction.user.id }
  );
}

const pageButton = declareInteractionHandler({
  customId: "channel-records-page",
  access: "admin",
  check: (interaction) => interaction.isButton(),
  async execute(interaction, [moduleId, key, sourceMessageId, pageRaw]) {
    const resolved = await resolve(interaction, moduleId, key);
    if (!resolved) {
      return;
    }
    const page = Number(pageRaw);
    await interaction.update({
      components: await editorComponents(
        resolved,
        interaction.guildId!,
        sourceMessageId!,
        Number.isInteger(page) ? page : 0
      ),
      flags: MessageFlags.IsComponentsV2,
    });
  },
});

const addButton = declareInteractionHandler({
  customId: "channel-records-add",
  access: "admin",
  check: (interaction) => interaction.isButton(),
  async execute(interaction, [moduleId, key, sourceMessageId]) {
    const resolved = await resolve(interaction, moduleId, key);
    if (!resolved) {
      return;
    }
    const t = await moduleT(resolved.module, interaction.guildId!);
    await interaction.showModal(
      channelRecordModal(resolved, sourceMessageId!, t)
    );
  },
});

const editButton = declareInteractionHandler({
  customId: "channel-records-edit",
  access: "admin",
  check: (interaction) => interaction.isButton(),
  async execute(interaction, [moduleId, key, sourceMessageId, channelId]) {
    const resolved = await resolve(interaction, moduleId, key);
    if (!resolved) {
      return;
    }
    const guildId = interaction.guildId!;
    const [t, records] = await Promise.all([
      moduleT(resolved.module, guildId),
      withDeadline(
        resolved.entry.source.list(guildId),
        prefillWait(interaction.createdTimestamp)
      ),
    ]);
    const record = records
      ? records.find((item) => item.channelId === channelId)
      : { channelId: channelId!, values: {} };
    if (!record) {
      await interaction.update({
        components: channelRecordsEditorMessage(
          resolved,
          records ?? [],
          sourceMessageId!,
          t,
          0,
          { ok: false, message: t("channelRecords.gone") }
        ),
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }
    const channel = interaction.guild?.channels.cache.get(record.channelId);
    await interaction.showModal(
      channelRecordModal(
        resolved,
        sourceMessageId!,
        t,
        record,
        channel ? `#${channel.name}` : undefined
      )
    );
  },
});

const removeButton = declareInteractionHandler({
  customId: "channel-records-remove",
  access: "admin",
  check: (interaction) => interaction.isButton(),
  async execute(
    interaction,
    [moduleId, key, sourceMessageId, pageRaw, channelId]
  ) {
    const resolved = await resolve(interaction, moduleId, key);
    if (!resolved) {
      return;
    }
    if (!channelId) {
      await replyWithCoreT(interaction, "interaction.configOptionNotFound");
      return;
    }
    const guild = interaction.guild!;
    await interaction.deferUpdate();
    const t = await moduleT(resolved.module, guild.id);
    const outcome = await resolved.entry.source.remove(guild, channelId, {
      t,
      userId: interaction.user.id,
    });
    const page = Number(pageRaw);
    await interaction.editReply({
      components: await editorComponents(
        resolved,
        guild.id,
        sourceMessageId!,
        Number.isInteger(page) ? page : 0,
        outcome
      ),
      flags: MessageFlags.IsComponentsV2,
    });
    await refreshSourceConfigMessage(
      interaction,
      resolved.module,
      sourceMessageId,
      resolved.key
    );
  },
});

const recordModal = declareInteractionHandler<ModalSubmitInteraction>({
  customId: "channel-records-modal",
  access: "admin",
  check: (interaction): interaction is ModalSubmitInteraction =>
    interaction.isModalSubmit(),
  async execute(interaction, [moduleId, key, sourceMessageId, editedId]) {
    const resolved = await resolve(interaction, moduleId, key);
    if (!resolved || !interaction.guild) {
      return;
    }
    if (interaction.isFromMessage()) {
      await interaction.deferUpdate();
    } else {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    const guild = interaction.guild;
    const t = await moduleT(resolved.module, guild.id);
    const channelId =
      editedId ??
      interaction.fields
        .getSelectedChannels(
          CHANNEL_INPUT,
          false,
          resolved.entry.channel.channelTypes
        )
        ?.first()?.id;
    const outcome = await saveFromModal(
      interaction,
      guild,
      resolved,
      channelId,
      t
    );
    await interaction.editReply({
      components: await editorComponents(
        resolved,
        guild.id,
        sourceMessageId!,
        (records) => pageOfChannel(records, channelId),
        outcome
      ),
      flags: MessageFlags.IsComponentsV2,
    });
    if (outcome.ok) {
      await refreshSourceConfigMessage(
        interaction,
        resolved.module,
        sourceMessageId,
        resolved.key
      );
    }
  },
});

export function registerChannelRecordsEditorHandlers(registry: Registry): void {
  registry.register(pageButton);
  registry.register(addButton);
  registry.register(editButton);
  registry.register(removeButton);
  registry.register(recordModal);
}
