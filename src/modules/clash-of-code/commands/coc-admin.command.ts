import {
  AttachmentBuilder,
  ChannelType,
  DiscordAPIError,
  escapeMarkdown,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  RESTJSONErrorCodes,
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
import {
  type ImportSummary,
  importClashes,
  MAX_RATE_LIMIT_PAUSE_MS,
} from "#modules/clash-of-code/services/channel-import.js";
import {
  newSearchState,
  type SearchProgress,
  type SearchState,
  searchChannelClashes,
  SearchNotReadyError,
} from "#modules/clash-of-code/services/history.js";
import { parseClashLinks } from "#modules/clash-of-code/services/links.js";
import store from "#modules/clash-of-code/services/store.js";
import {
  modeLabel,
  resultImage,
} from "#modules/clash-of-code/services/views.js";

const HANDLE_PATTERN = /^[0-9a-f]{30,40}$/i;
const PROGRESS_INTERVAL_MS = 5_000;
// The reply can be edited for 15 minutes after the command: the import stops
// before, search included, so the admin always gets the summary.
const IMPORT_BUDGET_MS = 13 * 60_000;
const IMPORTABLE_CHANNELS = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
] as const;

// One channel import at a time per guild: it can run for minutes.
const importingGuilds = new Set<string>();

// Where an unfinished channel import stands, per guild and channel: run again,
// it searches on from there and leaves out the games already checked, whatever
// their outcome. Lost on restart, when the next run starts over.
interface ChannelImport {
  search: SearchState;
  searched: boolean;
  checked: Set<string>;
}
const unfinishedImports = new Map<string, ChannelImport>();

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

function searchCounts(config: Config, progress: SearchProgress) {
  return {
    messages: config.t("importChannel.messagesRead", {
      count: progress.messages,
    }),
    found: config.t("importChannel.gamesFound", { count: progress.found }),
  };
}

function summaryMessage(
  config: Config,
  vars: { channel: string },
  summary: ImportSummary,
  totals: { found: number; previously: number; remaining: number }
): string {
  const counts =
    config.t("importChannel.counts", { ...summary, found: totals.found }) +
    (totals.previously > 0
      ? config.t("importChannel.previously", { count: totals.previously })
      : "");
  if (summary.stopped === null) {
    return config.t("importChannel.done", { ...vars, counts });
  }
  return config.t(
    summary.stopped === "time"
      ? "importChannel.stoppedTime"
      : "importChannel.stoppedRateLimit",
    {
      ...vars,
      counts,
      count: totals.remaining,
      minutes: MAX_RATE_LIMIT_PAUSE_MS / 60_000,
    }
  );
}

/**
 * Imports every finished game linked in a channel, found through Discord's
 * message search. Nothing is posted in the channel: the admin gets a progress
 * line, then a summary. An import stopped short resumes when run again.
 */
async function importChannel(interaction: Interaction, config: Config) {
  const { guildId } = interaction;
  const channel = interaction.options.getChannel("channel", true);
  const vars = { channel: `<#${channel.id}>` };
  if (importingGuilds.has(guildId)) {
    await interaction.reply({
      content: config.t("importChannel.running"),
      ...ephemeral,
    });
    return;
  }
  importingGuilds.add(guildId);
  try {
    await interaction.deferReply(ephemeral);
    // Edits run one after another, so a late progress line never overwrites
    // the summary. Past 15 minutes the reply can no longer be edited.
    let editing = Promise.resolve();
    const edit = (content: string) => {
      editing = editing
        .then(() => interaction.editReply({ content }))
        .then(() => undefined)
        .catch(() => undefined);
      return editing;
    };
    await edit(config.t("importChannel.searching", vars));

    let lastProgress = Date.now();
    const throttled = (content: () => string) => {
      if (Date.now() - lastProgress >= PROGRESS_INTERVAL_MS) {
        lastProgress = Date.now();
        void edit(content());
      }
    };

    const key = `${guildId}:${channel.id}`;
    const state = unfinishedImports.get(key) ?? {
      search: newSearchState(),
      searched: false,
      checked: new Set<string>(),
    };
    // Kept until the import ends, so a failed or stopped run resumes.
    unfinishedImports.set(key, state);
    const deadline = interaction.createdTimestamp + IMPORT_BUDGET_MS;

    try {
      state.searched ||= await searchChannelClashes(
        interaction.client.rest,
        guildId,
        channel.id,
        state.search,
        {
          deadline,
          onProgress: (progress) =>
            throttled(() =>
              config.t("importChannel.searchProgress", {
                ...vars,
                ...searchCounts(config, progress),
              })
            ),
        }
      );
    } catch (err) {
      const noAccess =
        err instanceof DiscordAPIError &&
        (err.code === RESTJSONErrorCodes.MissingAccess ||
          err.code === RESTJSONErrorCodes.MissingPermissions);
      if (!noAccess && !(err instanceof SearchNotReadyError)) {
        logger.warn({ err }, `Message search failed | guildId = ${guildId}`);
      }
      await edit(
        config.t(
          err instanceof SearchNotReadyError
            ? "importChannel.indexing"
            : noAccess
              ? "importChannel.noAccess"
              : "importChannel.searchFailed",
          vars
        )
      );
      return;
    }
    if (!state.searched) {
      await edit(
        config.t("importChannel.stoppedSearch", {
          ...vars,
          ...searchCounts(config, {
            messages: state.search.messages,
            found: state.search.found.size,
          }),
        })
      );
      return;
    }
    const clashes = [...state.search.found.values()];
    if (clashes.length === 0) {
      unfinishedImports.delete(key);
      await edit(config.t("importChannel.none", vars));
      return;
    }

    const previously = state.checked.size;
    const line = (progress: ImportSummary) => ({
      ...vars,
      done: previously + progress.done,
      count: clashes.length,
    });
    const summary = await importClashes(
      guildId,
      clashes.filter((clash) => !state.checked.has(clash.handle)),
      {
        deadline,
        checked: state.checked,
        onProgress: (progress) => {
          if (progress.pausedUntil !== null) {
            // Shown right away: the next progress line only comes after it.
            lastProgress = Date.now();
            void edit(
              config.t("importChannel.paused", {
                ...line(progress),
                until: Math.ceil(progress.pausedUntil / 1000),
              })
            );
            return;
          }
          throttled(() => config.t("importChannel.progress", line(progress)));
        },
      }
    );
    if (summary.stopped === null) {
      unfinishedImports.delete(key);
    }
    logger.info(
      `Channel imported | guildId = ${guildId} | channelId = ${channel.id} | by = ${interaction.user.id} | previously = ${previously} | ${JSON.stringify(summary)}`
    );
    await edit(
      summaryMessage(config, vars, summary, {
        found: clashes.length,
        previously,
        remaining: clashes.length - state.checked.size,
      })
    );
  } finally {
    importingGuilds.delete(guildId);
  }
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
> = { import: importGame, "import-channel": importChannel, unlink };

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
        .setName("import-channel")
        .setDescription("Import every finished game linked in a channel")
        .setDescriptionLocalizations({
          fr: "Importer toutes les parties terminées dont le lien est dans un salon",
        })
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to search")
            .setDescriptionLocalizations({ fr: "Salon à parcourir" })
            .addChannelTypes(...IMPORTABLE_CHANNELS)
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
