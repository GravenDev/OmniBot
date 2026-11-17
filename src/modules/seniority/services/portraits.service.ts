import type { Image } from "@napi-rs/canvas";
import type { Guild, GuildMember } from "discord.js";
import { firstAvatars } from "#lib/avatars.js";
import { SHOWN_PORTRAITS } from "#lib/celebration-card.js";
import { fetchImage } from "#lib/imaging.js";
import { declareService, type Service } from "#lib/service.js";

/** The pictures the anniversary cards draw, fetched from Discord's CDN. */
class PortraitsService implements Service {
  /** The members' portraits, in their order: null past those drawn. */
  async ofMembers(members: readonly GuildMember[]): Promise<(Image | null)[]> {
    return firstAvatars(members, SHOWN_PORTRAITS, 256);
  }

  async serverIcon(guild: Guild): Promise<Image | null> {
    return fetchImage(guild.iconURL({ extension: "png", size: 256 }));
  }
}

export default declareService(new PortraitsService());
