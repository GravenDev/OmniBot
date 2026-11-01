import {
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  formatDayOfYear,
  isValidDayOfYear,
  localTime,
  upcoming,
} from "#lib/calendar.js";
import { declareCommand } from "#lib/command.js";
import type { ConfigProvider } from "#lib/config.js";
import { describeLines } from "#lib/format.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import type { BirthdayConfigSchema } from "#modules/birthday/birthday.config.js";
import {
  formatPercent,
  MESSAGE_LIMIT,
} from "#modules/birthday/services/announcements.js";
import birthdayService, {
  type BirthdayEntry,
} from "#modules/birthday/services/birthday.service.js";
import { checkMilestones } from "#modules/birthday/services/milestones.js";
import {
  collisionProbability,
  expectedFirstCollision,
  HALF_GROUP_SIZE,
  sharedDates,
} from "#modules/birthday/services/paradox.js";
import { dropBirthdayRole } from "#modules/birthday/services/role.js";

const UPCOMING_DAYS = 30;

const logger = loggerMaker("birthday");

type Config = ConfigProvider<BirthdayConfigSchema>;
type GuildInteraction = ChatInputCommandInteraction<"cached" | "raw">;

const MONTHS = [
  ["January", "janvier"],
  ["February", "février"],
  ["March", "mars"],
  ["April", "avril"],
  ["May", "mai"],
  ["June", "juin"],
  ["July", "juillet"],
  ["August", "août"],
  ["September", "septembre"],
  ["October", "octobre"],
  ["November", "novembre"],
  ["December", "décembre"],
] as const;

async function replyPrivately(interaction: GuildInteraction, content: string) {
  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
    allowedMentions: NO_MENTIONS,
  });
}

async function setBirthday(interaction: GuildInteraction, config: Config) {
  const entry: BirthdayEntry = {
    userId: interaction.user.id,
    day: interaction.options.getInteger("day", true),
    month: interaction.options.getInteger("month", true),
    announce: interaction.options.getBoolean("announce") ?? true,
  };
  if (!isValidDayOfYear(entry)) {
    await replyPrivately(interaction, config.t("set.invalid"));
    return;
  }

  await birthdayService.set(interaction.guildId, entry);
  logger.info(
    `Birthday set | guildId = ${interaction.guildId} | userId = ${entry.userId}`
  );
  if (!entry.announce) {
    await dropBirthdayRole(config, interaction.guildId, entry.userId);
  }

  const channel = config.get("channel");
  const visibility = entry.announce
    ? channel
      ? config.t("set.announced", { channel: `<#${channel.id}>` })
      : config.t("set.announcedLater")
    : config.t("set.private");
  await replyPrivately(
    interaction,
    [
      config.t("set.done", { date: formatDayOfYear(entry, config.locale) }),
      visibility,
      config.t("set.data"),
    ].join("\n")
  );

  await checkMilestones(interaction.guildId, config).catch((err: unknown) =>
    logger.error(
      { err },
      `Failed to check the paradox milestones | guildId = ${interaction.guildId}`
    )
  );
}

async function showBirthday(interaction: GuildInteraction, config: Config) {
  const entry = await birthdayService.get(
    interaction.guildId,
    interaction.user.id
  );
  if (!entry) {
    await replyPrivately(interaction, config.t("show.none"));
    return;
  }
  await replyPrivately(
    interaction,
    [
      config.t("show.entry", { date: formatDayOfYear(entry, config.locale) }),
      config.t(entry.announce ? "show.announced" : "show.private"),
      config.t("show.stored"),
    ].join("\n")
  );
}

async function removeBirthday(interaction: GuildInteraction, config: Config) {
  const removed = await birthdayService.remove(
    interaction.guildId,
    interaction.user.id
  );
  if (removed) {
    logger.info(
      `Birthday removed | guildId = ${interaction.guildId} | userId = ${interaction.user.id}`
    );
    await dropBirthdayRole(config, interaction.guildId, interaction.user.id);
  }
  await replyPrivately(
    interaction,
    config.t(removed ? "remove.done" : "remove.none")
  );
}

function whenLabel(config: Config, inDays: number): string {
  if (inDays === 0) {
    return config.t("upcoming.today");
  }
  if (inDays === 1) {
    return config.t("upcoming.tomorrow");
  }
  return config.t("upcoming.inDays", { count: inDays });
}

async function showUpcoming(interaction: GuildInteraction, config: Config) {
  const today = localTime(new Date(), config.get("timeZone"));
  const entries = (await birthdayService.list(interaction.guildId)).filter(
    (entry) => entry.announce
  );
  const coming = upcoming(entries, today, UPCOMING_DAYS);
  if (coming.length === 0) {
    await interaction.reply({
      content: config.t("upcoming.none", { count: UPCOMING_DAYS }),
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  // The day it is celebrated: 28 February for a 29 February in a common year.
  const lines = coming.map(({ entry, date, inDays }) =>
    config.t("upcoming.line", {
      date: formatDayOfYear(date, config.locale),
      user: `<@${entry.userId}>`,
      when: whenLabel(config, inDays),
    })
  );
  // A single reply: past Discord's limit, the furthest birthdays are left
  // out, and counted.
  const content = describeLines(
    [config.t("upcoming.heading", { count: UPCOMING_DAYS }), ...lines],
    (count) => config.t("upcoming.more", { count }),
    MESSAGE_LIMIT
  );
  await interaction.reply({ content, allowedMentions: NO_MENTIONS });
}

async function showStats(interaction: GuildInteraction, config: Config) {
  const entries = await birthdayService.list(interaction.guildId);
  const state = await birthdayService.getState(interaction.guildId);
  const count = entries.length;
  const shared = sharedDates(entries);
  // A shared date is only named when everyone on it agreed to be announced.
  const named = shared
    .filter((date) => date.entries.every((entry) => entry.announce))
    .map((date) => formatDayOfYear(date, config.locale));

  const lines = [
    config.t("stats.title"),
    config.t("stats.probability", {
      count,
      percent: formatPercent(collisionProbability(count), config.locale),
    }),
  ];
  if (shared.length === 0) {
    lines.push(config.t("stats.noShared"));
  } else {
    lines.push(config.t("stats.shared", { count: shared.length }));
    if (named.length > 0) {
      lines.push(
        config.t("stats.sharedDates", {
          dates: new Intl.ListFormat(config.locale).format(named),
        })
      );
    }
    if (named.length < shared.length) {
      lines.push(
        config.t("stats.sharedHidden", { count: shared.length - named.length })
      );
    }
  }

  const expected = expectedFirstCollision().toLocaleString(config.locale, {
    maximumFractionDigits: 1,
  });
  if (state.firstCollisionCount !== null) {
    lines.push(
      config.t("stats.firstCollision", {
        count: state.firstCollisionCount,
        ordinal: true,
        expected,
      })
    );
  } else if (count < HALF_GROUP_SIZE) {
    lines.push(config.t("stats.untilHalf", { count: HALF_GROUP_SIZE - count }));
  }
  lines.push(config.t("stats.footnote"));

  await interaction.reply({
    content: lines.join("\n"),
    allowedMentions: NO_MENTIONS,
  });
}

export default declareCommand<BirthdayConfigSchema>({
  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Birthdays on this server")
    .setDescriptionLocalizations({ fr: "Les anniversaires du serveur" })
    .setContexts([InteractionContextType.Guild])
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Register your birthday (day and month only)")
        .setDescriptionLocalizations({
          fr: "Enregistrer son anniversaire (jour et mois seulement)",
        })
        .addIntegerOption((option) =>
          option
            .setName("day")
            .setDescription("Day of the month")
            .setDescriptionLocalizations({ fr: "Jour du mois" })
            .setMinValue(1)
            .setMaxValue(31)
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("month")
            .setDescription("Month")
            .setDescriptionLocalizations({ fr: "Mois" })
            .addChoices(
              ...MONTHS.map(([en, fr], index) => ({
                name: en,
                name_localizations: { fr },
                value: index + 1,
              }))
            )
            .setRequired(true)
        )
        .addBooleanOption((option) =>
          option
            .setName("announce")
            .setDescription(
              "Announce it on the server (yes by default); no: only counted in the statistics"
            )
            .setDescriptionLocalizations({
              fr: "L'annoncer sur le serveur (oui par défaut) ; non : compté dans les statistiques seulement",
            })
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("show")
        .setDescription("Show what is stored about you")
        .setDescriptionLocalizations({
          fr: "Afficher ce qui est enregistré à votre sujet",
        })
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Delete your birthday")
        .setDescriptionLocalizations({ fr: "Supprimer son anniversaire" })
    )
    .addSubcommand((sub) =>
      sub
        .setName("upcoming")
        .setDescription("Birthdays of the next 30 days")
        .setDescriptionLocalizations({
          fr: "Les anniversaires des 30 prochains jours",
        })
    )
    .addSubcommand((sub) =>
      sub
        .setName("stats")
        .setDescription("The birthday paradox, on this server")
        .setDescriptionLocalizations({
          fr: "Le paradoxe des anniversaires, sur ce serveur",
        })
    ),

  async execute(interaction, config) {
    if (!interaction.inGuild()) {
      return;
    }

    switch (interaction.options.getSubcommand()) {
      case "set":
        await setBirthday(interaction, config);
        break;
      case "show":
        await showBirthday(interaction, config);
        break;
      case "remove":
        await removeBirthday(interaction, config);
        break;
      case "upcoming":
        await showUpcoming(interaction, config);
        break;
      case "stats":
        await showStats(interaction, config);
        break;
    }
  },
});
