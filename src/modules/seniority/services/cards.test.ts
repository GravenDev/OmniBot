import type { AttachmentBuilder, Guild, GuildMember } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initTestI18n, makeTestConfig } from "#lib/testing.js";
import en from "../i18n/en.json" with { type: "json" };
import fr from "../i18n/fr.json" with { type: "json" };
import { seniorityConfigSchema } from "../seniority.config.js";

const rendering = vi.hoisted(() => ({
  renderCelebrationImage: vi.fn(async (..._args: unknown[]) => ({
    data: Buffer.from("webp"),
    extension: "webp" as "webp" | "png",
  })),
}));
vi.mock("#lib/celebration-card.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#lib/celebration-card.js")>()),
  ...rendering,
}));
vi.mock("#lib/imaging.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#lib/imaging.js")>()),
  fetchImage: async () => null,
  fetchAvatar: async () => "avatar",
}));

const { celebratedMembers, seniorityCard, serverCard } =
  await import("./cards.js");

beforeAll(async () => {
  await initTestI18n("seniority", { en, fr });
});

beforeEach(() => {
  vi.clearAllMocks();
});

function member(id: string, joinedAt: string, bot = false) {
  return {
    id,
    displayName: id,
    joinedAt: new Date(joinedAt),
    user: { bot },
  } as unknown as GuildMember;
}

const guild = {
  iconURL: () => null,
  createdAt: new Date("2016-11-01T10:00:00Z"),
  memberCount: 12480,
} as unknown as Guild;

const config = () =>
  makeTestConfig("seniority", seniorityConfigSchema, {}, "fr");

const NOV_1 = { year: 2026, month: 11, day: 1 };

describe("celebratedMembers", () => {
  it("lists the longest-standing first, without bots or newcomers", () => {
    const celebrated = celebratedMembers(
      [
        member("one-year", "2025-11-01T08:00:00Z"),
        member("bot", "2018-11-01T08:00:00Z", true),
        member("five-years", "2021-11-01T08:00:00Z"),
        member("other-day", "2020-11-02T08:00:00Z"),
        member("today", "2026-11-01T06:00:00Z"),
      ],
      NOV_1,
      "Europe/Paris"
    );
    expect(celebrated.map(({ member, years }) => [member.id, years])).toEqual([
      ["five-years", 5],
      ["one-year", 1],
    ]);
  });
});

describe("seniorityCard", () => {
  const celebrated = Array.from({ length: 5 }, (_, index) => ({
    member: member(`m${index}`, `${2015 + index}-11-01T08:00:00Z`),
    years: 11 - index,
  }));

  it("names the first members with their years, and everyone in the alt text", async () => {
    const card: AttachmentBuilder = await seniorityCard(
      config(),
      celebrated,
      NOV_1
    );

    const [drawn] = rendering.renderCelebrationImage.mock.calls[0]! as [
      Record<string, unknown>,
    ];
    expect(drawn).toMatchObject({
      kicker: "Ancienneté",
      title: "5 anniversaires d'arrivée !",
      names: "m0 (11 ans) · m1 (10 ans) · m2 (9 ans) · +2",
      footer: "📅  1er novembre",
      // Only the drawn portraits are fetched.
      avatars: ["avatar", "avatar", "avatar", null, null],
    });
    expect(card.description).toBe(
      "Ancienneté du jour : m0 (11 ans), m1 (10 ans), m2 (9 ans), m3 (8 ans), m4 (7 ans)"
    );
  });

  it("names the file after the image it got, animated or still", async () => {
    expect((await seniorityCard(config(), celebrated, NOV_1)).name).toBe(
      "seniority.webp"
    );
    rendering.renderCelebrationImage.mockResolvedValueOnce({
      data: Buffer.from("png"),
      extension: "png",
    });
    expect((await seniorityCard(config(), celebrated, NOV_1)).name).toBe(
      "seniority.png"
    );
  });

  it("wishes a single member on their own", async () => {
    await seniorityCard(config(), celebrated.slice(4), NOV_1);
    expect(rendering.renderCelebrationImage.mock.calls[0]![0]).toMatchObject({
      title: "Joyeux anniversaire d'arrivée !",
      names: "m4 (7 ans)",
    });
  });
});

describe("serverCard", () => {
  it("names the longest-standing member, bots excluded", async () => {
    const card: AttachmentBuilder = await serverCard(
      guild,
      config(),
      [
        member("bot", "2016-11-01T11:00:00Z", true),
        member("nora", "2017-03-03T08:00:00Z"),
        member("late", "2020-01-01T08:00:00Z"),
      ],
      10
    );

    expect(rendering.renderCelebrationImage.mock.calls[0]![0]).toMatchObject({
      title: "Le serveur fête ses 10 ans !",
      details: [
        "12 480 membres",
        "Plus ancienne présence : nora, depuis le 3 mars 2017",
      ],
      footer: "📅  Créé le 1er novembre 2016",
      avatars: [null],
    });
    expect(card.description).toBe(
      "Le serveur fête ses 10 ans. Créé le 1er novembre 2016, 12 480 membres. Plus ancienne présence : nora, depuis le 3 mars 2017."
    );
    expect(card.name).toBe("server-anniversary.webp");
  });

  it("leaves the longest-standing member out on a server of bots only", async () => {
    await serverCard(
      guild,
      config(),
      [member("bot", "2016-11-01T11:00:00Z", true)],
      1
    );
    expect(rendering.renderCelebrationImage.mock.calls[0]![0]).toMatchObject({
      title: "Le serveur fête son premier anniversaire !",
      details: ["12 480 membres"],
    });
  });
});
