import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigType } from "../../lib/config.js";
import type { Declared } from "../../lib/declared.js";
import type { InteractionHandler } from "../../lib/interaction.js";
import type { Module } from "../../lib/module.js";
import type { Registry } from "../../lib/registry.js";

// Mock the persistence boundary so importing the editor does not boot the bot.
vi.mock("../services/config.service.js", () => ({
  default: {
    isConfigKey: vi.fn(),
    getConfigForModuleIn: vi.fn(),
    updateConfigForModuleIn: vi.fn(),
  },
}));
vi.mock("./config-edit.js", () => ({
  resolveConfigurableModule: vi.fn(),
  getConfigEntry: vi.fn(),
  refreshSourceConfigMessage: vi.fn(),
}));

const { registerScalarListEditorHandlers } =
  await import("./scalar-list-editor.js");
const { default: configService } =
  await import("../services/config.service.js");
const { resolveConfigurableModule, getConfigEntry } =
  await import("./config-edit.js");

const isConfigKey = vi.mocked(configService.isConfigKey);
const getConfig = vi.mocked(configService.getConfigForModuleIn);
const updateConfig = vi.mocked(configService.updateConfigForModuleIn);
const resolveModule = vi.mocked(resolveConfigurableModule);
const entry = vi.mocked(getConfigEntry);

const fakeModule = { id: "mod", name: "Mod" } as unknown as Module;

function handlers(): Record<string, Declared<InteractionHandler<never>>> {
  const registered: Declared<InteractionHandler<never>>[] = [];
  registerScalarListEditorHandlers({
    register: (h: Declared<InteractionHandler<never>>) => registered.push(h),
  } as unknown as Registry);

  return Object.fromEntries(registered.map((h) => [h.customId, h]));
}

function currentValues(values: unknown[]) {
  getConfig.mockResolvedValue({ get: () => values } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveModule.mockReturnValue(fakeModule);
  isConfigKey.mockReturnValue(true);
  updateConfig.mockResolvedValue({} as never);
  entry.mockReturnValue({
    name: "Count",
    description: "",
    type: [ConfigType.NUMBER],
  });
});

describe("add-list-item-modal", () => {
  function fakeModal(value: string) {
    return {
      guildId: "guild-1",
      fields: { getTextInputValue: () => value },
      isFromMessage: () => true,
      update: vi.fn(),
      reply: vi.fn(),
    } as never;
  }

  it("declares that every list editor handler requires admin", () => {
    const all = handlers();
    expect(all["add-list-item"]!.requiresAdmin).toBe(true);
    expect(all["add-list-item-modal"]!.requiresAdmin).toBe(true);
    expect(all["remove-list-item"]!.requiresAdmin).toBe(true);
    expect(all["toggle-list-item"]!.requiresAdmin).toBe(true);
  });

  it("appends a parsed, validated value to the list", async () => {
    currentValues([1, 2]);
    const submit = handlers()["add-list-item-modal"]!;

    await submit.execute(
      fakeModal("3"),
      ["mod", "count", "src"],
      undefined as never
    );

    expect(updateConfig).toHaveBeenCalledWith(fakeModule, "guild-1", {
      count: [1, 2, 3],
    });
  });

  it("rejects an invalid value without persisting", async () => {
    currentValues([1, 2]);
    const submit = handlers()["add-list-item-modal"]!;
    const interaction = fakeModal("abc");

    await submit.execute(
      interaction,
      ["mod", "count", "src"],
      undefined as never
    );

    expect(updateConfig).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalled();
  });
});

describe("remove-list-item", () => {
  function fakeButton() {
    return {
      guildId: "guild-1",
      update: vi.fn(),
      reply: vi.fn(),
    } as never;
  }

  it("removes the item at the given index", async () => {
    currentValues([10, 20, 30]);
    const remove = handlers()["remove-list-item"]!;

    await remove.execute(
      fakeButton(),
      ["mod", "count", "src", "1"],
      undefined as never
    );

    expect(updateConfig).toHaveBeenCalledWith(fakeModule, "guild-1", {
      count: [10, 30],
    });
  });

  it("leaves the list unchanged for an out-of-range index", async () => {
    currentValues([10, 20]);
    const remove = handlers()["remove-list-item"]!;

    await remove.execute(
      fakeButton(),
      ["mod", "count", "src", "5"],
      undefined as never
    );

    expect(updateConfig).toHaveBeenCalledWith(fakeModule, "guild-1", {
      count: [10, 20],
    });
  });
});

describe("boolean lists", () => {
  function fakeButton() {
    return {
      guildId: "guild-1",
      update: vi.fn(),
      reply: vi.fn(),
      showModal: vi.fn(),
    } as never;
  }

  beforeEach(() => {
    entry.mockReturnValue({
      name: "Flags",
      description: "",
      type: [ConfigType.BOOLEAN],
    });
  });

  it("adds a false entry directly without opening a modal", async () => {
    currentValues([true]);
    const interaction = fakeButton();
    const add = handlers()["add-list-item"]!;

    await add.execute(interaction, ["mod", "flags", "src"], undefined as never);

    expect(updateConfig).toHaveBeenCalledWith(fakeModule, "guild-1", {
      flags: [true, false],
    });
    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.update).toHaveBeenCalled();
  });

  it("flips the boolean at the given index", async () => {
    currentValues([true, false]);
    const toggle = handlers()["toggle-list-item"]!;

    await toggle.execute(
      fakeButton(),
      ["mod", "flags", "src", "0"],
      undefined as never
    );

    expect(updateConfig).toHaveBeenCalledWith(fakeModule, "guild-1", {
      flags: [false, false],
    });
  });
});
