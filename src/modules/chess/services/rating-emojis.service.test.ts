import type { Client } from "discord.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { silenceLogs } from "#lib/testing.js";
import { RATING_ASSETS, RATING_ORDER } from "../ratings.js";
import ratingEmojis, { loadRatingEmojis } from "./rating-emojis.service.js";

const NAMES = RATING_ORDER.map((rating) => RATING_ASSETS[rating]);

beforeAll(silenceLogs);

const create = vi.fn(async ({ name }: { name: string }) => ({
  name,
  toString: () => `<:${name}:2>`,
}));

function client(names: string[] | Error): Client {
  const fetch = vi.fn(async () => {
    if (names instanceof Error) throw names;
    return names.map((name) => ({
      name,
      toString: () => `<:${name}:1>`,
    }));
  });
  return {
    application: { emojis: { fetch, create } },
  } as unknown as Client;
}

async function failure(input: Client): Promise<string> {
  const error = await loadRatingEmojis(input).catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(Error);
  return (error as Error).message;
}

describe("loadRatingEmojis", () => {
  it("maps every classification to its application emoji", async () => {
    const emojis = await loadRatingEmojis(client(NAMES));
    expect(emojis).toEqual(
      Object.fromEntries(
        RATING_ORDER.map((rating) => [rating, `<:${RATING_ASSETS[rating]}:1>`])
      )
    );
  });

  it("creates the missing emojis from the module's own badges", async () => {
    create.mockClear();
    const present = NAMES.filter(
      (name) => !["critical", "risky"].includes(name)
    );

    const emojis = await loadRatingEmojis(client(present));

    expect(create.mock.calls.map(([options]) => options.name)).toEqual([
      "critical",
      "risky",
    ]);
    // Discord refuses an emoji image over 256 KiB: the 8192 px badge is
    // scaled down first.
    const [{ attachment }] = create.mock.calls[0] as unknown as [
      { attachment: Buffer },
    ];
    expect(attachment.length).toBeLessThan(256 * 1024);
    expect(emojis.critical).toBe("<:critical:2>");
    expect(emojis.best).toBe("<:best:1>");
  }, 30_000);

  it("names the emojis it could neither find nor create", async () => {
    create.mockRejectedValueOnce(new Error("Maximum number of emojis reached"));
    create.mockRejectedValueOnce(new Error("Maximum number of emojis reached"));
    create.mockRejectedValueOnce(new Error("Maximum number of emojis reached"));
    const present = NAMES.filter(
      (name) => !["critical", "good", "risky"].includes(name)
    );
    const message = await failure(client(present));

    expect(message).toContain(
      "missing application emojis [critical, good, risky]"
    );
    expect(message).toContain(`found [${present.join(", ")}]`);
    expect(message).not.toMatch(/\.[a-z]+/i);
  });

  it("reports a missing Discord application", async () => {
    expect(await failure({} as Client)).toBe(
      "Chess rating emojis unavailable: no Discord application available"
    );
  });

  it("reports a failed emoji fetch with its cause", async () => {
    const error = await loadRatingEmojis(
      client(new Error("Discord is down"))
    ).catch((cause: unknown) => cause);

    expect((error as Error).message).toBe(
      "Chess rating emojis unavailable: cannot fetch application emojis"
    );
    expect((error as Error).cause).toHaveProperty("message", "Discord is down");
  });
});

describe("ratingEmojis.ensure", () => {
  it("falls back to text badges, then switches to the emojis once they load", async () => {
    expect(
      await ratingEmojis.ensure(client(new Error("Discord is down")))
    ).toBe(false);
    expect(ratingEmojis.get("blunder")).toBe("??");

    expect(await ratingEmojis.ensure(client(NAMES))).toBe(true);
    expect(ratingEmojis.get("blunder")).toBe("<:blunder:1>");
  });
});
