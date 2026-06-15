import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Guild,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type TextChannel,
  type User,
} from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import prisma from "#lib/database.js";
import logger from "#lib/logger.js";
import { declareService, type Service } from "#lib/service.js";
import type { StarboardConfigSchema } from "#modules/starboard/starboard.config.js";

interface ReactionMetric {
  emoji: string;
  count: number;
}

interface ReactionMetrics {
  emojis: ReactionMetric[];
  totalUniqueUsers: number;
}

const EMBED_COLORS: Record<string, number> = {
  default: 0x2b2d31,
  gold: 0xffd700,
  blue: 0x3498db,
  green: 0x2ecc71,
  red: 0xe74c3c,
};

class StarboardService implements Service {
  matchEmoji(
    emoji: MessageReaction["emoji"],
    configuredEmojis: string[]
  ): boolean {
    return configuredEmojis.some((configured) => {
      const customMatch = configured.match(/^<a?:\w+:(\d+)>$/);
      if (customMatch) {
        return emoji.id === customMatch[1];
      }
      if (/^\d+$/.test(configured)) {
        return emoji.id === configured;
      }
      return emoji.name === configured;
    });
  }

  private formatEmoji(emoji: MessageReaction["emoji"]): string {
    if (emoji.id) {
      return `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`;
    }
    return emoji.name!;
  }

  private async computeReactionMetrics(
    message: Message,
    configuredEmojis: string[]
  ): Promise<ReactionMetrics> {
    const emojis: ReactionMetric[] = [];
    const uniqueUsers = new Set<string>();

    for (const [, reaction] of message.reactions.cache) {
      if (!this.matchEmoji(reaction.emoji, configuredEmojis)) continue;

      emojis.push({
        emoji: this.formatEmoji(reaction.emoji),
        count: reaction.count,
      });

      const users = await reaction.users.fetch();
      for (const userId of users.keys()) {
        uniqueUsers.add(userId);
      }
    }

    return { emojis, totalUniqueUsers: uniqueUsers.size };
  }

  private buildStarboardEmbed(
    message: Message,
    metrics: ReactionMetrics,
    config: ConfigProvider<StarboardConfigSchema>
  ) {
    const description = message.content
      ? `${message.content}\n\n${this.buildReactionLine(metrics)}`
      : this.buildReactionLine(metrics);

    const embed = new EmbedBuilder()
      .setAuthor({
        name:
          message.member?.displayName ??
          message.author.globalName ??
          message.author.username,
        iconURL: message.author.displayAvatarURL(),
      })
      .setDescription(description)
      .setColor(EMBED_COLORS[config.get("embedColor")]!)
      .setTimestamp(message.createdAt);

    const firstAttachment = message.attachments.first();
    if (firstAttachment && firstAttachment.contentType?.startsWith("image/")) {
      embed.setThumbnail(firstAttachment.url);
    }

    embed.setFooter({
      text: `${metrics.totalUniqueUsers} unique`,
    });

    return embed;
  }

  private buildReactionLine(metrics: ReactionMetrics): string {
    return metrics.emojis.map((m) => `${m.emoji} **${m.count}**`).join(" | ");
  }

  private buildGoToMessageButton(message: Message) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setURL(message.url)
        .setLabel("Aller au message")
    );
  }

  async handleReactionChange(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    config: ConfigProvider<StarboardConfigSchema>
  ): Promise<void> {
    try {
      if (reaction.partial || user.partial) return;

      const message = await reaction.message.fetch();
      const guild = message.guild;
      if (!guild) return;

      const starboardChannel = config.get("starboardChannel");
      if (!starboardChannel) return;
      if (message.channel.id === starboardChannel.id) return;

      const configuredEmojis = config.get("reactionEmojis");
      if (!this.matchEmoji(reaction.emoji, configuredEmojis)) return;

      if (!config.get("selfStar") && user.id === message.author.id) return;

      if (config.get("ignoreBotMessages") && message.author.bot) return;

      const allowedChannels = config.get("allowedChannels");
      if (
        allowedChannels &&
        allowedChannels.length > 0 &&
        !allowedChannels.some((c) => c.id === message.channel.id)
      ) {
        return;
      }

      const metrics = await this.computeReactionMetrics(
        message,
        configuredEmojis
      );
      const threshold = config.get("reactionCount");

      const existingEntry = await prisma.starboardEntry.findUnique({
        where: {
          guildId_originalMessageId: {
            guildId: guild.id,
            originalMessageId: message.id,
          },
        },
      });

      if (existingEntry) {
        if (metrics.totalUniqueUsers >= threshold) {
          await this.updateStarboardEntry(
            existingEntry,
            message,
            metrics,
            config
          );
        } else if (config.get("belowThresholdBehavior") === "remove") {
          await this.removeStarboardEntry(existingEntry, guild);
        } else {
          await this.updateStarboardEntry(
            existingEntry,
            message,
            metrics,
            config
          );
        }
      } else if (metrics.totalUniqueUsers >= threshold) {
        await this.createStarboardEntry(message, metrics, config);
      }
    } catch (error) {
      logger.error(
        `Erreur dans le StarboardService.handleReactionChange : ${error}`
      );
    }
  }

  private async createStarboardEntry(
    message: Message,
    metrics: ReactionMetrics,
    config: ConfigProvider<StarboardConfigSchema>
  ): Promise<void> {
    const starboardChannel = config.get("starboardChannel");
    if (!starboardChannel) return;

    const guild = message.guild;
    if (!guild) return;

    const channel = await guild.channels.fetch(starboardChannel.id);
    if (!channel?.isTextBased()) return;
    if (!("send" in channel)) return;

    const starboardEmbed = this.buildStarboardEmbed(message, metrics, config);
    const goToButton = this.buildGoToMessageButton(message);

    const starboardMessage = await (channel as TextChannel).send({
      embeds: [starboardEmbed, ...message.embeds],
      components: [goToButton],
    });

    for (const metric of metrics.emojis) {
      await starboardMessage.react(metric.emoji).catch(() => {});
    }

    await prisma.starboardEntry.create({
      data: {
        guildId: guild.id,
        originalMessageId: message.id,
        originalChannelId: message.channel.id,
        starboardMessageId: starboardMessage.id,
        starboardChannelId: starboardChannel.id,
        reactionCount: metrics.totalUniqueUsers,
        reactions: metrics.emojis as any,
      },
    });
  }

  private async updateStarboardEntry(
    entry: {
      id: string;
      starboardMessageId: string;
      starboardChannelId: string;
    },
    originalMessage: Message,
    metrics: ReactionMetrics,
    config: ConfigProvider<StarboardConfigSchema>
  ): Promise<void> {
    const guild = originalMessage.guild;
    if (!guild) return;

    const channel = await guild.channels.fetch(entry.starboardChannelId);
    if (!channel?.isTextBased()) return;

    let starboardMessage: Message;
    try {
      starboardMessage = await (channel as TextChannel).messages.fetch(
        entry.starboardMessageId
      );
    } catch {
      return;
    }

    const starboardEmbed = this.buildStarboardEmbed(
      originalMessage,
      metrics,
      config
    );
    await starboardMessage.edit({
      embeds: [starboardEmbed, ...originalMessage.embeds],
    });

    const currentReactions = starboardMessage.reactions.cache;
    for (const metric of metrics.emojis) {
      if (!currentReactions.has(metric.emoji)) {
        await starboardMessage.react(metric.emoji).catch(() => {});
      }
    }

    for (const [, reaction] of currentReactions) {
      const emojiString = reaction.emoji.toString();
      if (!metrics.emojis.some((m) => m.emoji === emojiString)) {
        await reaction.remove().catch(() => {});
      }
    }

    await prisma.starboardEntry.update({
      where: { id: entry.id },
      data: {
        reactionCount: metrics.totalUniqueUsers,
        reactions: metrics.emojis as any,
      },
    });
  }

  private async removeStarboardEntry(
    entry: {
      starboardMessageId: string;
      starboardChannelId: string;
      id: string;
    },
    guild: Guild
  ): Promise<void> {
    try {
      const channel = await guild.channels.fetch(entry.starboardChannelId);
      if (channel?.isTextBased()) {
        try {
          const msg = await (channel as TextChannel).messages.fetch(
            entry.starboardMessageId
          );
          await msg.delete();
        } catch {
          // message already deleted or inaccessible
        }
      }
    } catch {
      // channel inaccessible
    }

    await prisma.starboardEntry.delete({
      where: { id: entry.id },
    });
  }
}

export default declareService(new StarboardService());
