import type { Client } from "discord.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { silenceLogs } from "#lib/testing.js";
import { loadRatingEmojis } from "./emojis.js";
import { RATING_ASSETS, RATING_ORDER } from "./ratings.js";

const NAMES = RATING_ORDER.map((rating) => RATING_ASSETS[rating]);

beforeAll(silenceLogs);

function client(names: string[] | Error): Client {
  const fetch = vi.fn(async () => {
    if (names instanceof Error) throw names;
    return names.map((name) => ({
      name,
      toString: () => `<:${name}:1>`,
    }));
  });
  return {
    application: { emojis: { fetch } },
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

  it("names the missing and the found emojis, without a file extension", async () => {
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
      "Chess module disabled: no Discord application available"
    );
  });

  it("reports a failed emoji fetch with its cause", async () => {
    const error = await loadRatingEmojis(
      client(new Error("Discord is down"))
    ).catch((cause: unknown) => cause);

    expect((error as Error).message).toBe(
      "Chess module disabled: cannot fetch application emojis"
    );
    expect((error as Error).cause).toHaveProperty("message", "Discord is down");
  });
});
