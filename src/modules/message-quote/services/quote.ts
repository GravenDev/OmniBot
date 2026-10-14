import {
  ActionRowBuilder,
  type Attachment,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type GuildBasedChannel,
  type GuildMember,
  type Message,
  PermissionFlagsBits,
  PermissionsBitField,
  type Role,
} from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import type { TFunction } from "#lib/i18n.js";
import {
  deleteButton,
  QUOTE_CUSTOM_ID,
} from "#modules/message-quote/interactions/delete.button.js";
import type { MessageQuoteConfigSchema } from "#modules/message-quote/message-quote.config.js";

export const MAX_QUOTES = 3;

const DESCRIPTION_LIMIT = 4096;

const EMBEDS_LIMIT = 6000;

const EMBED_OVERHEAD = 300;

const LINK_PATTERN =
  /(<)?https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)(>)?/g;

const HIDDEN_PATTERN =
  /```[\s\S]*?```|``[\s\S]*?``|`[^`\n]*`|\|\|[\s\S]*?\|\|/g;

const READ_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ReadMessageHistory,
];

export interface MessageLink {
  channelId: string;
  messageId: string;
}

export function parseMessageLinks(
  content: string,
  guildId: string
): MessageLink[] {
  const links: MessageLink[] = [];
  const seen = new Set<string>();
  for (const match of content
    .replace(HIDDEN_PATTERN, "")
    .matchAll(LINK_PATTERN)) {
    const [, open, linkGuildId, channelId, messageId, close] = match;
    if (
      !channelId ||
      !messageId ||
      (open && close) ||
      linkGuildId !== guildId ||
      seen.has(messageId)
    ) {
      continue;
    }
    seen.add(messageId);
    links.push({ channelId, messageId });
    if (links.length === MAX_QUOTES) {
      break;
    }
  }
  return links;
}

export function isExcluded(
  channel: GuildBasedChannel,
  excludedIds: ReadonlySet<string>
): boolean {
  const ids = [channel.id, channel.parentId];
  if (channel.isThread()) {
    ids.push(channel.parent?.parentId ?? null);
  }
  return ids.some((id) => id !== null && excludedIds.has(id));
}

export function isNsfw(channel: GuildBasedChannel): boolean {
  const base = channel.isThread() ? channel.parent : channel;
  return !!base && "nsfw" in base && base.nsfw;
}

function viewableBy(channel: GuildBasedChannel, role: Role): boolean {
  const base = channel.isThread() ? channel.parent : channel;
  if (!base) {
    return false;
  }
  const everyone = channel.guild.roles.everyone;
  const permissions = new PermissionsBitField([
    everyone.permissions,
    role.permissions,
  ]);
  for (const id of [everyone.id, role.id]) {
    const overwrite = base.permissionOverwrites.cache.get(id);
    if (overwrite) {
      permissions.remove(overwrite.deny).add(overwrite.allow);
    }
  }
  return permissions.has(PermissionFlagsBits.ViewChannel);
}

export function widensAudience(
  quotedChannel: GuildBasedChannel,
  destination: GuildBasedChannel
): boolean {
  if (quotedChannel.id === destination.id) {
    return false;
  }
  if (quotedChannel.type === ChannelType.PrivateThread) {
    return true;
  }
  return quotedChannel.guild.roles.cache.some(
    (role) => viewableBy(destination, role) && !viewableBy(quotedChannel, role)
  );
}

function isOwnQuote(quoted: Message<true>): boolean {
  return (
    quoted.author.id === quoted.client.user.id &&
    quoted.components.some(
      (row) =>
        "components" in row &&
        row.components.some(
          (component) =>
            "customId" in component &&
            typeof component.customId === "string" &&
            component.customId.startsWith(`${QUOTE_CUSTOM_ID}:`)
        )
    )
  );
}

export async function canRead(
  member: GuildMember,
  channel: GuildBasedChannel
): Promise<boolean> {
  const permissions = channel.permissionsFor(member);
  if (!permissions?.has(READ_PERMISSIONS)) {
    return false;
  }
  if (
    channel.type !== ChannelType.PrivateThread ||
    permissions.has(PermissionFlagsBits.ManageThreads)
  ) {
    return true;
  }
  return (
    (await channel.members
      .fetch({ member: member.id, force: true, cache: false })
      .catch(() => null)) !== null
  );
}

export async function resolveQuote(
  source: Message<true>,
  member: GuildMember,
  link: MessageLink,
  excludedIds: ReadonlySet<string>
): Promise<Message<true> | null> {
  const channel = await source.guild.channels
    .fetch(link.channelId)
    .catch(() => null);
  if (
    !channel?.isTextBased() ||
    isExcluded(channel, excludedIds) ||
    (isNsfw(channel) && !isNsfw(source.channel)) ||
    widensAudience(channel, source.channel) ||
    !(await canRead(member, channel))
  ) {
    return null;
  }
  const quoted = await channel.messages.fetch(link.messageId).catch(() => null);
  return quoted && !isOwnQuote(quoted) ? quoted : null;
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function isImage(attachment: Attachment): boolean {
  return !attachment.spoiler && !!attachment.contentType?.startsWith("image/");
}

export function quoteEmbed(
  quoted: Message<true>,
  quoter: GuildMember,
  t: TFunction,
  descriptionLimit = DESCRIPTION_LIMIT
): EmbedBuilder {
  const snapshot = quoted.messageSnapshots.first();
  const attachments = [
    ...quoted.attachments.values(),
    ...(snapshot?.attachments.values() ?? []),
  ];
  const image = attachments.find(isImage);
  const files = attachments
    .filter((attachment) => attachment !== image)
    .map((attachment) => `📎 [${attachment.name}](${attachment.url})`);
  const firstEmbed = quoted.embeds[0] ?? snapshot?.embeds[0];
  const text =
    quoted.content ||
    snapshot?.content ||
    firstEmbed?.description ||
    firstEmbed?.title ||
    "";
  const description = [text, ...files].filter(Boolean).join("\n");
  const imageUrl =
    image?.url ??
    (text.includes("||")
      ? undefined
      : (firstEmbed?.image?.url ?? firstEmbed?.thumbnail?.url));

  const author = quoted.member ?? quoted.author;
  const embed = new EmbedBuilder()
    .setAuthor({
      name: author.displayName,
      iconURL: author.displayAvatarURL(),
      url: quoted.url,
    })
    .setDescription(
      description
        ? truncate(description, descriptionLimit)
        : t("quote.noContent")
    )
    .setFooter({
      text: t(snapshot ? "quote.footerForwarded" : "quote.footer", {
        quoter: quoter.displayName,
        channel: quoted.channel.name,
      }),
    })
    .setTimestamp(quoted.createdAt);
  if (imageUrl) {
    embed.setImage(imageUrl);
  }
  if (quoted.member?.displayColor) {
    embed.setColor(quoted.member.displayColor);
  }
  return embed;
}

export function quoteReply(
  quotes: Message<true>[],
  quoter: GuildMember,
  t: TFunction
) {
  const jumpButtons = quotes.map((quoted, index) =>
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(quoted.url)
      .setLabel(
        quotes.length > 1
          ? t("quote.jumpNumbered", { number: index + 1 })
          : t("quote.jump")
      )
  );
  const descriptionLimit = Math.min(
    DESCRIPTION_LIMIT,
    Math.floor(EMBEDS_LIMIT / quotes.length) - EMBED_OVERHEAD
  );
  const allowedUserIds = [
    quoter.id,
    ...quotes.map((quoted) => quoted.author.id),
  ];
  return {
    embeds: quotes.map((quoted) =>
      quoteEmbed(quoted, quoter, t, descriptionLimit)
    ),
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...jumpButtons,
        deleteButton(t, allowedUserIds)
      ),
    ],
    allowedMentions: { parse: [], repliedUser: false },
  };
}

export async function quoteLinks(
  message: Message<true>,
  config: ConfigProvider<MessageQuoteConfigSchema>
): Promise<void> {
  const links = parseMessageLinks(message.content, message.guildId);
  if (links.length === 0) {
    return;
  }

  const excludedIds = new Set(
    [
      ...(config.get("excludedChannels") ?? []),
      ...(config.get("excludedCategories") ?? []),
    ].map((channel) => channel.id)
  );
  if (isExcluded(message.channel, excludedIds)) {
    return;
  }

  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) {
    return;
  }

  const quotes = (
    await Promise.all(
      links.map((link) => resolveQuote(message, member, link, excludedIds))
    )
  ).filter((quoted) => quoted !== null);
  if (quotes.length === 0) {
    return;
  }

  await message.reply(quoteReply(quotes, member, config.t));
}
