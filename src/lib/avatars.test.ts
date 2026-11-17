import type { GuildMember } from "discord.js";
import { describe, expect, it, vi } from "vitest";

const fetchAvatar = vi.hoisted(() =>
  vi.fn(async (_member: unknown, size?: number) => `avatar@${size}`)
);
vi.mock("./imaging.js", () => ({ fetchAvatar }));

const { firstAvatars } = await import("./avatars.js");

describe("firstAvatars", () => {
  it("fetches the first avatars only, at the size asked", async () => {
    const members = Array.from({ length: 4 }, () => ({}) as GuildMember);
    expect(await firstAvatars(members, 2, 64)).toEqual([
      "avatar@64",
      "avatar@64",
      null,
      null,
    ]);
    expect(fetchAvatar).toHaveBeenCalledTimes(2);
    expect(fetchAvatar).toHaveBeenCalledWith(members[1], 64);
  });

  it("fetches nothing for no member", async () => {
    fetchAvatar.mockClear();
    expect(await firstAvatars([], 3, 256)).toEqual([]);
    expect(fetchAvatar).not.toHaveBeenCalled();
  });
});
