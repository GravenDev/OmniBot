import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { requireAdmin } from "#core/utils/require-admin.js";
import { formatDate } from "#lib/calendar.js";
import { declareCommand } from "#lib/command.js";
import {
  isSearchDenied,
  SearchNotReadyError,
} from "#lib/discord-polyfills/guild-message-search.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import { fetchMember } from "#lib/moderation.js";
import type { SeniorityConfigSchema } from "../seniority.config.js";
import { recompute } from "../services/overrides.js";

const logger = loggerMaker("seniority");

// How long the search may wait for Discord to index the guild: the reply is
// deferred, and an administrator would rather retry than stare at it.
const SEARCH_BUDGET_MS = 60_000;

// One member at a time, on an administrator's request: Discord resets the
// arrival date of a member who leaves and comes back, and their first message
// is the only trace of the earlier one. Never run for every member: thousands
// of searches would read as mining the guild's history.
export default declareCommand<SeniorityConfigSchema>({
  data: new SlashCommandBuilder()
    .setName("seniority-admin")
    .setDescription("Member anniversaries admin commands")
    .setDescriptionLocalizations({ fr: "Administration de l'ancienneté" })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([InteractionContextType.Guild])
    .addSubcommand((sub) =>
      sub
        .setName("recompute")
        .setDescription(
          "Count a member's seniority from their first message if it predates their arrival"
        )
        .setDescriptionLocalizations({
          fr: "Faire partir l'ancienneté d'un membre de son premier message s'il précède son arrivée",
        })
        .addUserOption((option) =>
          option
            .setName("member")
            .setNameLocalizations({ fr: "membre" })
            .setDescription("Member whose seniority to recompute")
            .setDescriptionLocalizations({
              fr: "Membre dont recalculer l'ancienneté",
            })
            .setRequired(true)
        )
    ),
  requiresAdmin: true,

  async execute(interaction, config) {
    if (!interaction.inCachedGuild()) {
      return;
    }
    if (!(await requireAdmin(interaction, config.t))) {
      return;
    }
    const user = interaction.options.getUser("member", true);
    const vars = { user: `<@${user.id}>` };
    const reply = (key: string, extra: Record<string, string> = {}) =>
      interaction.editReply({
        content: config.t(key, { ...vars, ...extra }),
        allowedMentions: NO_MENTIONS,
      });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (user.bot) {
      await reply("admin.recompute.bot");
      return;
    }
    const date = (value: Date) =>
      formatDate(value, config.locale, config.get("timeZone"));
    // Only the search's errors mean the index or the access: a member lookup
    // Discord refuses ends in the `failed` reply like any other failure.
    let searching = false;
    try {
      // Refused only when Discord says they are not on the server; a Discord
      // failure throws, and ends in the `failed` reply.
      const member = await fetchMember(interaction.guild, user.id);
      if (!member?.joinedAt) {
        await reply("admin.recompute.notMember");
        return;
      }
      searching = true;
      const { since, corrected, partial } = await recompute(
        interaction.client.rest,
        interaction.guildId,
        user.id,
        member.joinedAt,
        Date.now() + SEARCH_BUDGET_MS
      );
      logger.info(
        `Seniority recomputed | guildId = ${interaction.guildId} | userId = ${user.id} | corrected = ${corrected} | since = ${since.toISOString()} | partial = ${partial} | by = ${interaction.user.id}`
      );
      const key = !corrected
        ? "admin.recompute.unchanged"
        : partial
          ? "admin.recompute.correctedPartial"
          : "admin.recompute.corrected";
      await reply(key, { since: date(since), joined: date(member.joinedAt) });
    } catch (err) {
      if (searching && err instanceof SearchNotReadyError) {
        await reply("admin.recompute.notReady");
        return;
      }
      // Retrying cannot help: the admin is told what to fix.
      if (searching && isSearchDenied(err)) {
        await reply("admin.recompute.noAccess");
        return;
      }
      logger.error(
        { err },
        `Seniority recompute failed | guildId = ${interaction.guildId} | userId = ${user.id}`
      );
      await reply("admin.recompute.failed");
    }
  },
});
