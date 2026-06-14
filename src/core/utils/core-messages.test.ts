import { describe, expect, it } from "vitest";
import {
  ConfigProvider,
  ConfigType,
  type ConfigData,
  type ConfigSchema,
} from "#lib/config.js";
import type { Module } from "#lib/module.js";
import {
  CONFIG_FIELDS_PER_PAGE,
  configPageOfKey,
  configurationMessage,
} from "./core-messages.js";

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
  const config = new ConfigProvider(module, {} as ConfigData<ConfigSchema>);
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

  it("adds a navigation row only when there is more than one page", () => {
    const single = moduleWithFields(CONFIG_FIELDS_PER_PAGE);
    const multi = moduleWithFields(CONFIG_FIELDS_PER_PAGE + 1);

    expect(countByType(panel(single), ACTION_ROW)).toBe(0);
    expect(countByType(panel(multi), ACTION_ROW)).toBe(1);
  });

  it("clamps an out-of-range page to the last page", () => {
    const module = moduleWithFields(14);

    // Page 99 clamps to page 1 (the last), which holds the remaining 4 fields.
    expect(countByType(panel(module, 99), SECTION)).toBe(
      14 - CONFIG_FIELDS_PER_PAGE
    );
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
