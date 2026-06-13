import type {
  AnySelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConfigType,
  type ConfigProvider,
  type ConfigSchema,
} from "../../lib/config.js";
import type { Declared } from "../../lib/declared.js";
import type { InteractionHandler } from "../../lib/interaction.js";
import type { Module } from "../../lib/module.js";
import type { Registry } from "../../lib/registry.js";

// Mock the persistence boundary so importing the handlers does not boot the bot
// (config.service.js and config-edit.js both pull in ../../index.js).
vi.mock("../services/config.service.js", () => ({
  default: { isConfigKey: vi.fn(), updateConfigForModuleIn: vi.fn() },
}));
vi.mock("./config-edit.js", () => ({
  resolveConfigurableModule: vi.fn(),
  saveConfigValue: vi.fn(),
  getConfigEntry: vi.fn(),
  isListEntry: vi.fn(),
  refreshSourceConfigMessage: vi.fn(),
}));

const { default: configService } =
  await import("../services/config.service.js");
const {
  resolveConfigurableModule,
  saveConfigValue,
  isListEntry,
  getConfigEntry,
} = await import("./config-edit.js");
const { default: NumberConfigHandler } =
  await import("./number.config-handler.js");
const { default: UserConfigHandler } = await import("./user.config-handler.js");
const { default: EnumConfigHandler } = await import("./enum.config-handler.js");

const isConfigKey = vi.mocked(configService.isConfigKey);
const updateConfig = vi.mocked(configService.updateConfigForModuleIn);
const resolveModule = vi.mocked(resolveConfigurableModule);
const save = vi.mocked(saveConfigValue);
const isList = vi.mocked(isListEntry);
const configEntry = vi.mocked(getConfigEntry);

const fakeModule = { id: "mod" } as unknown as Module;

/**
 * Drives a handler's `registerEditionInteractionHandlers` with a capturing
 * registry and returns the single interaction handler it registers.
 */
async function captureRegisteredHandler(handler: {
  registerEditionInteractionHandlers: (registry: Registry) => Promise<void>;
}) {
  const registered: Declared<InteractionHandler<never>>[] = [];
  await handler.registerEditionInteractionHandlers({
    register: (h: Declared<InteractionHandler<never>>) => registered.push(h),
  } as unknown as Registry);

  expect(registered).toHaveLength(1);
  return registered[0]!;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveModule.mockReturnValue(fakeModule);
  isConfigKey.mockReturnValue(true);
  save.mockResolvedValue([]);
  updateConfig.mockResolvedValue({} as never);
  isList.mockReturnValue(false);
});

describe("NumberConfigHandler modal submit", () => {
  function fakeModalInteraction(value: string) {
    return {
      guildId: "guild-1",
      fields: { getTextInputValue: () => value },
      isFromMessage: () => true,
      update: vi.fn(),
      reply: vi.fn(),
    } as unknown as ModalSubmitInteraction;
  }

  it("declares that it requires admin", async () => {
    const submit = await captureRegisteredHandler(new NumberConfigHandler());
    expect(submit.requiresAdmin).toBe(true);
  });

  it("rejects a non-numeric value without saving", async () => {
    const submit = await captureRegisteredHandler(new NumberConfigHandler());
    const interaction = fakeModalInteraction("abc");

    await submit.execute(interaction, ["mod", "count"], undefined as never);

    expect(save).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("nombre") })
    );
  });

  it("saves a valid number coerced from the text input", async () => {
    const submit = await captureRegisteredHandler(new NumberConfigHandler());
    const interaction = fakeModalInteraction("42");

    await submit.execute(interaction, ["mod", "count"], undefined as never);

    expect(save).toHaveBeenCalledWith(fakeModule, "guild-1", "count", 42);
    expect(interaction.update).toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it("saves the value 0 (not treated as missing)", async () => {
    const submit = await captureRegisteredHandler(new NumberConfigHandler());
    const interaction = fakeModalInteraction("0");

    await submit.execute(interaction, ["mod", "count"], undefined as never);

    expect(save).toHaveBeenCalledWith(fakeModule, "guild-1", "count", 0);
  });

  it("reports when the module/key cannot be resolved", async () => {
    resolveModule.mockReturnValue(undefined);
    const submit = await captureRegisteredHandler(new NumberConfigHandler());
    const interaction = fakeModalInteraction("42");

    await submit.execute(interaction, ["nope", "count"], undefined as never);

    expect(save).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("introuvable"),
      })
    );
  });
});

describe("UserConfigHandler select submit", () => {
  function fakeSelectInteraction(values: string[]) {
    return {
      guildId: "guild-1",
      values,
      reply: vi.fn(),
      update: vi.fn(),
      isUserSelectMenu: () => true,
    } as unknown as AnySelectMenuInteraction;
  }

  it("registers under the set-user-config customId", async () => {
    const submit = await captureRegisteredHandler(new UserConfigHandler());
    expect(submit.customId).toBe("set-user-config");
  });

  it("only matches user select menus", async () => {
    const submit = await captureRegisteredHandler(new UserConfigHandler());

    expect(submit.check(fakeSelectInteraction([]), undefined as never)).toBe(
      true
    );
    expect(
      submit.check(
        { isUserSelectMenu: () => false } as never,
        undefined as never
      )
    ).toBe(false);
  });

  it("saves the selected id and updates the message in place", async () => {
    const submit = await captureRegisteredHandler(new UserConfigHandler());
    const interaction = fakeSelectInteraction(["123456789"]);

    await submit.execute(
      interaction,
      ["mod", "owner", "src"],
      undefined as never
    );

    expect(updateConfig).toHaveBeenCalledWith(fakeModule, "guild-1", {
      owner: "123456789",
    });
    expect(interaction.update).toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it("stores the full array for a list field", async () => {
    isList.mockReturnValue(true);
    const submit = await captureRegisteredHandler(new UserConfigHandler());
    const interaction = fakeSelectInteraction(["111", "222"]);

    await submit.execute(
      interaction,
      ["mod", "admins", "src"],
      undefined as never
    );

    expect(updateConfig).toHaveBeenCalledWith(fakeModule, "guild-1", {
      admins: ["111", "222"],
    });
  });

  it("stores an empty array when a list selection is cleared", async () => {
    isList.mockReturnValue(true);
    const submit = await captureRegisteredHandler(new UserConfigHandler());
    const interaction = fakeSelectInteraction([]);

    await submit.execute(
      interaction,
      ["mod", "admins", "src"],
      undefined as never
    );

    expect(updateConfig).toHaveBeenCalledWith(fakeModule, "guild-1", {
      admins: [],
    });
  });

  it("rejects a value that fails validation without saving", async () => {
    const submit = await captureRegisteredHandler(new UserConfigHandler());
    const interaction = fakeSelectInteraction(["not-an-id"]);

    await submit.execute(
      interaction,
      ["mod", "owner", "src"],
      undefined as never
    );

    expect(updateConfig).not.toHaveBeenCalled();
    expect(interaction.update).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalled();
  });

  it("declares that it requires admin", async () => {
    const submit = await captureRegisteredHandler(new UserConfigHandler());
    expect(submit.requiresAdmin).toBe(true);
  });
});

describe("EnumConfigHandler select submit", () => {
  function fakeSelectInteraction(values: string[]) {
    return {
      guildId: "guild-1",
      values,
      reply: vi.fn(),
      update: vi.fn(),
      isStringSelectMenu: () => true,
    } as unknown as AnySelectMenuInteraction;
  }

  beforeEach(() => {
    // The handler reads the entry's declared options to validate the selection.
    configEntry.mockReturnValue({
      name: "Mode",
      description: "",
      type: ConfigType.ENUM,
      options: ["light", "dark"],
    });
  });

  it("registers under the set-enum-config customId, requiring admin", async () => {
    const submit = await captureRegisteredHandler(new EnumConfigHandler());
    expect(submit.customId).toBe("set-enum-config");
    expect(submit.requiresAdmin).toBe(true);
  });

  it("only matches string select menus", async () => {
    const submit = await captureRegisteredHandler(new EnumConfigHandler());

    expect(submit.check(fakeSelectInteraction([]), undefined as never)).toBe(
      true
    );
    expect(
      submit.check(
        { isStringSelectMenu: () => false } as never,
        undefined as never
      )
    ).toBe(false);
  });

  it("saves the chosen option (single) and updates in place", async () => {
    const submit = await captureRegisteredHandler(new EnumConfigHandler());
    const interaction = fakeSelectInteraction(["dark"]);

    await submit.execute(
      interaction,
      ["mod", "mode", "src"],
      undefined as never
    );

    expect(updateConfig).toHaveBeenCalledWith(fakeModule, "guild-1", {
      mode: "dark",
    });
    expect(interaction.update).toHaveBeenCalled();
  });

  it("stores the full array for a list field", async () => {
    isList.mockReturnValue(true);
    const submit = await captureRegisteredHandler(new EnumConfigHandler());
    const interaction = fakeSelectInteraction(["light", "dark"]);

    await submit.execute(
      interaction,
      ["mod", "modes", "src"],
      undefined as never
    );

    expect(updateConfig).toHaveBeenCalledWith(fakeModule, "guild-1", {
      modes: ["light", "dark"],
    });
  });

  it("rejects a value outside the declared options without saving", async () => {
    const submit = await captureRegisteredHandler(new EnumConfigHandler());
    const interaction = fakeSelectInteraction(["neon"]);

    await submit.execute(
      interaction,
      ["mod", "mode", "src"],
      undefined as never
    );

    expect(updateConfig).not.toHaveBeenCalled();
    expect(interaction.update).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalled();
  });

  it("refuses to open the editor when the enum declares no options", async () => {
    // An enum field with an empty options array would otherwise build an empty
    // select menu and crash; the handler must reply with a message instead.
    configEntry.mockReturnValue({
      name: "Mode",
      description: "",
      type: ConfigType.ENUM,
      options: [],
    });
    const handler = new EnumConfigHandler();
    const interaction = {
      reply: vi.fn(),
    } as unknown as ButtonInteraction;
    const config = {
      get: () => undefined,
    } as unknown as ConfigProvider<ConfigSchema>;

    await handler.replyToEditRequest(
      interaction,
      fakeModule,
      config,
      "mode",
      "src"
    );

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("option") })
    );
  });
});
