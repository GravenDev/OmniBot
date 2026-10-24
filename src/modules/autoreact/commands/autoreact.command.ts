import {
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildBasedChannel,
  type PermissionsString,
} from "discord.js";
import { declareCommand } from "#lib/command.js";
import {
  fetchGuildEmojis,
  resolveEmoji,
  type ConfigProvider,
} from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import store from "#modules/autoreact/services/store.js";
import { Colors } from "#utils/colors.js";

const logger = loggerMaker("autoreact");

type Interaction = ChatInputCommandInteraction<"cached">;
type Config = ConfigProvider<{}>;

const ephemeral = { flags: MessageFlags.Ephemeral } as const;

const CUSTOM_EMOJI_ID = /:(\d{17,20})>$/;
const DESCRIPTION_LIMIT = 4096;
const MORE_LINE_RESERVE = 64;

const REQUIRED_PERMISSIONS: PermissionsString[] = [
  "ViewChannel",
  "ReadMessageHistory",
  "AddReactions",
];

export async function parseEmoji(
  interaction: Interaction,
  value: string
): Promise<string | null> {
  const guildEmojis = await fetchGuildEmojis(interaction.guild);
  const emoji = resolveEmoji(value.trim(), guildEmojis);
  const customId = emoji?.match(CUSTOM_EMOJI_ID)?.[1];
  if (
    customId &&
    !guildEmojis.some((guildEmoji) => guildEmoji.id === customId) &&
    !interaction.client.emojis.resolve(customId)
  ) {
    return null;
  }
  return emoji;
}

export async function missingPermissions(
  interaction: Interaction,
  channel: GuildBasedChannel
): Promise<PermissionsString[]> {
  const me =
    interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
  const permissions = channel.permissionsFor(me);
  return permissions
    ? permissions.missing(REQUIRED_PERMISSIONS)
    : REQUIRED_PERMISSIONS;
}

export function describeLines(
  lines: string[],
  more: (count: number) => string
): string {
  const budget = DESCRIPTION_LIMIT - MORE_LINE_RESERVE;
  const shown: string[] = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length + 1 > budget) {
      break;
    }
    shown.push(line);
    length += line.length + 1;
  }
  const hidden = lines.length - shown.length;
  return [...shown, ...(hidden > 0 ? [more(hidden)] : [])].join("\n");
}

async function set(interaction: Interaction, config: Config) {
  const channel = interaction.options.getChannel("channel", true);
  const value = interaction.options.getString("emoji", true);
  await interaction.deferReply(ephemeral);
  const emoji = await parseEmoji(interaction, value);
  if (!emoji) {
    await interaction.editReply(config.t("set.invalidEmoji", { emoji: value }));
    return;
  }

  const missing = await missingPermissions(interaction, channel);
  if (missing.length > 0) {
    await interaction.editReply(
      config.t("set.missingPermissions", {
        channel: `<#${channel.id}>`,
        permissions: missing
          .map((permission) => config.t(`permission.${permission}`))
          .join(", "),
      })
    );
    return;
  }

  await store.set(interaction.guildId, channel.id, emoji);
  logger.info(
    `Auto-reaction set | guildId = ${interaction.guildId} | channelId = ${channel.id} | emoji = ${emoji} | by = ${interaction.user.id}`
  );
  await interaction.editReply(
    config.t("set.done", { channel: `<#${channel.id}>`, emoji })
  );
}

async function remove(interaction: Interaction, config: Config) {
  const channel = interaction.options.getChannel("channel", true);
  await interaction.deferReply(ephemeral);
  const removed = await store.remove(interaction.guildId, channel.id);
  if (removed) {
    logger.info(
      `Auto-reaction removed | guildId = ${interaction.guildId} | channelId = ${channel.id} | by = ${interaction.user.id}`
    );
  }
  await interaction.editReply(
    config.t(removed ? "remove.done" : "remove.none", {
      channel: `<#${channel.id}>`,
    })
  );
}

async function list(interaction: Interaction, config: Config) {
  await interaction.deferReply(ephemeral);
  const channels = interaction.guild.channels.cache;
  const reactions = await store.list(interaction.guildId);
  const deleted = reactions
    .map(({ channelId }) => channelId)
    .filter((channelId) => !channels.has(channelId));
  if (deleted.length > 0) {
    await store.remove(interaction.guildId, ...deleted);
    logger.info(
      `Auto-reactions of deleted channels removed | guildId = ${interaction.guildId} | channelIds = ${deleted.join(",")}`
    );
  }
  const existing = reactions.filter(({ channelId }) => channels.has(channelId));

  await interaction.editReply(
    existing.length === 0
      ? config.t("list.empty")
      : {
          embeds: [
            new EmbedBuilder()
              .setTitle(config.t("list.title", { count: existing.length }))
              .setDescription(
                describeLines(
                  existing.map(
                    ({ channelId, emoji }) => `<#${channelId}> → ${emoji}`
                  ),
                  (count) => config.t("list.more", { count })
                )
              )
              .setColor(Colors.SkyBlue),
          ],
        }
  );
}

const subcommands: Record<
  string,
  (interaction: Interaction, config: Config) => Promise<void>
> = { set, remove, list };

const channelTypes = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
] as const;

export default declareCommand({
  requiresAdmin: true,

  data: new SlashCommandBuilder()
    .setName("autoreact")
    .setDescription("Automatically react to new messages in a channel")
    .setDescriptionLocalizations({
      fr: "Réagir automatiquement aux nouveaux messages d'un salon",
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([InteractionContextType.Guild])
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set the reaction added in a channel")
        .setDescriptionLocalizations({
          fr: "Définir la réaction ajoutée dans un salon",
        })
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to watch")
            .setDescriptionLocalizations({ fr: "Salon à surveiller" })
            .addChannelTypes(...channelTypes)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("emoji")
            .setDescription("Emoji to react with")
            .setDescriptionLocalizations({ fr: "Emoji de la réaction" })
            .setMaxLength(64)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Stop reacting in a channel")
        .setDescriptionLocalizations({ fr: "Ne plus réagir dans un salon" })
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to stop watching")
            .setDescriptionLocalizations({ fr: "Salon à ne plus surveiller" })
            .addChannelTypes(...channelTypes)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List the channels with an automatic reaction")
        .setDescriptionLocalizations({
          fr: "Lister les salons avec une réaction automatique",
        })
    ),

  async execute(interaction, config) {
    if (interaction.inCachedGuild()) {
      await subcommands[interaction.options.getSubcommand()]?.(
        interaction,
        config
      );
    }
  },
});
