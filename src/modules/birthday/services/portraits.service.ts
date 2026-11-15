import type { Image } from "@napi-rs/canvas";
import type { GuildMember } from "discord.js";
import { SHOWN_PORTRAITS } from "#lib/celebration-card.js";
import { fetchAvatar } from "#lib/imaging.js";
import { declareService, type Service } from "#lib/service.js";
import { shownAvatars } from "../rendering/birthday-calendar.js";

/** The pictures the birthday card and calendar draw, from Discord's CDN. */
class PortraitsService implements Service {
  /** The card's portraits, in the members' order: null past those drawn. */
  async ofMembers(members: readonly GuildMember[]): Promise<(Image | null)[]> {
    return Promise.all(
      members.map((member, index) =>
        // Only the first ones are drawn.
        index < SHOWN_PORTRAITS ? fetchAvatar(member, 256) : null
      )
    );
  }

  /** The calendar's portraits, day by day: null past those a cell draws. */
  async ofCalendarDays(
    days: readonly (readonly GuildMember[])[]
  ): Promise<(Image | null)[][]> {
    return Promise.all(
      days.map((day) =>
        Promise.all(
          day.map((member, index) =>
            // Only the first ones are drawn.
            index < shownAvatars(day.length) ? fetchAvatar(member, 64) : null
          )
        )
      )
    );
  }
}

export default declareService(new PortraitsService());
