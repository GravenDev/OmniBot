import {
  AttachmentBuilder,
  escapeMarkdown,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandStringOption,
} from "discord.js";
import { declareCommand } from "#lib/command.js";
import type { ConfigProvider } from "#lib/config.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import type { ServerStatsConfigSchema } from "#modules/server-stats/server-stats.config.js";
import { dayOf, RETENTION_DAYS } from "#modules/server-stats/services/day.js";
import {
  countedPart,
  dayChoices,
  isoDay,
  parseDay,
  PERIOD_DAYS,
  selectDay,
  selectPeriod,
  selectToday,
  type SelectionError,
  type SelectionResult,
} from "#modules/server-stats/services/period.js";
import store from "#modules/server-stats/services/store.js";
import { statsReport } from "#modules/server-stats/services/views.js";

const AUTOCOMPLETE_LIMIT = 25;
const DATE_MAX_LENGTH = 32;

type Interaction = ChatInputCommandInteraction<"cached" | "raw">;
type Config = ConfigProvider<ServerStatsConfigSchema>;

// Ephemeral, like the other admin commands: the report channel already gets
// the public report every night.
const ephemeral = { flags: MessageFlags.Ephemeral } as const;

function longDate(day: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(day);
}

function selection(interaction: Interaction, now: Date): SelectionResult {
  const { options } = interaction;
  switch (options.getSubcommand()) {
    case "day":
      return selectDay(options.getString("date", true), now);
    case "period":
      return selectPeriod(
        {
          days: options.getInteger("days"),
          from: options.getString("from"),
          to: options.getString("to"),
        },
        now
      );
    default:
      return selectToday(now);
  }
}

function errorMessage(error: SelectionError, config: Config): string {
  switch (error.error) {
    case "invalidDate":
      return config.t("command.invalidDate", {
        value: escapeMarkdown(error.value),
      });
    case "tooOld":
      return config.t("command.tooOld", {
        count: RETENTION_DAYS,
        date: longDate(error.oldest, config.locale),
      });
    default:
      return config.t(`command.${error.error}`);
  }
}

function dateOption(name: string, description: string, fr: string) {
  return (option: SlashCommandStringOption) =>
    option
      .setName(name)
      .setDescription(description)
      .setDescriptionLocalizations({ fr })
      .setMaxLength(DATE_MAX_LENGTH)
      .setAutocomplete(true);
}

export default declareCommand<ServerStatsConfigSchema>({
  requiresAdmin: true,

  data: new SlashCommandBuilder()
    .setName("server-stats")
    .setDescription("Show the server's activity statistics")
    .setDescriptionLocalizations({
      fr: "Afficher les statistiques d'activité du serveur",
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([InteractionContextType.Guild])
    .addSubcommand((sub) =>
      sub
        .setName("today")
        .setDescription("Today's statistics, so far")
        .setDescriptionLocalizations({
          fr: "Les statistiques du jour, jusqu'à maintenant",
        })
    )
    .addSubcommand((sub) =>
      sub
        .setName("day")
        .setDescription("The statistics of a day of the last 30")
        .setDescriptionLocalizations({
          fr: "Les statistiques d'un jour parmi les 30 derniers",
        })
        .addStringOption((option) =>
          dateOption(
            "date",
            "The day, picked in the list or typed as 2026-10-29 or 29/10",
            "Le jour, choisi dans la liste ou écrit 2026-10-29 ou 29/10"
          )(option).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("period")
        .setDescription("The statistics of several days added up")
        .setDescriptionLocalizations({
          fr: "Les statistiques de plusieurs jours cumulées",
        })
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("The last whole days (7 by default)")
            .setDescriptionLocalizations({
              fr: "Les derniers jours complets (7 par défaut)",
            })
            .addChoices(
              ...PERIOD_DAYS.map((days) => ({
                name: `Last ${days} days`,
                name_localizations: { fr: `${days} derniers jours` },
                value: days,
              }))
            )
        )
        .addStringOption(
          dateOption(
            "from",
            "First day (the oldest kept by default)",
            "Premier jour (le plus ancien conservé par défaut)"
          )
        )
        .addStringOption(
          dateOption(
            "to",
            "Last day (today by default)",
            "Dernier jour (aujourd'hui par défaut)"
          )
        )
    ),

  async execute(interaction, config) {
    if (!interaction.inGuild()) {
      return;
    }
    const now = new Date();
    const selected = selection(interaction, now);
    if ("error" in selected) {
      await interaction.reply({
        content: errorMessage(selected, config),
        allowedMentions: NO_MENTIONS,
        ...ephemeral,
      });
      return;
    }

    await interaction.deferReply(ephemeral);
    const startedAt = await store.startedAt(interaction.guildId);
    const counted = startedAt && countedPart(selected.selection, startedAt);
    if (!counted) {
      await interaction.editReply({
        content: startedAt
          ? config.t("command.beforeStart", {
              date: longDate(dayOf(startedAt), config.locale),
            })
          : config.t("command.notStarted"),
      });
      return;
    }

    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(interaction.guildId));
    const report = await statsReport(guild, counted, {
      now,
      showTopMembers: config.get("showTopMembers"),
      t: config.t,
      locale: config.locale,
    });
    await interaction.editReply(
      report
        ? {
            content: report.content,
            files: [
              new AttachmentBuilder(report.image, { name: "server-stats.png" }),
            ],
            allowedMentions: NO_MENTIONS,
          }
        : { content: config.t("command.notStarted") }
    );
  },

  async complete(interaction, config) {
    const now = new Date();
    const focused = interaction.options.getFocused().trim().toLowerCase();
    // A typed "29/10" matches its day too, not only the names containing it.
    const typed = parseDay(focused, now);
    const format = new Intl.DateTimeFormat(config.locale, {
      dateStyle: "full",
      timeZone: "UTC",
    });
    const choices = dayChoices(now, (day, offset) => {
      const date = format.format(day);
      return offset < 2
        ? config.t(offset === 0 ? "command.today" : "command.yesterday", {
            date,
          })
        : date;
    });
    await interaction.respond(
      choices
        .filter(
          (choice) =>
            choice.name.toLowerCase().includes(focused) ||
            choice.value.includes(focused) ||
            (typed !== null && choice.value === isoDay(typed))
        )
        .slice(0, AUTOCOMPLETE_LIMIT)
    );
  },
});
