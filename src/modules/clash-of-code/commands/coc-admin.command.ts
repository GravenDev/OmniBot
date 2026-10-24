import {
  AttachmentBuilder,
  escapeMarkdown,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { declareCommand } from "#lib/command.js";
import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import type { ClashOfCodeConfigSchema } from "#modules/clash-of-code/clash-of-code.config.js";
import {
  ClashNotFoundError,
  fetchClashReport,
} from "#modules/clash-of-code/services/api.js";
import { parseClashLinks } from "#modules/clash-of-code/services/links.js";
import store from "#modules/clash-of-code/services/store.js";
import {
  modeLabel,
  resultImage,
} from "#modules/clash-of-code/services/views.js";

const HANDLE_PATTERN = /^[0-9a-f]{30,40}$/i;

const logger = loggerMaker("clash-of-code");

type Interaction = ChatInputCommandInteraction<"cached" | "raw">;
type Config = ConfigProvider<ClashOfCodeConfigSchema>;

const ephemeral = { flags: MessageFlags.Ephemeral } as const;

/** Accepts a bare clash id as well as a full link. */
export function parseHandle(input: string): string | null {
  const trimmed = input.trim();
  if (HANDLE_PATTERN.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return parseClashLinks(trimmed)[0] ?? null;
}

async function importGame(interaction: Interaction, config: Config) {
  const handle = parseHandle(interaction.options.getString("game", true));
  if (!handle) {
    await interaction.reply({
      content: config.t("import.invalid"),
      ...ephemeral,
    });
    return;
  }
  await interaction.deferReply();

  let report;
  try {
    report = await fetchClashReport(handle);
  } catch (err) {
    if (!(err instanceof ClashNotFoundError)) {
      logger.warn({ err }, `CodinGame unreachable | handle = ${handle}`);
    }
    await interaction.editReply(
      config.t(
        err instanceof ClashNotFoundError
          ? "import.notFound"
          : "import.unreachable"
      )
    );
    return;
  }
  if (!report.finished || !report.started) {
    await interaction.editReply(config.t("import.notFinished"));
    return;
  }

  const imported = await store.importReport(interaction.guildId, report, {
    channelId: interaction.channelId,
    messageId: null,
  });
  if (!imported) {
    await interaction.editReply(config.t("import.already"));
    return;
  }
  logger.info(
    `Clash imported by hand | guildId = ${interaction.guildId} | handle = ${handle} | by = ${interaction.user.id}`
  );
  const image = await resultImage(
    {
      client: interaction.client,
      guildId: interaction.guildId,
      t: config.t,
      locale: config.locale,
    },
    report
  );
  await interaction.editReply({
    content: config.t("import.done", {
      mode: modeLabel(config.t, report.mode),
      count: report.players.length,
    }),
    files: [new AttachmentBuilder(image, { name: "clash.png" })],
  });
}

async function unlink(interaction: Interaction, config: Config) {
  const member = interaction.options.getUser("member", true);
  const nickname = await store.unlink(interaction.guildId, member.id);
  if (nickname) {
    logger.info(
      `Account unlinked by an admin | guildId = ${interaction.guildId} | userId = ${member.id} | by = ${interaction.user.id}`
    );
  }
  await interaction.reply({
    content: nickname
      ? config.t("adminUnlink.done", {
          user: `<@${member.id}>`,
          player: escapeMarkdown(nickname),
        })
      : config.t("adminUnlink.none", { user: `<@${member.id}>` }),
    allowedMentions: NO_MENTIONS,
    ...ephemeral,
  });
}

const subcommands: Record<
  string,
  (interaction: Interaction, config: Config) => Promise<void>
> = { import: importGame, unlink };

export default declareCommand<ClashOfCodeConfigSchema>({
  requiresAdmin: true,

  data: new SlashCommandBuilder()
    .setName("coc-admin")
    .setDescription("Clash of Code admin commands")
    .setDescriptionLocalizations({ fr: "Administration Clash of Code" })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([InteractionContextType.Guild])
    .addSubcommand((sub) =>
      sub
        .setName("import")
        .setDescription("Import a finished game")
        .setDescriptionLocalizations({ fr: "Importer une partie terminée" })
        .addStringOption((option) =>
          option
            .setName("game")
            .setDescription("Link or id of the game")
            .setDescriptionLocalizations({
              fr: "Lien ou identifiant de la partie",
            })
            .setMaxLength(200)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("unlink")
        .setDescription("Unlink a member's CodinGame account")
        .setDescriptionLocalizations({
          fr: "Délier le compte CodinGame d'un membre",
        })
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Member to unlink")
            .setDescriptionLocalizations({ fr: "Membre à délier" })
            .setRequired(true)
        )
    ),

  async execute(interaction, config) {
    if (interaction.inGuild()) {
      await subcommands[interaction.options.getSubcommand()]?.(
        interaction,
        config
      );
    }
  },
});
