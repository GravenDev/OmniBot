import type { Image } from "@napi-rs/canvas";
import type { GuildMember } from "discord.js";
import { fetchAvatar } from "./imaging.js";

/**
 * The members' avatars at `size`, in their order: only the first `shown` are
 * fetched, the others are null, for a picture that draws a few of them.
 */
export function firstAvatars(
  members: readonly GuildMember[],
  shown: number,
  size: 64 | 128 | 256
): Promise<(Image | null)[]> {
  return Promise.all(
    members.map((member, index) =>
      index < shown ? fetchAvatar(member, size) : Promise.resolve(null)
    )
  );
}
