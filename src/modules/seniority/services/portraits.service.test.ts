import type { Guild, GuildMember } from "discord.js";
import { describe, expect, it, vi } from "vitest";

const imaging = vi.hoisted(() => ({
  fetchAvatar: vi.fn(async (_user: unknown, _size?: number) => "avatar"),
  fetchImage: vi.fn(async (_url: string | null) => "icon"),
}));
vi.mock("#lib/imaging.js", () => imaging);

const { default: portraits } = await import("./portraits.service.js");

describe("ofMembers", () => {
  it("fetches only the portraits the card draws", async () => {
    const members = Array.from({ length: 5 }, () => ({}) as GuildMember);
    expect(await portraits.ofMembers(members)).toEqual([
      "avatar",
      "avatar",
      "avatar",
      null,
      null,
    ]);
    expect(imaging.fetchAvatar).toHaveBeenCalledTimes(3);
    expect(imaging.fetchAvatar).toHaveBeenCalledWith(members[0], 256);
  });
});

describe("serverIcon", () => {
  it("fetches the server's icon", async () => {
    const iconURL = vi.fn(() => "https://cdn/icon.png");
    expect(await portraits.serverIcon({ iconURL } as unknown as Guild)).toBe(
      "icon"
    );
    expect(iconURL).toHaveBeenCalledWith({ extension: "png", size: 256 });
    expect(imaging.fetchImage).toHaveBeenCalledWith("https://cdn/icon.png");
  });
});
