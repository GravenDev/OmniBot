/**
 * Test-only helpers for module authors. Import from `*.test.ts` files only —
 * never from runtime code.
 *
 * What this file does NOT do: `vi.mock("#core/runtime.js")` and
 * `vi.mock("#lib/database.js")` must still be declared at the top of each
 * test file. Vitest hoists those calls above imports, so no helper can hide
 * them. Forgetting the `#core/runtime.js` mock leaves `modules` empty and
 * `client` undefined, forgetting the database mock hits a real database.
 */
import { ChannelType, ComponentType } from "discord.js";
import { vi } from "vitest";
import {
  ConfigProvider,
  type ConfigData,
  type ConfigSchema,
} from "./config.js";
import { addTranslations, initI18n } from "./i18n.js";
import baseLogger from "./logger.js";
import { forEachComponent } from "./message-content.js";
import type { Module } from "./module.js";

let i18nReady = false;

/** `initI18n()` once per file, then registers the given bundles. */
export async function initTestI18n(
  namespace = "core",
  resources: Record<string, Record<string, string>> = {}
): Promise<void> {
  if (!i18nReady) {
    await initI18n();
    i18nReady = true;
  }
  for (const [lng, bundle] of Object.entries(resources)) {
    addTranslations(lng, namespace, bundle);
  }
}

/** Quiet pino for the rest of the file (failed-path tests log a lot). */
export function silenceLogs(): void {
  baseLogger.level = "silent";
}

/** A `ConfigProvider` for `schema` with `values` stored, no DB involved. */
export function makeTestConfig<TSchema extends ConfigSchema>(
  moduleId: string,
  schema: TSchema,
  values: Partial<ConfigData<TSchema>> = {},
  locale = "en"
): ConfigProvider<TSchema> {
  const module = { id: moduleId, config: schema } as unknown as Module<TSchema>;
  return new ConfigProvider(module, values as ConfigData<TSchema>, locale);
}

/** Sendable text channel double. Override sending via `sendImpl`. */
export function fakeChannel(
  sendImpl: (args: unknown) => Promise<unknown> = async () => ({})
) {
  return {
    id: "chan-1",
    isTextBased: () => true,
    isSendable: () => true,
    send: vi.fn(sendImpl),
  };
}

export interface FakeGuildSet {
  guild: any;
  channel: ReturnType<typeof fakeChannel>;
  ownerSend: ReturnType<typeof vi.fn>;
}

/**
 * Guild double with a system channel, member permissions and owner DM.
 * Override pieces via `{ channel, ownerSend, guild: { … } }`.
 */
export function fakeGuild(overrides: Record<string, any> = {}): FakeGuildSet {
  const channel = overrides["channel"] ?? fakeChannel();
  const ownerSend = overrides["ownerSend"] ?? vi.fn(async () => ({}));
  return {
    guild: {
      id: "guild-1",
      preferredLocale: "fr",
      systemChannelId: "chan-1",
      systemChannel: channel,
      channels: { fetch: vi.fn(async () => channel) },
      members: {
        me: {
          permissionsIn: vi.fn(() => ({ has: () => true })),
        },
      },
      fetchOwner: vi.fn(async () => ({ send: ownerSend })),
      client: { tag: "fake-client" },
      ...overrides["guild"],
    },
    channel,
    ownerSend,
  };
}

/** Minimal `messageCreate` payload for listener tests. */
export function fakeMessage(overrides: Record<string, any> = {}) {
  return {
    id: "msg-1",
    content: "hello world",
    author: { bot: false, displayName: "Ada", username: "ada" },
    guild: { id: "guild-1" },
    channel: {
      id: "chan-1",
      type: ChannelType.GuildText,
      isThread: () => false,
    },
    ...overrides,
  };
}

/**
 * The text a sent message shows: its content, or the text displays of its
 * components (Components V2), in order, one per line. Both when a message
 * carries both, which Discord refuses: a test then sees the content too.
 */
export function messageText(message: {
  content?: string;
  components?: readonly unknown[];
}): string {
  const texts: string[] = message.content ? [message.content] : [];
  const walk = (node: unknown): void => {
    const json =
      node && typeof node === "object" && "toJSON" in node
        ? (node as { toJSON(): unknown }).toJSON()
        : node;
    if (!json || typeof json !== "object") {
      return;
    }
    const { type, content, components, accessory } = json as {
      type?: number;
      content?: string;
      components?: unknown[];
      accessory?: unknown;
    };
    if (type === 10 && content !== undefined) {
      texts.push(content);
    }
    for (const child of components ?? []) {
      walk(child);
    }
    if (accessory) {
      walk(accessory);
    }
  };
  for (const component of message.components ?? []) {
    walk(component);
  }
  return texts.join("\n");
}

/** Discord's limit on the components of a message, nested ones included. */
export const COMPONENTS_LIMIT = 40;

/** The text of every text display, which Discord caps per message. */
export function textLength(components: readonly unknown[]): number {
  let length = 0;
  forEachComponent({ components }, (node) => {
    if (node.type === ComponentType.TextDisplay) {
      length += node.content?.length ?? 0;
    }
  });
  return length;
}

/** Every component, nested ones included, which Discord caps per message. */
export function componentCount(components: readonly unknown[]): number {
  let count = 0;
  forEachComponent({ components }, () => count++);
  return count;
}
