import { Collection } from "discord.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { silenceLogs } from "#lib/testing.js";
import type { BirthdayEntry } from "./birthday.service.js";

const { default: twins } = await import("./twins.service.js");

beforeAll(() => {
  silenceLogs();
});

const own: BirthdayEntry = { userId: "me", day: 3, month: 4, announce: true };
const twin = (userId: string, announce = true): BirthdayEntry => ({
  userId,
  day: 3,
  month: 4,
  announce,
});

function interaction(
  fetch: (options: { user: string[] }) => Promise<Collection<string, unknown>>,
  cached = true
) {
  return {
    guildId: "guild",
    inCachedGuild: () => cached,
    guild: { members: { fetch: vi.fn(fetch) } },
  } as unknown as Parameters<typeof twins.of>[0];
}

const present = ({ user }: { user: string[] }) =>
  Promise.resolve(new Collection(user.map((id) => [id, {}] as const)));

describe("of", () => {
  it("names the announced members of the same date still on the server", async () => {
    const entries = [
      own,
      twin("b"),
      twin("a"),
      twin("hidden", false),
      { userId: "other", day: 4, month: 3, announce: true },
    ];
    expect(await twins.of(interaction(present), own, entries)).toEqual([
      "a",
      "b",
    ]);
  });

  it("asks Discord by batches of 100 members", async () => {
    const entries = Array.from({ length: 150 }, (_, index) =>
      twin(`u${index}`)
    );
    const asker = interaction(present);
    expect(await twins.of(asker, own, entries)).toHaveLength(150);
    expect(asker.guild.members.fetch).toHaveBeenCalledTimes(2);
  });

  it("names nobody outside the cached server, or when Discord fails", async () => {
    expect(
      await twins.of(interaction(present, false), own, [own, twin("a")])
    ).toEqual([]);
    expect(
      await twins.of(
        interaction(() => Promise.reject(new Error("down"))),
        own,
        [own, twin("a")]
      )
    ).toEqual([]);
  });
});
