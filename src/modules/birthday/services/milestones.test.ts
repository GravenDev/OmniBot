import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigData } from "#lib/config.js";
import { initTestI18n, makeTestConfig } from "#lib/testing.js";
import {
  birthdayConfigSchema,
  type BirthdayConfigSchema,
} from "../birthday.config.js";
import en from "../i18n/en.json" with { type: "json" };
import fr from "../i18n/fr.json" with { type: "json" };

const service = vi.hoisted(() => ({
  list: vi.fn(),
  getState: vi.fn(),
  recordMilestones: vi.fn(),
}));
vi.mock("./birthday.service.js", () => ({ default: service }));

const { checkMilestones } = await import("./milestones.js");

function entries(count: number, shareFirst = false) {
  return Array.from({ length: count }, (_, index) => ({
    userId: String(index),
    day: shareFirst && index === 1 ? 1 : index + 1,
    month: 1,
    announce: true,
  }));
}

function config(values: Partial<ConfigData<BirthdayConfigSchema>> = {}) {
  const send = vi.fn(async () => ({}));
  return {
    send,
    config: makeTestConfig(
      "birthday",
      birthdayConfigSchema,
      {
        channel: { isSendable: () => true, send },
        ...values,
      } as unknown as Partial<ConfigData<BirthdayConfigSchema>>,
      "fr"
    ),
  };
}

beforeAll(async () => {
  await initTestI18n("birthday", { en, fr });
});

beforeEach(() => {
  vi.clearAllMocks();
  service.getState.mockResolvedValue({
    lastDay: null,
    milestones: [],
    firstCollisionCount: null,
  });
});

describe("checkMilestones", () => {
  it("does nothing below the milestones", async () => {
    service.list.mockResolvedValue(entries(5));
    const { config: provider, send } = config();
    await checkMilestones("guild", provider);
    expect(service.recordMilestones).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("records and announces the first shared date with its rank", async () => {
    service.list.mockResolvedValue(entries(14, true));
    const { config: provider, send } = config();
    await checkMilestones("guild", provider);
    expect(service.recordMilestones).toHaveBeenCalledWith(
      "guild",
      ["first-collision"],
      14
    );
    expect(send).toHaveBeenCalledWith({
      content: expect.stringContaining("depuis le 14ᵉ inscrit"),
      allowedMentions: { parse: [] },
    });
  });

  it("records without announcing when the guild turned it off", async () => {
    service.list.mockResolvedValue(entries(23));
    const { config: provider, send } = config({ paradoxMilestones: false });
    await checkMilestones("guild", provider);
    expect(service.recordMilestones).toHaveBeenCalledWith(
      "guild",
      ["half"],
      null
    );
    expect(send).not.toHaveBeenCalled();
  });
});
