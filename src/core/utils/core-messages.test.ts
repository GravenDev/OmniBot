import { GatewayIntentBits } from "discord.js";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ConfigProvider,
  ConfigType,
  type ConfigData,
  type ConfigSchema,
} from "#lib/config.js";
import { addTranslations, createT, initI18n } from "#lib/i18n.js";
import type { Module } from "#lib/module.js";
import {
  CONFIG_FIELDS_PER_PAGE,
  configPageOfKey,
  configurationMessage,
  MODULES_PER_PAGE,
  modulesMessage,
  modulesPageOf,
} from "./core-messages.js";

beforeAll(async () => {
  await initI18n();
  addTranslations("en", "core", {
    "config.previous": "◀ Previous",
    "config.next": "Next ▶",
    "config.noConfig": "This module has no configuration available.",
    "config.currentValue": "Current: {{value}}",
    "modules.item": "{{emoji}} `{{moduleName}}`{{version}}\n> {{description}}",
    "modules.enable": "Enable",
    "modules.description": "Legend.",
    "config.page": "-# Page {{current}}/{{total}}",
    "modules.unavailable": "Unavailable",
    "modules.unavailableReason": "> Not granted: {{intents}}.",
    "modules.unavailableKept": "> Not granted: {{intents}}. Kept.",
  });
});

/** Recursively counts every component node (matching Discord's message-wide cap). */
function countComponents(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  const record = node as {
    type?: unknown;
    components?: unknown;
    accessory?: unknown;
  };
  let count = typeof record.type === "number" ? 1 : 0;
  if (Array.isArray(record.components)) {
    for (const child of record.components) count += countComponents(child);
  }
  if (record.accessory) count += countComponents(record.accessory);
  return count;
}

/** Counts component nodes of a given Discord component `type`. */
function countByType(node: unknown, type: number): number {
  if (!node || typeof node !== "object") return 0;
  const record = node as {
    type?: unknown;
    components?: unknown;
    accessory?: unknown;
  };
  let count = record.type === type ? 1 : 0;
  if (Array.isArray(record.components)) {
    for (const child of record.components) count += countByType(child, type);
  }
  if (record.accessory) count += countByType(record.accessory, type);
  return count;
}

const SECTION = 9;
const ACTION_ROW = 1;
const BUTTON = 2;

function moduleWithFields(count: number): Module<ConfigSchema> {
  const schema = Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `field${i}`,
      { name: `Field ${i}`, description: "desc", type: ConfigType.STRING },
    ])
  ) as ConfigSchema;
  return { id: "mod", name: "Mod", config: schema } as Module<ConfigSchema>;
}

function panel(module: Module<ConfigSchema>, page = 0) {
  const config = new ConfigProvider(
    module,
    {} as ConfigData<ConfigSchema>,
    "en"
  );
  return configurationMessage(module, config, page)[0]!.toJSON();
}

describe("configurationMessage pagination", () => {
  it("keeps every page under Discord's 40-component cap, even with many fields", () => {
    const module = moduleWithFields(CONFIG_FIELDS_PER_PAGE * 3 + 1);
    const pages = Math.ceil(
      (CONFIG_FIELDS_PER_PAGE * 3 + 1) / CONFIG_FIELDS_PER_PAGE
    );

    for (let page = 0; page < pages; page++) {
      expect(countComponents(panel(module, page))).toBeLessThanOrEqual(40);
    }
  });

  it("renders at most CONFIG_FIELDS_PER_PAGE fields per page", () => {
    const module = moduleWithFields(14);

    expect(countByType(panel(module, 0), SECTION)).toBe(CONFIG_FIELDS_PER_PAGE);
    expect(countByType(panel(module, 1), SECTION)).toBe(
      14 - CONFIG_FIELDS_PER_PAGE
    );
  });

  it("uses one bottom row; pagination buttons appear only when multipage", () => {
    const single = moduleWithFields(CONFIG_FIELDS_PER_PAGE);
    const multi = moduleWithFields(CONFIG_FIELDS_PER_PAGE + 1);

    // A single combined bottom row in both cases (reset lives there).
    expect(countByType(panel(single), ACTION_ROW)).toBe(1);
    expect(countByType(panel(multi), ACTION_ROW)).toBe(1);

    // Both show 10 field rows on page 0, so the two extra buttons on the
    // multipage panel are exactly the prev/next pagination controls.
    expect(
      countByType(panel(multi), BUTTON) - countByType(panel(single), BUTTON)
    ).toBe(2);
  });

  it("clamps an out-of-range page to the last page", () => {
    const module = moduleWithFields(14);

    // Page 99 clamps to page 1 (the last), which holds the remaining 4 fields.
    expect(countByType(panel(module, 99), SECTION)).toBe(
      14 - CONFIG_FIELDS_PER_PAGE
    );
  });
});

describe("configurationMessage current value", () => {
  beforeAll(() => {
    addTranslations("en", "core", { "config.option": "{{currentValue}}" });
  });

  function currentValueOf(type: ConfigType, value: string): string {
    const module = {
      id: "mod",
      name: "Mod",
      config: { field: { name: "Field", description: "desc", type } },
    } as unknown as Module<ConfigSchema>;
    const config = new ConfigProvider(
      module,
      { field: value } as ConfigData<ConfigSchema>,
      "en"
    );
    const json = JSON.stringify(
      configurationMessage(module, config)[0]!.toJSON()
    );
    return json.match(/Current: ([^"]*)/)![1]!;
  }

  it("leaves a custom emoji bare so Discord renders it", () => {
    expect(
      currentValueOf(ConfigType.EMOJI, "<:delete:1408086702182109254>")
    ).toBe("<:delete:1408086702182109254>");
  });

  it("keeps other scalar values in a code span", () => {
    expect(currentValueOf(ConfigType.STRING, "hello")).toBe("`hello`");
  });
});

describe("configPageOfKey", () => {
  const module = moduleWithFields(14);

  it("maps a key to the page holding it", () => {
    expect(configPageOfKey(module, "field0")).toBe(0);
    expect(configPageOfKey(module, "field9")).toBe(0);
    expect(configPageOfKey(module, "field10")).toBe(1);
    expect(configPageOfKey(module, "field13")).toBe(1);
  });

  it("falls back to page 0 for an unknown key", () => {
    expect(configPageOfKey(module, "missing")).toBe(0);
  });
});

describe("modulesMessage unavailable modules", () => {
  const t = createT("en", "core");
  const loaded = {
    module: { id: "latex", name: "LaTeX", description: "Formulas." },
    enabled: false,
    enabledVersion: undefined,
  };
  const stats = (enabled: boolean) => ({
    module: { id: "server-stats", name: "Server Stats", description: "Stats." },
    enabled,
    missingIntents: [GatewayIntentBits.GuildMembers],
  });

  function sections(json: { components: unknown[] }) {
    return json.components.filter(
      (component) => (component as { type: number }).type === SECTION
    ) as {
      components: { content: string }[];
      accessory: { custom_id: string; label: string; disabled?: boolean };
    }[];
  }

  it("lists an unavailable module after the others, with a disabled button", () => {
    const json = modulesMessage([loaded], t, [stats(false)]).toJSON();
    const [first, last] = sections(json);

    expect(first!.accessory.custom_id).toBe("enable-module:latex");
    expect(last!.components[0]!.content).toBe(
      "🚫 `Server Stats`\n> Stats.\n> Not granted: Server Members."
    );
    expect(last!.accessory).toMatchObject({
      custom_id: "unavailable-module:server-stats",
      label: "Unavailable",
      disabled: true,
    });
  });

  it("says that an enabled module keeps its activation", () => {
    const json = modulesMessage([], t, [stats(true)]).toJSON();

    expect(sections(json)[0]!.components[0]!.content).toBe(
      "🚫 `Server Stats`\n> Stats.\n> Not granted: Server Members. Kept."
    );
  });
});

describe("modulesMessage pagination", () => {
  const t = createT("en", "core");
  const loaded = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      module: { id: `mod${i}`, name: `Mod ${i}`, description: "desc" },
      enabled: false,
      enabledVersion: undefined,
    }));
  const unavailable = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      module: { id: `off${i}`, name: `Off ${i}`, description: "desc" },
      enabled: false,
      missingIntents: [GatewayIntentBits.GuildMembers],
    }));

  function buttonIds(json: unknown): string[] {
    const ids: string[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const record = node as {
        type?: number;
        custom_id?: string;
        components?: unknown[];
        accessory?: unknown;
      };
      if (record.type === BUTTON && record.custom_id) {
        ids.push(record.custom_id);
      }
      record.components?.forEach(walk);
      walk(record.accessory);
    };
    walk(json);
    return ids;
  }

  it("shows every module on one page, without navigation, up to the page size", () => {
    const json = modulesMessage(loaded(MODULES_PER_PAGE), t).toJSON();

    expect(countByType(json, SECTION)).toBe(MODULES_PER_PAGE);
    expect(countByType(json, ACTION_ROW)).toBe(0);
    expect(JSON.stringify(json)).not.toContain("Page");
  });

  it("splits the modules into pages of MODULES_PER_PAGE with navigation", () => {
    const first = modulesMessage(loaded(7), t, [], 0).toJSON();
    const second = modulesMessage(loaded(7), t, [], 1).toJSON();

    expect(countByType(first, SECTION)).toBe(5);
    expect(countByType(second, SECTION)).toBe(2);
    expect(JSON.stringify(first)).toContain("Page 1/2");
    expect(buttonIds(second)).toEqual([
      "enable-module:mod5",
      "enable-module:mod6",
      "modules-page:0",
      "modules-page:2",
    ]);
  });

  it("disables the buttons that would leave the range", () => {
    const row = (page: number) =>
      (
        modulesMessage(loaded(7), t, [], page).toJSON().components as {
          type: number;
          components?: { disabled?: boolean }[];
        }[]
      ).find((component) => component.type === ACTION_ROW)!.components!;

    expect(row(0).map((button) => button.disabled)).toEqual([true, false]);
    expect(row(1).map((button) => button.disabled)).toEqual([false, true]);
  });

  it("lists unavailable modules after the loaded ones, across pages", () => {
    const first = modulesMessage(loaded(4), t, unavailable(3), 0).toJSON();
    const second = modulesMessage(loaded(4), t, unavailable(3), 1).toJSON();

    expect(buttonIds(first).slice(0, 5)).toEqual([
      "enable-module:mod0",
      "enable-module:mod1",
      "enable-module:mod2",
      "enable-module:mod3",
      "unavailable-module:off0",
    ]);
    expect(buttonIds(second).slice(0, 2)).toEqual([
      "unavailable-module:off1",
      "unavailable-module:off2",
    ]);
  });

  it("clamps an out-of-range page to the last page", () => {
    const json = modulesMessage(loaded(7), t, [], 99).toJSON();

    expect(buttonIds(json)[0]).toBe("enable-module:mod5");
  });

  it("stays under Discord's 40-component cap with many modules", () => {
    const json = modulesMessage(loaded(30), t, unavailable(10), 3).toJSON();

    expect(countComponents(json)).toBeLessThanOrEqual(40);
  });

  it("finds the page that lists a module, unavailable ones included", () => {
    expect(modulesPageOf("mod4", loaded(7))).toBe(0);
    expect(modulesPageOf("mod5", loaded(7))).toBe(1);
    expect(modulesPageOf("off1", loaded(4), unavailable(3))).toBe(1);
    expect(modulesPageOf("missing", loaded(7))).toBe(0);
  });
});
