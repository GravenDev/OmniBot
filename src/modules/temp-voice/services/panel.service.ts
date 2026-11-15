import type { VoiceBasedChannel } from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { loggerMaker } from "#lib/logger.js";
import { declareService, type Service } from "#lib/service.js";
import { panelMessage } from "#modules/temp-voice/panel.js";
import store, { type TempChannel } from "./store.js";

const logger = loggerMaker("temp-voice");

/** Posts a temporary channel's panel in its chat, and keeps it up to date. */
class PanelService implements Service {
  async post(
    channel: VoiceBasedChannel,
    row: TempChannel,
    t: TFunction,
    ownerPresent?: boolean
  ): Promise<boolean> {
    try {
      const message = await channel.send(
        panelMessage(row, channel, t, ownerPresent)
      );
      await store.updateChannel(row.channelId, { panelMessageId: message.id });
      return true;
    } catch (err) {
      logger.warn({ err }, `Panel not posted | channelId = ${channel.id}`);
      return false;
    }
  }

  async refresh(
    channel: VoiceBasedChannel,
    row: TempChannel,
    t: TFunction
  ): Promise<void> {
    if (!row.panelMessageId) {
      return;
    }
    try {
      await channel.messages.edit(row.panelMessageId, {
        ...panelMessage(row, channel, t),
        embeds: [],
      });
    } catch (err) {
      logger.debug({ err }, `Panel not refreshed | channelId = ${channel.id}`);
    }
  }
}

export default declareService(new PanelService());
