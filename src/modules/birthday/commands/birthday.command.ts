import {
  AttachmentBuilder,
  ChannelType,
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
import { fetchImage } from "#lib/imaging.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import type { BirthdayConfigSchema } from "#modules/birthday/birthday.config.js";
import { renderStatsCard } from "#modules/birthday/rendering/stats-card.js";
import { MESSAGE_LIMIT } from "#modules/birthday/services/announcements.js";
import birthdayService, {
  type BirthdayEntry,
} from "#modules/birthday/services/birthday.service.js";
import {
  resolveGroup,
  type BirthdayGroup,
  type GroupSelection,
} from "#modules/birthday/services/group.js";
import { checkMilestones } from "#modules/birthday/services/milestones.js";
import { dropBirthdayRole } from "#modules/birthday/services/role.js";
import {
  birthdayStats,
  statsCardLabels,
  statsText,
  type BirthdayStats,
} from "#modules/birthday/services/stats.js";

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

/** The stats card, or `null` when it cannot be drawn. */
async function drawStatsCard(
  interaction: GuildInteraction,
  config: Config,
  stats: BirthdayStats
): Promise<AttachmentBuilder | null> {
  try {
    const labels = statsCardLabels(config.t, config.locale, stats);
    const icon = await fetchImage(
      interaction.guild?.iconURL({ extension: "png" }) ?? null
    );
    const png = await renderStatsCard(stats, labels, icon);
    return new AttachmentBuilder(png, {
      name: "birthday-stats.png",
      description: labels.alt,
    });
  } catch (err) {
    logger.error(
      { err },
      `Failed to draw the birthday stats card | guildId = ${interaction.guildId}`
    );
    return null;
  }
}

type StatsGroup = Pick<BirthdayGroup, "kind" | "mention" | "name"> & {
  /** Members of the role or channel, registered or not. */
  members: number;
};

function groupHeading(config: Config, group: StatsGroup, registered: number) {
  return [
    config.t(`stats.group.title.${group.kind}`, { group: group.mention }),
    config.t("stats.group.registered", {
      count: registered,
      members: config.t(`stats.group.members.${group.kind}`, {
        count: group.members,
      }),
    }),
  ];
}

/** The role or voice channel chosen, if any; "both" is refused. */
function groupSelection(
  interaction: GuildInteraction
): GroupSelection | null | "both" {
  const role = interaction.options.getRole("role");
  const channel = interaction.options.getChannel("channel");
  if (role && channel) {
    return "both";
  }
  if (role) {
    return { kind: "role", id: role.id };
  }
  return channel ? { kind: "channel", id: channel.id } : null;
}

async function showStats(interaction: GuildInteraction, config: Config) {
  const selection = groupSelection(interaction);
  if (selection === "both") {
    await replyPrivately(interaction, config.t("stats.group.both"));
    return;
  }
  // Drawing the card, like listing a large server's members, takes longer
  // than Discord's 3 seconds.
  await interaction.deferReply();
  const reply = (content: string) =>
    interaction.editReply({ content, allowedMentions: NO_MENTIONS });

  let group: StatsGroup | null = null;
  let entries = await birthdayService.list(interaction.guildId);
  if (selection) {
    const guild =
      interaction.guild ??
      (await interaction.client.guilds.fetch(interaction.guildId));
    const resolved = await resolveGroup(guild, selection);
    if (!resolved) {
      await reply(config.t("stats.group.missing"));
      return;
    }
    group = {
      kind: resolved.kind,
      mention: resolved.mention,
      name: resolved.name,
      members: resolved.memberIds.size,
    };
    entries = entries.filter((entry) => resolved.memberIds.has(entry.userId));
    // Below two birthdays, odds and shared dates mean nothing.
    if (entries.length < 2) {
      await reply(
        [
          ...groupHeading(config, group, entries.length),
          config.t(
            entries.length === 0 ? "stats.group.none" : "stats.group.single"
          ),
        ].join("\n")
      );
      return;
    }
  }

  // The first collision belongs to the whole server, not to a group.
  const firstCollisionCount = group
    ? null
    : (await birthdayService.getState(interaction.guildId)).firstCollisionCount;
  const stats = birthdayStats(entries, {
    firstCollisionCount,
    ...(group && { group: group.name }),
  });
  // The text stays with the image, for screen readers and search; alone, it
  // is the reply when the card cannot be drawn.
  const card = await drawStatsCard(interaction, config, stats);
  await interaction.editReply({
    content: statsText(
      config.t,
      config.locale,
      stats,
      group ? groupHeading(config, group, stats.count) : undefined
    ),
    files: card ? [card] : [],
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
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Only among the members of this role")
            .setDescriptionLocalizations({
              fr: "Seulement parmi les membres de ce rôle",
            })
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Only among the people in this voice channel")
            .setDescriptionLocalizations({
              fr: "Seulement parmi les personnes de ce salon vocal",
            })
            .addChannelTypes(
              ChannelType.GuildVoice,
              ChannelType.GuildStageVoice
            )
        )
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
