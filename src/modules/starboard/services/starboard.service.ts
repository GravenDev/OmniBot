import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
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

  computeStarCount(message: Message, configuredEmojis: string[]): number {
    let total = 0;
    for (const [, reaction] of message.reactions.cache) {
      if (this.matchEmoji(reaction.emoji, configuredEmojis)) {
        total += reaction.count;
      }
    }
    return total;
  }

  private buildStarboardEmbed(
    message: Message,
    reactionCount: number,
    config: ConfigProvider<StarboardConfigSchema>
  ) {
    const embed = new EmbedBuilder()
      .setAuthor({
        name:
          message.member?.displayName ??
          message.author.globalName ??
          message.author.username,
        iconURL: message.author.displayAvatarURL(),
      })
      .setDescription(message.content || null)
      .setColor(EMBED_COLORS[config.get("embedColor")]!)
      .setTimestamp(message.createdAt);

    const firstAttachment = message.attachments.first();
    if (firstAttachment && firstAttachment.contentType?.startsWith("image/")) {
      embed.setThumbnail(firstAttachment.url);
    }

    embed.setFooter({
      text: `${reactionCount} ⭐`,
    });

    return embed;
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

      const totalStars = this.computeStarCount(message, configuredEmojis);
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
        if (totalStars >= threshold) {
          await this.updateStarboardEntry(existingEntry, totalStars);
        } else if (config.get("belowThresholdBehavior") === "remove") {
          await this.removeStarboardEntry(existingEntry);
        } else {
          await this.updateStarboardEntry(existingEntry, totalStars);
        }
      } else if (totalStars >= threshold) {
        await this.createStarboardEntry(message, totalStars, config);
      }
    } catch (error) {
      logger.error(
        `Erreur dans le StarboardService.handleReactionChange : ${error}`
      );
    }
  }

  private async createStarboardEntry(
    message: Message,
    reactionCount: number,
    config: ConfigProvider<StarboardConfigSchema>
  ): Promise<void> {
    const starboardChannel = config.get("starboardChannel");
    if (!starboardChannel) return;

    const guild = message.guild;
    if (!guild) return;

    const channel = await guild.channels.fetch(starboardChannel.id);
    if (!channel?.isTextBased()) return;
    if (!("send" in channel)) return;

    const starboardEmbed = this.buildStarboardEmbed(
      message,
      reactionCount,
      config
    );

    const goToButton = this.buildGoToMessageButton(message);

    const starboardMessage = await (channel as TextChannel).send({
      embeds: [starboardEmbed, ...message.embeds],
      components: [goToButton],
    });

    const firstEmoji = config.get("reactionEmojis")[0];
    if (firstEmoji) {
      await starboardMessage.react(firstEmoji).catch(() => {});
    }

    await prisma.starboardEntry.create({
      data: {
        guildId: guild.id,
        originalMessageId: message.id,
        originalChannelId: message.channel.id,
        starboardMessageId: starboardMessage.id,
        starboardChannelId: starboardChannel.id,
        reactionCount,
      },
    });
  }

  private async updateStarboardEntry(
    entry: { id: string },
    newCount: number
  ): Promise<void> {
    await prisma.starboardEntry.update({
      where: { id: entry.id },
      data: { reactionCount: newCount },
    });
  }

  private async removeStarboardEntry(entry: { id: string }): Promise<void> {
    await prisma.starboardEntry.delete({
      where: { id: entry.id },
    });
  }
}

export default declareService(new StarboardService());
