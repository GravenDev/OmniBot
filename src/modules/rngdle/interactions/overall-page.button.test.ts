import type { ButtonInteraction } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import type { ViewContext } from "#modules/rngdle/services/views.js";

const mocks = vi.hoisted(() => ({
  overallPage: vi.fn(),
}));

vi.mock("#modules/rngdle/services/views.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  overallPage: mocks.overallPage,
}));

const {
  default: handler,
  overallPageMessage,
  periodText,
} = await import("./overall-page.button.js");

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key) as ViewContext["t"];

const context = (locale = "fr"): ViewContext => ({
  client: {} as ViewContext["client"],
  guildId: "guild",
  t,
  locale,
});

const customIds = (message: Awaited<ReturnType<typeof overallPageMessage>>) =>
  message.components.flatMap((row) =>
    row
      .toJSON()
      .components.map((button) =>
        "custom_id" in button ? button.custom_id : ""
      )
  );

beforeEach(() => {
  mocks.overallPage.mockReset().mockResolvedValue({
    image: Buffer.from("png"),
    page: 2,
    pageCount: 3,
  });
});

describe("periodText", () => {
  const now = new Date("2026-10-08T10:00:00Z");

  it("names the ISO week from Monday to Sunday", () => {
    expect(periodText(context("fr"), "week", now)).toBe(
      'overall.period.week {"from":"lun. 5 oct.","to":"dim. 11 oct."}'
    );
    expect(periodText(context("en"), "week", now)).toBe(
      'overall.period.week {"from":"Mon, Oct 5","to":"Sun, Oct 11"}'
    );
  });

  it("names the calendar month", () => {
    expect(periodText(context("fr"), "month", now)).toBe(
      'overall.period.month {"month":"octobre 2026"}'
    );
  });

  it("has a plain label for all time", () => {
    expect(periodText(context(), "all", now)).toBe("overall.period.all");
  });
});

describe("overallPageMessage", () => {
  it("carries the period in every button and in the text", async () => {
    const message = await overallPageMessage(
      context(),
      2,
      "caller",
      "public",
      "month"
    );

    expect(mocks.overallPage).toHaveBeenCalledWith(
      expect.anything(),
      2,
      "caller",
      "month"
    );
    expect(customIds(message)).toEqual([
      "rngdle-overall:1:public:month",
      "rngdle-overall:indicator:public:month",
      "rngdle-overall:3:public:month",
    ]);
    expect(message.content).toMatch(/^overall\.period\.month/);
  });

  it("says when a period has no roll", async () => {
    mocks.overallPage.mockResolvedValue(null);

    expect(
      (await overallPageMessage(context(), 1, "caller", "private", "week"))
        .content
    ).toBe("overall.emptyPeriod");
    expect(
      (await overallPageMessage(context(), 1, "caller", "private")).content
    ).toBe("overall.empty");
  });
});

describe("overall page button", () => {
  const click = (args: string[]) => {
    const interaction = {
      inGuild: () => true,
      guildId: "guild",
      client: {},
      user: { id: "caller" },
      deferUpdate: vi.fn(),
      deferReply: vi.fn(),
      editReply: vi.fn(),
    };
    const config = { t, locale: "en" } as unknown as ConfigProvider<{}>;
    return handler
      .execute(interaction as unknown as ButtonInteraction, args, config)
      .then(() => interaction);
  };

  it("keeps the period of the clicked message", async () => {
    await click(["3", "private", "week"]);

    expect(mocks.overallPage).toHaveBeenCalledWith(
      expect.anything(),
      3,
      "caller",
      "week"
    );
  });

  it("treats buttons from before the period option as all time", async () => {
    const interaction = await click(["2", "public"]);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(mocks.overallPage).toHaveBeenCalledWith(
      expect.anything(),
      2,
      "caller",
      "all"
    );
  });
});
