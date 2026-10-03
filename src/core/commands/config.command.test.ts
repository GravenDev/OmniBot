import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#index.js", () => ({ modules: [], client: {} }));
vi.mock("#core/core.module.js", () => ({
  default: { id: "core", name: "Core" },
}));
vi.mock("#core/utils/core-messages.js", () => ({}));

const { getAllModulesStateIn, getConfigForModuleIn } = vi.hoisted(() => ({
  getAllModulesStateIn: vi.fn(),
  getConfigForModuleIn: vi.fn(),
}));
vi.mock("#core/services/module.service.js", () => ({
  default: { getAllModulesStateIn },
}));
vi.mock("#core/services/config.service.js", () => ({
  default: { getConfigForModuleIn },
}));

const { default: configCommand } = await import("./config.command.js");

function fakeAutocomplete(focused: string) {
  return {
    guildId: "guild-1",
    options: { getFocused: () => focused },
    respond: vi.fn(async () => {}),
  } as any;
}

function enabledModules(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    module: { id: `mod-${i}`, name: `Module ${i}` },
    enabled: true,
  }));
}

describe("config autocomplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfigForModuleIn.mockResolvedValue({
      t: (_key: string, options: { defaultValue: string }) =>
        options.defaultValue,
    });
  });

  it("never offers more than 25 choices", async () => {
    getAllModulesStateIn.mockResolvedValue(enabledModules(40));

    const interaction = fakeAutocomplete("");
    await configCommand.complete!(interaction, {} as never);

    expect(interaction.respond.mock.calls[0][0]).toHaveLength(25);
  });

  it("filters choices on what the user typed", async () => {
    getAllModulesStateIn.mockResolvedValue(enabledModules(3));

    const interaction = fakeAutocomplete("core");
    await configCommand.complete!(interaction, {} as never);

    expect(interaction.respond).toHaveBeenCalledWith([
      { name: "Core", value: "core" },
    ]);
  });
});
