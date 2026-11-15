import type { Image } from "@napi-rs/canvas";
import type { Guild, GuildMember } from "discord.js";
import { SHOWN_PORTRAITS } from "#lib/celebration-card.js";
import { fetchAvatar, fetchImage } from "#lib/imaging.js";
import { declareService, type Service } from "#lib/service.js";

/** The pictures the anniversary cards draw, fetched from Discord's CDN. */
class PortraitsService implements Service {
  /** The members' portraits, in their order: null past those drawn. */
  async ofMembers(members: readonly GuildMember[]): Promise<(Image | null)[]> {
    return Promise.all(
      members.map((member, index) =>
        // Only the first ones are drawn.
        index < SHOWN_PORTRAITS ? fetchAvatar(member, 256) : null
      )
    );
  }

  async serverIcon(guild: Guild): Promise<Image | null> {
    return fetchImage(guild.iconURL({ extension: "png", size: 256 }));
  }
}

export default declareService(new PortraitsService());
