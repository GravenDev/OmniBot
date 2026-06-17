import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  type Guild,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type TextChannel,
  type User,
} from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import prisma, { Prisma } from "#lib/database.js";
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
    configuredEmojis: string[],
    config: ConfigProvider<StarboardConfigSchema>
  ): Promise<ReactionMetrics> {
    const emojis: ReactionMetric[] = [];
    const uniqueUsers = new Set<string>();
    const selfStar = config.get("selfStar");

    for (const [, reaction] of message.reactions.cache) {
      if (!this.matchEmoji(reaction.emoji, configuredEmojis)) continue;

      const users = await reaction.users.fetch();
      const filteredUsers = [...users.keys()].filter(
        (id) => selfStar || id !== message.author.id
      );

      filteredUsers.forEach((id) => uniqueUsers.add(id));
      emojis.push({
        emoji: this.formatEmoji(reaction.emoji),
        count: filteredUsers.length,
      });
    }

    return { emojis, totalUniqueUsers: uniqueUsers.size };
  }

  private buildReactionLine(metrics: ReactionMetrics): string {
    if (metrics.emojis.length === 0) return "";
    return metrics.emojis.map((m) => `${m.emoji} **${m.count}**`).join(" · ");
  }

  private truncate(text: string, max = 1000): string {
    if (text.length <= max) return text;
    return text.slice(0, max - 3) + "...";
  }

  private buildNameAndTimestamp(message: Message) {
    const timestamp = Math.floor(message.createdAt.getTime() / 1000);
    return { timestamp };
  }

  private buildReplyContainer(referenced: Message): ContainerBuilder {
    const { timestamp } = this.buildNameAndTimestamp(referenced);
    const container = new ContainerBuilder();

    container.addSectionComponents((section) =>
      section
        .addTextDisplayComponents((text) =>
          text.setContent(`## ↪ ${referenced.author} · <t:${timestamp}:R>`)
        )
        .setThumbnailAccessory((thumbnail) =>
          thumbnail.setURL(referenced.author.displayAvatarURL())
        )
    );

    if (referenced.content) {
      container.addTextDisplayComponents((text) =>
        text.setContent(this.truncate(referenced.content))
      );
    }

    const images = referenced.attachments.filter((a) =>
      a.contentType?.startsWith("image/")
    );
    const attachmentText =
      images.size > 0
        ? `🖼️ ${images.size} pièce${images.size > 1 ? "s" : ""} jointe${images.size > 1 ? "s" : ""}`
        : null;

    container.addSeparatorComponents((separator) => separator.setDivider(true));

    if (attachmentText) {
      container.addSectionComponents((section) =>
        section
          .addTextDisplayComponents((text) => text.setContent(attachmentText))
          .setButtonAccessory((button) =>
            button
              .setStyle(ButtonStyle.Link)
              .setURL(referenced.url)
              .setLabel("Voir le message")
          )
      );
    } else {
      container.addActionRowComponents((row) =>
        row.addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setURL(referenced.url)
            .setLabel("Voir le message")
        )
      );
    }

    return container;
  }

  private async buildMainContainer(
    message: Message,
    metrics: ReactionMetrics,
    config: ConfigProvider<StarboardConfigSchema>
  ): Promise<ContainerBuilder> {
    const { timestamp } = this.buildNameAndTimestamp(message);
    const container = new ContainerBuilder();

    container.addSectionComponents((section) =>
      section
        .addTextDisplayComponents((text) =>
          text.setContent(`## ${message.author} · <t:${timestamp}:R>`)
        )
        .setThumbnailAccessory((thumbnail) =>
          thumbnail.setURL(message.author.displayAvatarURL())
        )
    );

    if (message.content) {
      container.addTextDisplayComponents((text) =>
        text.setContent(this.truncate(message.content))
      );
    }

    const images = message.attachments.filter((a) =>
      a.contentType?.startsWith("image/")
    );
    if (images.size > 0) {
      container.addMediaGalleryComponents((gallery) =>
        gallery.addItems(
          ...images.map((a) => ({ media: { url: a.url } })).values()
        )
      );
    }

    container.setAccentColor(EMBED_COLORS[config.get("embedColor")]!);

    container.addSeparatorComponents((separator) => separator.setDivider(true));

    if (metrics.emojis.length > 0) {
      container.addTextDisplayComponents((text) =>
        text.setContent(`## ${this.buildReactionLine(metrics)}`)
      );
    }

    container.addSectionComponents((section) =>
      section
        .addTextDisplayComponents((text) =>
          text.setContent(
            `-# **${metrics.totalUniqueUsers}** unique${
              metrics.totalUniqueUsers > 1 ? "s" : ""
            }`
          )
        )
        .setButtonAccessory((button) =>
          button
            .setStyle(ButtonStyle.Link)
            .setURL(message.url)
            .setLabel("Voir le message")
        )
    );

    return container;
  }

  private async buildComponents(
    message: Message,
    metrics: ReactionMetrics,
    config: ConfigProvider<StarboardConfigSchema>
  ): Promise<ContainerBuilder[]> {
    const components: ContainerBuilder[] = [];

    if (message.reference?.messageId) {
      try {
        const referenced = await message.fetchReference();
        components.push(this.buildReplyContainer(referenced));
      } catch {
        // referenced message deleted or inaccessible
      }
    }

    components.push(await this.buildMainContainer(message, metrics, config));
    return components;
  }

  async handleReactionChange(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    config: ConfigProvider<StarboardConfigSchema>
  ): Promise<void> {
    try {
      if (reaction.partial) reaction = await reaction.fetch();
      if (user.partial) user = await user.fetch();

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
        configuredEmojis,
        config
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
        try {
          await this.createStarboardEntry(message, metrics, config);
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
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
            }
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      logger.error({ err: error }, "Starboard reaction handler failed");
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

    const components = await this.buildComponents(message, metrics, config);

    const starboardMessage = await (channel as TextChannel).send({
      components,
      flags: MessageFlags.IsComponentsV2,
    });

    for (const metric of metrics.emojis) {
      await starboardMessage.react(metric.emoji).catch(() => {});
    }

    try {
      await prisma.starboardEntry.create({
        data: {
          guildId: guild.id,
          originalMessageId: message.id,
          originalChannelId: message.channel.id,
          starboardMessageId: starboardMessage.id,
          starboardChannelId: starboardChannel.id,
          reactionCount: metrics.totalUniqueUsers,
          reactions: metrics.emojis as unknown as Prisma.InputJsonValue[],
        },
      });
    } catch (error) {
      await starboardMessage.delete().catch(() => {});
      throw error;
    }
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

    const components = await this.buildComponents(
      originalMessage,
      metrics,
      config
    );
    await starboardMessage.edit({
      components,
      flags: MessageFlags.IsComponentsV2,
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
        reactions: metrics.emojis as unknown as Prisma.InputJsonValue[],
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
