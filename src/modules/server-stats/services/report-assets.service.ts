import type { Guild } from "discord.js";
import { fetchImage } from "#lib/imaging.js";
import { resolvePlayers } from "#lib/players.js";
import { declareService, type Service } from "#lib/service.js";
import { customEmojiId } from "./emoji.js";
import type { ReportAssets } from "./report.js";
import type { DailyStats } from "./store.js";

async function emojiImages(
  reactions: DailyStats["topReactions"]
): Promise<ReportAssets["emojis"]> {
  const custom = reactions.flatMap(({ id }) => {
    const emojiId = customEmojiId(id);
    return emojiId === null ? [] : [{ key: id, emojiId }];
  });
  const images = await Promise.all(
    custom.map(({ emojiId }) =>
      fetchImage(`https://cdn.discordapp.com/emojis/${emojiId}.png?size=64`)
    )
  );
  return new Map(custom.map(({ key }, index) => [key, images[index]!]));
}

class ReportAssetsService implements Service {
  // The guild's icon, the custom emojis and the top members, read together.
  async fetch(
    guild: Guild,
    stats: DailyStats,
    showTopMembers: boolean
  ): Promise<ReportAssets> {
    const [icon, emojis, players] = await Promise.all([
      fetchImage(guild.iconURL({ extension: "png", size: 256 })),
      emojiImages(stats.topReactions),
      showTopMembers
        ? resolvePlayers(
            guild.client,
            guild.id,
            stats.topMembers.map((member) => member.id)
          )
        : null,
    ]);
    return { icon, emojis, players };
  }
}

export default declareService(new ReportAssetsService());
