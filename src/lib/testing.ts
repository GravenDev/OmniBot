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
import { ChannelType } from "discord.js";
import { vi } from "vitest";
import {
  ConfigProvider,
  type ConfigData,
  type ConfigSchema,
} from "./config.js";
import { addTranslations, initI18n } from "./i18n.js";
import baseLogger from "./logger.js";
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
