import { MessageFlags, type ButtonInteraction } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { silenceLogs } from "#lib/testing.js";

const mocks = vi.hoisted(() => ({
  uninstallModule: vi.fn(async () => {}),
  modules: [] as { id: string; name: string; uninstallWarning?: unknown }[],
}));
vi.mock("#core/runtime.js", () => ({ modules: mocks.modules }));
vi.mock("#core/loaders/module-installer.js", () => ({
  uninstallModule: mocks.uninstallModule,
}));
vi.mock("#core/services/config.service.js", () => ({
  default: { getLocaleForGuild: async () => "fr" },
}));
vi.mock("#core/utils/core-config.js", () => ({
  getCoreT: async () => (key: string) => key,
}));
vi.mock("#core/utils/modules-panel.js", () => ({
  modulesPanel: async () => "panel",
}));

const { default: disableModuleButton } =
  await import("./disable-module.button.js");
const { disableModuleConfirmButton, disableModuleCancelButton } =
  await import("./disable-module-confirm.button.js");

function click() {
  const edit = vi.fn(async () => ({}));
  const interaction = {
    guildId: "guild",
    guild: { id: "guild" },
    reply: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
    followUp: vi.fn(async () => ({})),
    deferUpdate: vi.fn(async () => ({ edit })),
  };
  return {
    interaction: interaction as typeof interaction & ButtonInteraction,
    edit,
  };
}

// The text displays of the confirmation that replaced the panel.
function shownTexts(interaction: { update: ReturnType<typeof vi.fn> }) {
  const [options] = interaction.update.mock.calls[0] as [
    { components: { toJSON(): { components: unknown[] } }[] },
  ];
  return JSON.stringify(options.components[0]!.toJSON());
}

function withModule(uninstallWarning?: unknown) {
  mocks.modules.splice(0, mocks.modules.length, {
    id: "birthday",
    name: "Birthdays",
    ...(uninstallWarning !== undefined && { uninstallWarning }),
  });
}

beforeAll(() => {
  silenceLogs();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("disable-module", () => {
  it("disables a module without a warning, as before", async () => {
    withModule();
    const { interaction, edit } = click();
    await disableModuleButton.execute(interaction, ["birthday"], {} as never);
    expect(mocks.uninstallModule).toHaveBeenCalledWith(
      mocks.modules[0],
      interaction.guild
    );
    expect(edit).toHaveBeenCalledWith({
      components: ["panel"],
      flags: MessageFlags.IsComponentsV2,
    });
  });

  it("disables at once when nothing would be lost", async () => {
    const uninstallWarning = vi.fn(async () => null);
    withModule(uninstallWarning);
    const { interaction } = click();
    await disableModuleButton.execute(interaction, ["birthday"], {} as never);
    expect(uninstallWarning).toHaveBeenCalledWith(
      "guild",
      expect.any(Function)
    );
    expect(mocks.uninstallModule).toHaveBeenCalled();
  });

  it("asks for confirmation before deleting data", async () => {
    withModule(async () => "42 birthdays will be deleted.");
    const { interaction } = click();
    await disableModuleButton.execute(interaction, ["birthday"], {} as never);

    expect(mocks.uninstallModule).not.toHaveBeenCalled();
    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.IsComponentsV2 })
    );
    const shown = shownTexts(interaction);
    expect(shown).toContain("42 birthdays will be deleted.");
    expect(shown).toContain("disable-module-confirm:birthday");
    expect(shown).toContain("disable-module-cancel:birthday");
  });

  it("still asks when the warning cannot be computed", async () => {
    withModule(async () => {
      throw new Error("database down");
    });
    const { interaction } = click();
    await disableModuleButton.execute(interaction, ["birthday"], {} as never);

    expect(mocks.uninstallModule).not.toHaveBeenCalled();
    expect(shownTexts(interaction)).toContain("modules.confirmDisableUnknown");
  });
});

describe("disable-module-confirm", () => {
  it("disables the module once confirmed", async () => {
    const uninstallWarning = vi.fn(async () => "warning");
    withModule(uninstallWarning);
    const { interaction, edit } = click();
    await disableModuleConfirmButton.execute(
      interaction,
      ["birthday"],
      {} as never
    );
    expect(uninstallWarning).not.toHaveBeenCalled();
    expect(mocks.uninstallModule).toHaveBeenCalled();
    expect(edit).toHaveBeenCalledWith({
      components: ["panel"],
      flags: MessageFlags.IsComponentsV2,
    });
  });

  it("goes back to the panel when cancelled", async () => {
    withModule(async () => "warning");
    const { interaction } = click();
    await disableModuleCancelButton.execute(
      interaction,
      ["birthday"],
      {} as never
    );
    expect(mocks.uninstallModule).not.toHaveBeenCalled();
    expect(interaction.update).toHaveBeenCalledWith({
      components: ["panel"],
      flags: MessageFlags.IsComponentsV2,
    });
  });
});
