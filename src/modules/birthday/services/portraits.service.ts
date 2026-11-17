import type { Image } from "@napi-rs/canvas";
import type { GuildMember } from "discord.js";
import { firstAvatars } from "#lib/avatars.js";
import { SHOWN_PORTRAITS } from "#lib/celebration-card.js";
import { declareService, type Service } from "#lib/service.js";
import { shownAvatars } from "#modules/birthday/rendering/birthday-calendar.js";

/** The pictures the birthday card and calendar draw, from Discord's CDN. */
class PortraitsService implements Service {
  /** The card's portraits, in the members' order: null past those drawn. */
  async ofMembers(members: readonly GuildMember[]): Promise<(Image | null)[]> {
    return firstAvatars(members, SHOWN_PORTRAITS, 256);
  }

  /** The calendar's portraits, day by day: null past those a cell draws. */
  async ofCalendarDays(
    days: readonly (readonly GuildMember[])[]
  ): Promise<(Image | null)[][]> {
    return Promise.all(
      days.map((day) => firstAvatars(day, shownAvatars(day.length), 64))
    );
  }
}

export default declareService(new PortraitsService());
