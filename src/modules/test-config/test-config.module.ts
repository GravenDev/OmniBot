import { ChannelType } from "discord.js";
import {
  ConfigType,
  type ChannelRecord,
  type ChannelRecordSource,
} from "#lib/config.js";
import logger from "#lib/logger.js";
import { defineModule } from "#lib/module.js";

const records = new Map<string, Map<string, ChannelRecord>>();

function recordsOf(guildId: string): Map<string, ChannelRecord> {
  let guildRecords = records.get(guildId);
  if (!guildRecords) {
    guildRecords = new Map();
    records.set(guildId, guildRecords);
  }
  return guildRecords;
}

const memoryRecords: ChannelRecordSource = {
  async list(guildId) {
    return [...recordsOf(guildId).values()];
  },
  async save(guild, record) {
    recordsOf(guild.id).set(record.channelId, record);
    return { ok: true, message: `Saved for <#${record.channelId}>.` };
  },
  async remove(guild, channelId) {
    const removed = recordsOf(guild.id).delete(channelId);
    return {
      ok: removed,
      message: removed
        ? `Removed for <#${channelId}>.`
        : `Nothing set for <#${channelId}>.`,
    };
  },
};

/**
 * Development-only module exercising every configuration field type.
 *
 * It declares no commands or listeners — its sole purpose is to give
 * `/config test-config` a schema covering every {@link ConfigType}, scalar and
 * list, so the configuration UI (modals, toggle, entity select menus, multi-
 * selects and the scalar list editor) can be exercised end-to-end on a real
 * Discord server. Loaded only in dev mode.
 */
export default defineModule({
  id: "test-config",
  name: "Test Config",
  description:
    "Development module declaring all configuration types, used to test the configuration UI.",
  version: "1.0.0",
  author: "AntoineJT",
  devOnly: true,

  config: {
    text: {
      name: "Text",
      description: "A free text field.",
      type: ConfigType.STRING,
      defaultValue: "valeur par défaut",
    },
    number: {
      name: "Number",
      description: "A numeric field.",
      type: ConfigType.NUMBER,
      defaultValue: 42,
    },
    duration: {
      name: "Duration",
      description: "A duration such as 30s, 4h or 1h30m.",
      type: ConfigType.DURATION,
      defaultValue: 4 * 60 * 60,
    },
    emoji: {
      name: "Emoji",
      description: "A single emoji, standard or custom.",
      type: ConfigType.EMOJI,
      defaultValue: "🚩",
    },
    toggle: {
      name: "Boolean",
      description: "An on/off toggle.",
      type: ConfigType.BOOLEAN,
      defaultValue: false,
    },
    user: {
      name: "User",
      description: "A Discord user.",
      type: ConfigType.USER,
    },
    role: {
      name: "Role",
      description: "A Discord role.",
      type: ConfigType.ROLE,
    },
    channel: {
      name: "Channel",
      description: "A Discord channel.",
      type: ConfigType.CHANNEL,
    },
    category: {
      name: "Category",
      description: "A Discord category.",
      type: ConfigType.CATEGORY,
    },
    textList: {
      name: "Text list",
      description: "A list of strings (add/remove editor).",
      type: [ConfigType.STRING],
      defaultValue: ["alpha", "beta"],
    },
    numberList: {
      name: "Number list",
      description: "A list of numbers (add/remove editor).",
      type: [ConfigType.NUMBER],
    },
    boolList: {
      name: "Boolean list",
      description: "A list of booleans (add/remove editor).",
      type: [ConfigType.BOOLEAN],
      defaultValue: [true, false],
    },
    emojiList: {
      name: "Emoji list",
      description: "A list of emojis, standard or custom (add/remove editor).",
      type: [ConfigType.EMOJI],
      defaultValue: ["⭐"],
    },
    roleList: {
      name: "Role list",
      description: "Multiple Discord roles (multi-select).",
      type: [ConfigType.ROLE],
    },
    channelList: {
      name: "Channel list",
      description: "Multiple Discord channels (multi-select).",
      type: [ConfigType.CHANNEL],
    },
    choice: {
      name: "Choice",
      description: "A value from a fixed set (single-choice select).",
      type: ConfigType.ENUM,
      options: ["faible", "moyen", "élevé"] as const,
      defaultValue: "moyen",
    },
    choiceList: {
      name: "Multiple choice",
      description: "Multiple values from a fixed set (multi-select).",
      type: [ConfigType.ENUM],
      options: ["nord", "sud", "est", "ouest"] as const,
    },
    perChannel: {
      name: "Per-channel settings",
      description: "An emoji and a text per channel (per-channel editor).",
      type: ConfigType.CHANNEL_RECORDS,
      channel: {
        name: "Channel",
        channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      },
      fields: {
        emoji: { name: "Emoji", type: ConfigType.EMOJI },
        note: { name: "Note", type: ConfigType.STRING, maxLength: 100 },
      },
      source: memoryRecords,
    },
  },

  onLoad() {
    logger.info("Module Test Config chargé (mode développement)");
  },
});
