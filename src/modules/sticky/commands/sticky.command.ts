import {
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  escapeMarkdown,
  type ChatInputCommandInteraction,
} from "discord.js";
import { declareCommand } from "#lib/command.js";
import type { ConfigProvider } from "#lib/config.js";
import { describeLines } from "#lib/format.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import poster from "#modules/sticky/services/poster.js";
import store from "#modules/sticky/services/store.js";
import { Colors } from "#utils/colors.js";

const logger = loggerMaker("sticky");

type Interaction = ChatInputCommandInteraction<"cached">;
type Config = ConfigProvider<{}>;

export const STICKY_MODAL_ID = "sticky-modal";
export const CONTENT_MAX = 2000;
const PREVIEW_MAX = 80;
const PREFILL_WAIT_MS = 1500;
const MODAL_DEADLINE_MS = 2200;

const ESCAPE_ALL = {
  maskedLink: true,
  heading: true,
  bulletedList: true,
  numberedList: true,
} as const;

const ephemeral = { flags: MessageFlags.Ephemeral } as const;

export function preview(content: string): string {
  const chars = Array.from(content.replace(/\s+/g, " ").trim());
  const line =
    chars.length > PREVIEW_MAX
      ? `${chars.slice(0, PREVIEW_MAX - 1).join("")}…`
      : chars.join("");
  return escapeMarkdown(line, ESCAPE_ALL).replaceAll("<", "\\<");
}

export function prefillWait(createdTimestamp: number): number {
  const left = MODAL_DEADLINE_MS - (Date.now() - createdTimestamp);
  return Math.min(PREFILL_WAIT_MS, Math.max(0, left));
}

export function currentContent(
  guildId: string,
  channelId: string,
  waitMs: number
): Promise<string | null> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs);
  });
  const lookup = store
    .get(guildId, channelId)
    .then((sticky) => sticky?.content ?? null)
    .catch(() => null);
  return Promise.race([lookup, timeout]).finally(() => clearTimeout(timer));
}

async function set(interaction: Interaction, config: Config) {
  const channel = interaction.options.getChannel("channel", true);
  const current = await currentContent(
    interaction.guildId,
    channel.id,
    prefillWait(interaction.createdTimestamp)
  );
  const input = new TextInputBuilder()
    .setCustomId("content")
    .setLabel(config.t("modal.content"))
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(CONTENT_MAX);
  if (current) {
    input.setValue(current);
  }
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(`${STICKY_MODAL_ID}:${channel.id}`)
      .setTitle(config.t("modal.title"))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(input)
      )
  );
}

async function remove(interaction: Interaction, config: Config) {
  const channel = interaction.options.getChannel("channel", true, [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
  ]);
  await interaction.deferReply(ephemeral);
  const { removed, leftover } = await poster.unstick(channel);
  if (removed) {
    logger.info(
      `Sticky removed | guildId = ${interaction.guildId} | channelId = ${channel.id} | by = ${interaction.user.id}`
    );
  }
  const key = !removed
    ? "remove.none"
    : leftover
      ? "remove.leftover"
      : "remove.done";
  await interaction.editReply(config.t(key, { channel: `<#${channel.id}>` }));
}

async function list(interaction: Interaction, config: Config) {
  await interaction.deferReply(ephemeral);
  const channels = interaction.guild.channels.cache;
  const stickies = await store.list(interaction.guildId);
  const deleted = stickies
    .map(({ channelId }) => channelId)
    .filter((channelId) => !channels.has(channelId));
  if (deleted.length > 0) {
    await store.remove(interaction.guildId, ...deleted);
    logger.info(
      `Stickies of deleted channels removed | guildId = ${interaction.guildId} | channelIds = ${deleted.join(",")}`
    );
  }
  const existing = stickies.filter(({ channelId }) => channels.has(channelId));

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
                    ({ channelId, content }) =>
                      `<#${channelId}> → ${preview(content)}`
                  ),
                  (count) => config.t("list.more", { count })
                )
              )
              .setColor(Colors.SkyBlue),
          ],
          allowedMentions: NO_MENTIONS,
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
    .setName("sticky")
    .setDescription("Keep a message at the bottom of a channel")
    .setDescriptionLocalizations({
      fr: "Garder un message en bas d'un salon",
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([InteractionContextType.Guild])
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set or edit the sticky message of a channel")
        .setDescriptionLocalizations({
          fr: "Définir ou modifier le message collant d'un salon",
        })
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel where the message stays at the bottom")
            .setDescriptionLocalizations({
              fr: "Salon où le message reste en bas",
            })
            .addChannelTypes(...channelTypes)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove the sticky message of a channel")
        .setDescriptionLocalizations({
          fr: "Retirer le message collant d'un salon",
        })
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to clear")
            .setDescriptionLocalizations({ fr: "Salon à libérer" })
            .addChannelTypes(...channelTypes)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List the channels with a sticky message")
        .setDescriptionLocalizations({
          fr: "Lister les salons avec un message collant",
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
