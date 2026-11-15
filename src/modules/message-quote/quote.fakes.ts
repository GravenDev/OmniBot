import {
  Collection,
  MessageType,
  type GuildMember,
  type Message,
} from "discord.js";

/** Fakes shared by the module's tests. */

export const member = {
  id: "1",
  displayName: "Quoter",
} as unknown as GuildMember;

/** A quote of a message that replies to none. */
export function alone(message: Message<true>) {
  return { message, reply: null };
}

export function fakeQuoted(
  options: {
    content?: string;
    attachments?: Partial<{
      name: string;
      url: string;
      contentType: string;
      spoiler: boolean;
    }>[];
    snapshot?: {
      content: string;
      embeds?: unknown[];
      components?: unknown[];
    };
    embeds?: unknown[];
    authorId?: string;
    withMember?: boolean;
    buttonIds?: string[];
    /** A message laid out with components: no content, no attachments. */
    components?: unknown[];
    /** A reply: how Discord gives the message it replies to. */
    fetchReference?: () => Promise<unknown>;
  } = {}
) {
  const attachments = new Collection(
    (options.attachments ?? []).map((attachment, index) => [
      String(index),
      { id: String(index), spoiler: false, ...attachment },
    ])
  );
  const author = {
    id: options.authorId ?? "2",
    username: "author",
    displayName: "Author",
    displayAvatarURL: () => "https://cdn/avatar.png",
  };
  return {
    content: options.content ?? "",
    attachments,
    messageSnapshots: new Collection(
      options.snapshot
        ? [
            [
              "s",
              {
                embeds: [],
                components: [],
                stickers: new Collection(),
                ...options.snapshot,
                attachments: new Collection(),
              },
            ],
          ]
        : []
    ),
    embeds: options.embeds ?? [],
    stickers: new Collection(),
    author,
    webhookId: null,
    member:
      options.withMember === false
        ? null
        : {
            ...author,
            displayName: "Nick",
            displayColor: 0xff0000,
            displayAvatarURL: () => "https://cdn/member-avatar.png",
          },
    url: "https://discord.com/channels/100/200/300",
    createdAt: new Date("2026-10-14T19:58:00Z"),
    channelId: "200",
    channel: { name: "general" },
    client: { user: { id: "bot" } },
    type: options.fetchReference ? MessageType.Reply : MessageType.Default,
    reference: options.fetchReference
      ? { channelId: "200", messageId: "299" }
      : null,
    fetchReference: options.fetchReference,
    components: options.components
      ? options.components
      : options.buttonIds
        ? [
            // An action row below an embed, as discord.js gives it.
            {
              toJSON: () => ({
                type: 1,
                components: options.buttonIds!.map((custom_id) => ({
                  type: 2,
                  custom_id,
                })),
              }),
            },
          ]
        : [],
  } as unknown as Message<true>;
}
