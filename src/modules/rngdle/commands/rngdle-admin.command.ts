import {
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { requireAdmin } from "#core/utils/require-admin.js";
import { declareCommand } from "#lib/command.js";
import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import type { RngdleConfigSchema } from "#modules/rngdle/rngdle.config.js";
import {
  fetchUserRolls,
  RngdleUserNotFoundError,
} from "#modules/rngdle/services/rngdle-api.js";
import rngdleService from "#modules/rngdle/services/rngdle.service.js";
import syncService, {
  FullSyncCooldownError,
} from "#modules/rngdle/services/sync.service.js";
import { Colors } from "#utils/colors.js";
import { replyWithError } from "./replies.js";

const PERMISSION_ADMINISTRATOR = 0x8;
const USERNAME_MAX_LENGTH = 64;

const logger = loggerMaker("rngdle");

type Config = ConfigProvider<RngdleConfigSchema>;
type GuildCommand = ChatInputCommandInteraction<"cached" | "raw">;

async function register(interaction: GuildCommand, config: Config) {
  const member = interaction.options.getUser("member", true);
  const username = interaction.options.getString("username", true).trim();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let rolls;
  try {
    rolls = await fetchUserRolls(username, null);
  } catch (err) {
    if (err instanceof RngdleUserNotFoundError) {
      await interaction.editReply(
        config.t("admin.register.notFound", { username })
      );
      return;
    }
    logger.warn({ err }, `Could not reach rngdle.com | username = ${username}`);
    await interaction.editReply(config.t("admin.register.unreachable"));
    return;
  }

  const outcome = await syncService.runExclusive(
    interaction.guildId,
    async () => {
      const holder = await rngdleService.findAccountByUsername(
        interaction.guildId,
        username
      );
      if (holder && holder.userId !== member.id) {
        return { conflict: holder.userId } as const;
      }
      const result = await rngdleService.register(
        interaction.guildId,
        member.id,
        username
      );
      const saved = await rngdleService.saveRolls(
        { guildId: interaction.guildId, userId: member.id, username },
        rolls
      );
      return { result, saved } as const;
    }
  );

  if ("conflict" in outcome) {
    await interaction.editReply({
      content: config.t("admin.register.conflict", {
        username,
        user: `<@${outcome.conflict}>`,
      }),
      allowedMentions: { parse: [] },
    });
    return;
  }

  const { result, saved } = outcome;
  logger.info(
    `Account ${result} | guildId = ${interaction.guildId} | userId = ${member.id} | username = ${username} | rolls = ${saved.inserted} | by = ${interaction.user.id}`
  );
  await interaction.editReply({
    content: config.t(`admin.register.${result}`, {
      user: `<@${member.id}>`,
      username,
      count: saved.inserted,
    }),
    allowedMentions: { parse: [] },
  });
}

async function unregister(interaction: GuildCommand, config: Config) {
  const member = interaction.options.getUser("member", true);
  const deleted = await syncService.runExclusive(interaction.guildId, () =>
    rngdleService.unregister(interaction.guildId, member.id)
  );
  if (deleted) {
    logger.info(
      `Account deleted | guildId = ${interaction.guildId} | userId = ${member.id} | by = ${interaction.user.id}`
    );
  }
  await interaction.reply({
    content: config.t(deleted ? "admin.delete.done" : "admin.delete.none", {
      user: `<@${member.id}>`,
    }),
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

async function show(interaction: GuildCommand, config: Config) {
  const accounts = await rngdleService.listAccounts(interaction.guildId);
  if (accounts.length === 0) {
    await interaction.reply({
      content: config.t("admin.show.empty"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(config.t("admin.show.title", { count: accounts.length }))
        .setDescription(
          accounts
            .map((account) => `<@${account.userId}> → \`${account.username}\``)
            .join("\n")
            .slice(0, 4096)
        )
        .setColor(Colors.SkyBlue),
    ],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

async function refresh(interaction: GuildCommand, config: Config) {
  const full = interaction.options.getBoolean("full") ?? false;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let report;
  try {
    report = await syncService.syncGuild(interaction.guildId, { full });
  } catch (err) {
    if (err instanceof FullSyncCooldownError) {
      await interaction.editReply(
        config.t("admin.refresh.cooldown", {
          time: `<t:${Math.ceil(err.retryAt.getTime() / 1000)}:R>`,
        })
      );
      return;
    }
    throw err;
  }
  await interaction.editReply(
    report.accounts === 0
      ? config.t("admin.show.empty")
      : config.t("admin.refresh.done", { ...report })
  );
}

async function clear(interaction: GuildCommand, config: Config) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const count = await syncService.runExclusive(interaction.guildId, () =>
    rngdleService.clearRolls(interaction.guildId)
  );
  logger.info(
    `Rolls cleared | guildId = ${interaction.guildId} | count = ${count} | by = ${interaction.user.id}`
  );
  await interaction.editReply(config.t("admin.clear.done", { count }));
}

export default declareCommand<RngdleConfigSchema>({
  data: new SlashCommandBuilder()
    .setName("rngdle-admin")
    .setDescription("RNGdle admin commands")
    .setDescriptionLocalizations({ fr: "Administration RNGdle" })
    .setDefaultMemberPermissions(PERMISSION_ADMINISTRATOR)
    .setContexts([InteractionContextType.Guild])
    .addSubcommand((sub) =>
      sub
        .setName("register")
        .setDescription("Link a member to their RNGdle account")
        .setDescriptionLocalizations({
          fr: "Lier un membre à son compte RNGdle",
        })
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Member to link")
            .setDescriptionLocalizations({ fr: "Membre à lier" })
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("username")
            .setDescription("RNGdle username")
            .setDescriptionLocalizations({ fr: "Pseudo RNGdle" })
            .setMaxLength(USERNAME_MAX_LENGTH)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Unlink a member and delete their rolls")
        .setDescriptionLocalizations({
          fr: "Délier un membre et supprimer ses tirages",
        })
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Member to unlink")
            .setDescriptionLocalizations({ fr: "Membre à délier" })
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("show")
        .setDescription("List the linked accounts")
        .setDescriptionLocalizations({ fr: "Lister les comptes liés" })
    )
    .addSubcommand((sub) =>
      sub
        .setName("refresh")
        .setDescription("Download the latest rolls now")
        .setDescriptionLocalizations({
          fr: "Télécharger les derniers tirages maintenant",
        })
        .addBooleanOption((option) =>
          option
            .setName("full")
            .setDescription("Download every roll again, not only new ones")
            .setDescriptionLocalizations({
              fr: "Retélécharger tous les tirages, pas seulement les nouveaux",
            })
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("clear")
        .setDescription("Delete this server's stored rolls")
        .setDescriptionLocalizations({
          fr: "Supprimer les tirages enregistrés sur ce serveur",
        })
    ),

  async execute(interaction, config) {
    if (!interaction.inGuild()) {
      return;
    }
    if (!(await requireAdmin(interaction, config.t))) {
      return;
    }

    try {
      switch (interaction.options.getSubcommand()) {
        case "register":
          await register(interaction, config);
          break;
        case "delete":
          await unregister(interaction, config);
          break;
        case "show":
          await show(interaction, config);
          break;
        case "refresh":
          await refresh(interaction, config);
          break;
        case "clear":
          await clear(interaction, config);
          break;
      }
    } catch (err) {
      logger.error(
        { err },
        `RNGdle admin command failed | guildId = ${interaction.guildId}`
      );
      await replyWithError(interaction, config.t("error.generic"));
    }
  },
});
