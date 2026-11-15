import type { GuildMember } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchAvatar = vi.hoisted(() =>
  vi.fn(async (_member: unknown, _size?: number) => "avatar")
);
vi.mock("#lib/imaging.js", () => ({ fetchAvatar }));

const { default: portraits } = await import("./portraits.service.js");

beforeEach(() => {
  fetchAvatar.mockClear();
});

const members = (count: number) =>
  Array.from({ length: count }, () => ({}) as GuildMember);

describe("ofMembers", () => {
  it("fetches only the portraits the card draws", async () => {
    const five = members(5);
    expect(await portraits.ofMembers(five)).toEqual([
      "avatar",
      "avatar",
      "avatar",
      null,
      null,
    ]);
    expect(fetchAvatar).toHaveBeenCalledTimes(3);
    expect(fetchAvatar).toHaveBeenCalledWith(five[0], 256);
  });
});

describe("ofCalendarDays", () => {
  it("fetches only the small portraits each cell draws", async () => {
    const days = [[], members(3), members(4)];
    expect(await portraits.ofCalendarDays(days)).toEqual([
      [],
      ["avatar", "avatar", "avatar"],
      ["avatar", "avatar", null, null],
    ]);
    expect(fetchAvatar).toHaveBeenCalledTimes(5);
    expect(fetchAvatar).toHaveBeenCalledWith(days[1]![0], 64);
  });
});
