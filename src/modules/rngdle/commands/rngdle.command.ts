import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import mentionService from "#core/services/mention.service.js";
import { declareCommand } from "#lib/command.js";
import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import {
  historyMessage,
  navigationRow,
  profileMessage,
  timelineMessage,
  trendMessage,
} from "#modules/rngdle/interactions/navigation.button.js";
import { overallPageMessage } from "#modules/rngdle/interactions/overall-page.button.js";
import { unlinkConfirmMessage } from "#modules/rngdle/interactions/unlink-confirm.button.js";
import type { RngdleConfigSchema } from "#modules/rngdle/rngdle.config.js";
import { linkOwnAccount } from "#modules/rngdle/services/linking.js";
import { reminderTimestamp } from "#modules/rngdle/services/reminders.js";
import store from "#modules/rngdle/services/store.js";
import sync from "#modules/rngdle/services/sync.js";
import {
  dailyLeaderboard,
  HISTORY_MAX,
  HISTORY_MIN,
  parsePeriod,
  serverCard,
  TREND_DAYS,
  TREND_DEFAULT_DAYS,
  versusCard,
  type ViewContext,
} from "#modules/rngdle/services/views.js";

const AUTOCOMPLETE_LIMIT = 25;
const USERNAME_MAX_LENGTH = 64;

const logger = loggerMaker("rngdle");

type Interaction = ChatInputCommandInteraction<"cached" | "raw">;
type Config = ConfigProvider<RngdleConfigSchema>;

function viewContext(interaction: Interaction, config: Config): ViewContext {
  return {
    client: interaction.client,
    guildId: interaction.guildId,
    t: config.t,
    locale: config.locale,
  };
}

const ephemeral = { flags: MessageFlags.Ephemeral } as const;
const noPings = { allowedMentions: NO_MENTIONS } as const;

async function replyWithImage(
  interaction: Interaction,
  image: Buffer | null,
  name: string,
  emptyMessage: string,
  components: ActionRowBuilder<ButtonBuilder>[] = []
) {
  await interaction.editReply(
    image
      ? { files: [new AttachmentBuilder(image, { name })], components }
      : { content: emptyMessage }
  );
}

async function leaderboard(interaction: Interaction, config: Config) {
  const board = await dailyLeaderboard(viewContext(interaction, config), 0);
  await replyWithImage(
    interaction,
    board?.image ?? null,
    "leaderboard.png",
    config.t("leaderboard.empty"),
    [navigationRow(config.t, ["profile", "history", "overall"])]
  );
}

async function lookedUpAccount(interaction: Interaction) {
  const username = interaction.options.getString("username");
  const member = interaction.options.getUser("member");
  const account = username
    ? await store.accountByUsername(interaction.guildId, username)
    : await store.account(interaction.guildId, (member ?? interaction.user).id);
  const self = !username && (!member || member.id === interaction.user.id);
  return { account, self };
}

async function profile(interaction: Interaction, config: Config) {
  const { account, self } = await lookedUpAccount(interaction);
  await interaction.editReply(
    await profileMessage(viewContext(interaction, config), account, self)
  );
}

async function history(interaction: Interaction, config: Config) {
  const { account, self } = await lookedUpAccount(interaction);
  await interaction.editReply(
    await historyMessage(
      viewContext(interaction, config),
      account,
      self,
      interaction.options.getInteger("count") ?? undefined
    )
  );
}

async function timeline(interaction: Interaction, config: Config) {
  const { account, self } = await lookedUpAccount(interaction);
  await interaction.editReply(
    await timelineMessage(viewContext(interaction, config), account, self)
  );
}

async function trend(interaction: Interaction, config: Config) {
  const { account, self } = await lookedUpAccount(interaction);
  await interaction.editReply(
    await trendMessage(
      viewContext(interaction, config),
      account,
      self,
      interaction.options.getInteger("days") ?? undefined
    )
  );
}

async function serverStats(interaction: Interaction, config: Config) {
  const guild =
    interaction.guild ??
    (await interaction.client.guilds.fetch(interaction.guildId));
  await replyWithImage(
    interaction,
    await serverCard(viewContext(interaction, config), guild),
    "server-stats.png",
    config.t("server.empty"),
    [navigationRow(config.t, ["profile", "history", "overall"])]
  );
}

async function leaderboardAll(interaction: Interaction, config: Config) {
  await interaction.editReply(
    await overallPageMessage(
      viewContext(interaction, config),
      interaction.options.getInteger("page") ?? 1,
      interaction.user.id,
      "public",
      parsePeriod(interaction.options.getString("period"))
    )
  );
}

async function link(interaction: Interaction, config: Config) {
  const { guildId } = interaction;
  const userId = interaction.user.id;
  const username = interaction.options.getString("username", true).trim();
  if (!username) {
    await interaction.reply({
      content: config.t("link.notFound", { username }),
      ...ephemeral,
    });
    return;
  }
  await interaction.deferReply(ephemeral);

  const outcome = await linkOwnAccount(guildId, userId, username);
  switch (outcome.kind) {
    case "notFound":
    case "unreachable":
      await interaction.editReply(
        config.t(`link.${outcome.kind}`, { username })
      );
      return;
    case "alreadyLinked":
      await interaction.editReply(
        config.t("link.alreadyLinked", { username: outcome.username })
      );
      return;
    case "conflict":
      await interaction.editReply({
        content: config.t("link.conflict", {
          username,
          user: `<@${outcome.userId}>`,
        }),
        ...noPings,
      });
      return;
    default:
      logger.info(
        `Account ${outcome.kind} | guildId = ${guildId} | userId = ${userId} | username = ${username} | by = ${userId}`
      );
      await interaction.editReply(
        config.t(
          outcome.kind === "unchanged" ? "link.unchanged" : "link.created",
          { username, count: outcome.count }
        )
      );
  }
}

async function unlink(interaction: Interaction, config: Config) {
  const account = await store.account(interaction.guildId, interaction.user.id);
  await interaction.reply(
    account
      ? {
          ...unlinkConfirmMessage(
            config.t,
            interaction.user.id,
            account.username
          ),
          ...ephemeral,
        }
      : { content: config.t("unlink.none"), ...ephemeral }
  );
}

async function remind(interaction: Interaction, config: Config) {
  const { guildId, user } = interaction;
  const enabled = interaction.options.getBoolean("enabled", true);
  const reply = (content: string) =>
    interaction.reply({ content, flags: MessageFlags.Ephemeral });

  if (!enabled) {
    await store.setReminder(guildId, user.id, false);
    await reply(config.t("remind.disabled"));
    return;
  }
  if (!(await store.account(guildId, user.id))) {
    await reply(config.t("remind.notRegistered"));
    return;
  }

  await store.setReminder(guildId, user.id, true);
  const channel = config.get("leaderboardChannel");
  const lines = [
    channel
      ? config.t("remind.enabled", {
          time: reminderTimestamp(new Date()),
          channel: `<#${channel.id}>`,
        })
      : config.t("remind.enabledNoChannel"),
  ];
  if ((await mentionService.mentionable(guildId, [user.id])).length === 0) {
    lines.push(config.t("remind.pingsDisabled"));
  }
  await reply(lines.join("\n"));
}

const personal: Record<
  string,
  (interaction: Interaction, config: Config) => Promise<void>
> = { link, unlink, remind };

async function versus(interaction: Interaction, config: Config) {
  const first = interaction.options.getUser("player1", true);
  const second = interaction.options.getUser("player2") ?? interaction.user;
  const refuse = (content: string) =>
    interaction.reply({ content, ...ephemeral, ...noPings });
  if (first.id === second.id) {
    await refuse(config.t("versus.samePlayer"));
    return;
  }

  const [left, right] = await Promise.all([
    store.account(interaction.guildId, first.id),
    store.account(interaction.guildId, second.id),
  ]);
  if (!left || !right) {
    const unlinked = left ? [second] : right ? [first] : [first, second];
    await refuse(
      unlinked.some((user) => user.id === interaction.user.id)
        ? config.t("versus.notRegisteredSelf")
        : config.t("versus.notRegistered", { user: `<@${unlinked[0]!.id}>` })
    );
    return;
  }

  await interaction.deferReply();
  await sync.refreshIfStale(interaction.guildId);
  await replyWithImage(
    interaction,
    await versusCard(viewContext(interaction, config), left, right),
    "versus.png",
    config.t("versus.noRolls")
  );
}

const subcommands: Record<
  string,
  (interaction: Interaction, config: Config) => Promise<void>
> = {
  leaderboard,
  profile,
  history,
  timeline,
  trend,
  "server-stats": serverStats,
  "leaderboard-all": leaderboardAll,
};

// The member and username options of the commands that look up a player.
function withPlayerOptions(sub: SlashCommandSubcommandBuilder) {
  return sub
    .addUserOption((option) =>
      option
        .setName("member")
        .setDescription("Member to look up (defaults to you)")
        .setDescriptionLocalizations({
          fr: "Membre à consulter (vous par défaut)",
        })
    )
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("RNGdle username to look up")
        .setDescriptionLocalizations({ fr: "Pseudo RNGdle à consulter" })
        .setAutocomplete(true)
    );
}

export default declareCommand<RngdleConfigSchema>({
  data: new SlashCommandBuilder()
    .setName("rngdle")
    .setDescription("RNGdle leaderboards and statistics")
    .setDescriptionLocalizations({ fr: "Classements et statistiques RNGdle" })
    .setContexts([InteractionContextType.Guild])
    .addSubcommand((sub) =>
      sub
        .setName("leaderboard")
        .setDescription("Show today's leaderboard")
        .setDescriptionLocalizations({ fr: "Afficher le classement du jour" })
    )
    .addSubcommand((sub) =>
      withPlayerOptions(
        sub
          .setName("profile")
          .setDescription("Show a player's profile")
          .setDescriptionLocalizations({ fr: "Afficher le profil d'un joueur" })
      )
    )
    .addSubcommand((sub) =>
      withPlayerOptions(
        sub
          .setName("history")
          .setDescription("Show a player's latest rolls")
          .setDescriptionLocalizations({
            fr: "Afficher les derniers tirages d'un joueur",
          })
      ).addIntegerOption((option) =>
        option
          .setName("count")
          .setDescription("Number of rolls to show (defaults to 10)")
          .setDescriptionLocalizations({
            fr: "Nombre de tirages affichés (10 par défaut)",
          })
          .setMinValue(HISTORY_MIN)
          .setMaxValue(HISTORY_MAX)
      )
    )
    .addSubcommand((sub) =>
      withPlayerOptions(
        sub
          .setName("timeline")
          .setDescription("Show a player's mythic, anomaly and trash rolls")
          .setDescriptionLocalizations({
            fr: "Afficher les tirages mythiques, anomalies et trash d'un joueur",
          })
      )
    )
    .addSubcommand((sub) =>
      withPlayerOptions(
        sub
          .setName("trend")
          .setDescription("Show a player's recent form")
          .setDescriptionLocalizations({
            fr: "Afficher la forme récente d'un joueur",
          })
      ).addIntegerOption((option) =>
        option
          .setName("days")
          .setDescription(
            `Number of days covered (defaults to ${TREND_DEFAULT_DAYS})`
          )
          .setDescriptionLocalizations({
            fr: `Nombre de jours couverts (${TREND_DEFAULT_DAYS} par défaut)`,
          })
          .addChoices(
            ...TREND_DAYS.map((days) => ({
              name: `${days} days`,
              name_localizations: { fr: `${days} jours` },
              value: days,
            }))
          )
      )
    )
    .addSubcommand((sub) =>
      sub
        .setName("server-stats")
        .setDescription("Show the server's statistics")
        .setDescriptionLocalizations({
          fr: "Afficher les statistiques du serveur",
        })
    )
    .addSubcommand((sub) =>
      sub
        .setName("link")
        .setDescription("Link your RNGdle account")
        .setDescriptionLocalizations({ fr: "Lier votre compte RNGdle" })
        .addStringOption((option) =>
          option
            .setName("username")
            .setDescription("Your RNGdle username")
            .setDescriptionLocalizations({ fr: "Votre pseudo RNGdle" })
            .setMaxLength(USERNAME_MAX_LENGTH)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("unlink")
        .setDescription("Unlink your RNGdle account and delete your rolls")
        .setDescriptionLocalizations({
          fr: "Délier votre compte RNGdle et supprimer vos tirages",
        })
    )
    .addSubcommand((sub) =>
      sub
        .setName("leaderboard-all")
        .setDescription("Show the overall leaderboard")
        .setDescriptionLocalizations({ fr: "Afficher le classement général" })
        .addStringOption((option) =>
          option
            .setName("period")
            .setDescription("Period to rank (defaults to all time)")
            .setDescriptionLocalizations({
              fr: "Période classée (depuis toujours par défaut)",
            })
            .addChoices(
              {
                name: "All time",
                name_localizations: { fr: "Depuis toujours" },
                value: "all",
              },
              {
                name: "This month",
                name_localizations: { fr: "Ce mois-ci" },
                value: "month",
              },
              {
                name: "This week",
                name_localizations: { fr: "Cette semaine" },
                value: "week",
              }
            )
        )
        .addIntegerOption((option) =>
          option
            .setName("page")
            .setDescription("Page number")
            .setDescriptionLocalizations({ fr: "Numéro de page" })
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("versus")
        .setDescription("Compare two players")
        .setDescriptionLocalizations({ fr: "Comparer deux joueurs" })
        .addUserOption((option) =>
          option
            .setName("player1")
            .setDescription("First player")
            .setDescriptionLocalizations({ fr: "Premier joueur" })
            .setRequired(true)
        )
        .addUserOption((option) =>
          option
            .setName("player2")
            .setDescription("Second player (defaults to you)")
            .setDescriptionLocalizations({
              fr: "Second joueur (vous par défaut)",
            })
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remind")
        .setDescription("Get pinged in the evening if you haven't rolled yet")
        .setDescriptionLocalizations({
          fr: "Être mentionné le soir si vous n'avez pas encore tiré",
        })
        .addBooleanOption((option) =>
          option
            .setName("enabled")
            .setDescription("Turn the daily reminder on or off")
            .setDescriptionLocalizations({
              fr: "Activer ou désactiver le rappel quotidien",
            })
            .setRequired(true)
        )
    ),

  async execute(interaction, config) {
    if (!interaction.inGuild()) {
      return;
    }
    const personalCommand = personal[interaction.options.getSubcommand()];
    if (personalCommand) {
      await personalCommand(interaction, config);
      return;
    }
    if (
      interaction.options.getUser("member") &&
      interaction.options.getString("username")
    ) {
      await interaction.reply({
        content: config.t("profile.bothOptions"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (interaction.options.getSubcommand() === "versus") {
      await versus(interaction, config);
      return;
    }

    await interaction.deferReply();
    await sync.refreshIfStale(interaction.guildId);
    await subcommands[interaction.options.getSubcommand()]?.(
      interaction,
      config
    );
  },

  async complete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const accounts = interaction.guildId
      ? await store.accounts(interaction.guildId)
      : [];
    await interaction.respond(
      accounts
        .filter((account) => account.username.toLowerCase().includes(typed))
        .slice(0, AUTOCOMPLETE_LIMIT)
        .map((account) => ({ name: account.username, value: account.username }))
    );
  },
});
