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
} from "#modules/rngdle/services/api.js";
import store from "#modules/rngdle/services/store.js";
import sync, { FullSyncCooldownError } from "#modules/rngdle/services/sync.js";
import { Colors } from "#utils/colors.js";

const PERMISSION_ADMINISTRATOR = 0x8;
const USERNAME_MAX_LENGTH = 64;

const logger = loggerMaker("rngdle");

type Interaction = ChatInputCommandInteraction<"cached" | "raw">;
type Config = ConfigProvider<RngdleConfigSchema>;

const ephemeral = { flags: MessageFlags.Ephemeral } as const;
const noPings = { allowedMentions: { parse: [] } } as const;

async function register(interaction: Interaction, config: Config) {
  const { guildId } = interaction;
  const member = interaction.options.getUser("member", true);
  const username = interaction.options.getString("username", true).trim();
  await interaction.deferReply(ephemeral);

  const rolls = await fetchUserRolls(username, null).catch((err: unknown) => {
    if (!(err instanceof RngdleUserNotFoundError)) {
      logger.warn({ err }, `rngdle.com unreachable | username = ${username}`);
    }
    return err instanceof RngdleUserNotFoundError ? "notFound" : "unreachable";
  });
  if (typeof rolls === "string") {
    await interaction.editReply(
      config.t(`admin.register.${rolls}`, { username })
    );
    return;
  }

  const outcome = await sync.exclusive(guildId, async () => {
    const holder = await store.accountByUsername(guildId, username);
    if (holder && holder.userId !== member.id) {
      return { conflict: holder.userId };
    }
    const result = await store.register(guildId, member.id, username);
    const { inserted } = await store.saveRolls(
      { guildId, userId: member.id, username },
      rolls
    );
    return { result, inserted };
  });

  if ("conflict" in outcome) {
    await interaction.editReply({
      content: config.t("admin.register.conflict", {
        username,
        user: `<@${outcome.conflict}>`,
      }),
      ...noPings,
    });
    return;
  }

  logger.info(
    `Account ${outcome.result} | guildId = ${guildId} | userId = ${member.id} | username = ${username} | by = ${interaction.user.id}`
  );
  await interaction.editReply({
    content: config.t(`admin.register.${outcome.result}`, {
      user: `<@${member.id}>`,
      username,
      count: outcome.inserted,
    }),
    ...noPings,
  });
}

async function unregister(interaction: Interaction, config: Config) {
  const member = interaction.options.getUser("member", true);
  await interaction.deferReply(ephemeral);
  const deleted = await sync.exclusive(interaction.guildId, () =>
    store.unregister(interaction.guildId, member.id)
  );
  await interaction.editReply({
    content: config.t(deleted ? "admin.delete.done" : "admin.delete.none", {
      user: `<@${member.id}>`,
    }),
    ...noPings,
  });
}

async function show(interaction: Interaction, config: Config) {
  const accounts = await store.accounts(interaction.guildId);
  await interaction.reply(
    accounts.length === 0
      ? { content: config.t("admin.show.empty"), ...ephemeral }
      : {
          embeds: [
            new EmbedBuilder()
              .setTitle(
                config.t("admin.show.title", { count: accounts.length })
              )
              .setDescription(
                accounts
                  .map((a) => `<@${a.userId}> → \`${a.username}\``)
                  .join("\n")
                  .slice(0, 4096)
              )
              .setColor(Colors.SkyBlue),
          ],
          ...ephemeral,
          ...noPings,
        }
  );
}

async function refresh(interaction: Interaction, config: Config) {
  await interaction.deferReply(ephemeral);
  const full = interaction.options.getBoolean("full") ?? false;
  try {
    const report = await sync.syncGuild(interaction.guildId, full);
    await interaction.editReply(
      report.accounts === 0
        ? config.t("admin.show.empty")
        : config.t("admin.refresh.done", { ...report })
    );
  } catch (err) {
    if (!(err instanceof FullSyncCooldownError)) {
      throw err;
    }
    await interaction.editReply(
      config.t("admin.refresh.cooldown", {
        time: `<t:${Math.ceil(err.retryAt.getTime() / 1000)}:R>`,
      })
    );
  }
}

async function clear(interaction: Interaction, config: Config) {
  await interaction.deferReply(ephemeral);
  const count = await sync.exclusive(interaction.guildId, () =>
    store.clearRolls(interaction.guildId)
  );
  logger.info(
    `Rolls cleared | guildId = ${interaction.guildId} | count = ${count} | by = ${interaction.user.id}`
  );
  await interaction.editReply(config.t("admin.clear.done", { count }));
}

const subcommands: Record<
  string,
  (interaction: Interaction, config: Config) => Promise<void>
> = { register, delete: unregister, show, refresh, clear };

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
    if (interaction.inGuild() && (await requireAdmin(interaction, config.t))) {
      await subcommands[interaction.options.getSubcommand()]?.(
        interaction,
        config
      );
    }
  },
});
