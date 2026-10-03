import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockModules } = vi.hoisted(() => ({ mockModules: [] as any[] }));
vi.mock("#index.js", () => ({ modules: mockModules, client: {} }));
vi.mock("#core/core.module.js", () => ({
  default: { id: "core", registry: { commands: [], interactionHandlers: [] } },
}));

const { getModuleStateIn, getConfigForModuleIn } = vi.hoisted(() => ({
  getModuleStateIn: vi.fn(),
  getConfigForModuleIn: vi.fn(),
}));
vi.mock("#core/services/module.service.js", () => ({
  default: { getModuleStateIn },
}));
vi.mock("#core/services/config.service.js", () => ({
  default: { getConfigForModuleIn },
}));

vi.mock("#lib/i18n.js", () => ({
  createT: () => (key: string) => key,
}));

const { default: listener } = await import("./interaction-create.listener.js");

function fakeCommand(commandName: string, overrides: Record<string, any> = {}) {
  return {
    commandName,
    guild: { id: "guild-1" },
    guildId: "guild-1",
    isChatInputCommand: () => true,
    isAutocomplete: () => false,
    isMessageComponent: () => false,
    isModalSubmit: () => false,
    replied: false,
    deferred: false,
    reply: vi.fn(async () => ({})),
    followUp: vi.fn(async () => ({})),
    ...overrides,
  } as any;
}

function fakeAutocomplete(commandName: string) {
  return {
    commandName,
    guild: { id: "guild-1" },
    guildId: "guild-1",
    isChatInputCommand: () => false,
    isAutocomplete: () => true,
    isMessageComponent: () => false,
    isModalSubmit: () => false,
    respond: vi.fn(async () => ({})),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockModules.length = 0;
  getModuleStateIn.mockResolvedValue({ activated: true });
  getConfigForModuleIn.mockImplementation(async (module: { id: string }) => ({
    moduleId: module.id,
    t: (key: string) => key,
  }));
});

describe("handleComplete", () => {
  it("hands complete() the command module config, not the core one", async () => {
    const complete = vi.fn(async () => ({}));
    mockModules.push({
      id: "mod-a",
      registry: {
        commands: [{ data: { name: "hello" }, complete }],
        interactionHandlers: [],
      },
    });

    const interaction = fakeAutocomplete("hello");
    await listener.execute(interaction, undefined);

    expect(getConfigForModuleIn).toHaveBeenCalledWith(
      expect.objectContaining({ id: "mod-a" }),
      "guild-1"
    );
    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ moduleId: "mod-a" })
    );
  });

  it("answers [] when complete() throws", async () => {
    const complete = vi.fn(async () => {
      throw new Error("boom");
    });
    mockModules.push({
      id: "mod-a",
      registry: {
        commands: [{ data: { name: "hello" }, complete }],
        interactionHandlers: [],
      },
    });

    const interaction = fakeAutocomplete("hello");
    await expect(
      listener.execute(interaction, undefined)
    ).resolves.toBeUndefined();
    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  it("answers [] without running complete() for a disabled module", async () => {
    const complete = vi.fn(async () => ({}));
    mockModules.push({
      id: "mod-a",
      registry: {
        commands: [{ data: { name: "hello" }, complete }],
        interactionHandlers: [],
      },
    });
    getModuleStateIn.mockResolvedValue({ activated: false });

    const interaction = fakeAutocomplete("hello");
    await listener.execute(interaction, undefined);

    expect(complete).not.toHaveBeenCalled();
    expect(interaction.respond).toHaveBeenCalledWith([]);
  });
});

describe("handleCommand", () => {
  function pushCommand(command: any) {
    mockModules.push({
      id: "mod-a",
      registry: { commands: [command], interactionHandlers: [] },
    });
  }

  it("replies an error instead of crashing when execute() throws", async () => {
    pushCommand({
      data: { name: "boom" },
      execute: vi.fn(async () => {
        throw new Error("boom");
      }),
    });

    const interaction = fakeCommand("boom");
    await expect(
      listener.execute(interaction, undefined)
    ).resolves.toBeUndefined();

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: "command.failed" })
    );
  });

  it("uses followUp when the interaction was already answered", async () => {
    pushCommand({
      data: { name: "boom" },
      execute: vi.fn(async () => {
        throw new Error("boom");
      }),
    });

    const interaction = fakeCommand("boom", { replied: true });
    await listener.execute(interaction, undefined);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ content: "command.failed" })
    );
  });

  it("blocks non-admins from requiresAdmin commands", async () => {
    const execute = vi.fn(async () => ({}));
    pushCommand({ data: { name: "admin" }, requiresAdmin: true, execute });

    const interaction = fakeCommand("admin", {
      memberPermissions: { has: () => false },
    });
    await listener.execute(interaction, undefined);

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: "admin.noPermission" })
    );
  });

  it("runs requiresAdmin commands for admins", async () => {
    const execute = vi.fn(async () => ({}));
    pushCommand({ data: { name: "admin" }, requiresAdmin: true, execute });

    const interaction = fakeCommand("admin", {
      memberPermissions: { has: () => true },
    });
    await listener.execute(interaction, undefined);

    expect(execute).toHaveBeenCalledOnce();
  });

  it("ignores guild-less command interactions without touching the DB", async () => {
    const execute = vi.fn(async () => ({}));
    pushCommand({ data: { name: "hello" }, execute });

    const interaction = fakeCommand("hello", {
      guild: undefined,
      guildId: undefined,
    });
    await listener.execute(interaction, undefined);

    expect(execute).not.toHaveBeenCalled();
    expect(getConfigForModuleIn).not.toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
  });
});

describe("component interactions", () => {
  function pushHandler(handler: any) {
    mockModules.push({
      id: "mod-a",
      registry: { commands: [], interactionHandlers: [handler] },
    });
  }

  function fakeButton(customId: string, overrides: Record<string, any> = {}) {
    return {
      customId,
      guild: { id: "guild-1" },
      guildId: "guild-1",
      isChatInputCommand: () => false,
      isAutocomplete: () => false,
      isMessageComponent: () => true,
      isModalSubmit: () => false,
      replied: false,
      deferred: false,
      reply: vi.fn(async () => ({})),
      followUp: vi.fn(async () => ({})),
      ...overrides,
    } as any;
  }

  it("tells the user when the handler's module is disabled", async () => {
    const execute = vi.fn(async () => {});
    pushHandler({
      customId: "btn",
      access: "everyone",
      check: () => true,
      execute,
    });
    getModuleStateIn.mockResolvedValue({ activated: false });

    const interaction = fakeButton("btn:1");
    await listener.execute(interaction, undefined);

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: "interaction.moduleNotEnabled" })
    );
  });

  it("replies an error when the handler throws", async () => {
    pushHandler({
      customId: "btn",
      access: "everyone",
      check: () => true,
      execute: vi.fn(async () => {
        throw new Error("boom");
      }),
    });

    const interaction = fakeButton("btn", { deferred: true });
    await listener.execute(interaction, undefined);

    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ content: "interaction.failed" })
    );
  });

  it("passes the customId arguments to the handler", async () => {
    const execute = vi.fn(async () => {});
    pushHandler({
      customId: "btn",
      access: "everyone",
      check: () => true,
      execute,
    });

    const interaction = fakeButton("btn:a:b");
    await listener.execute(interaction, undefined);

    expect(execute).toHaveBeenCalledWith(
      interaction,
      ["a", "b"],
      expect.anything()
    );
  });
});

describe("dispatch failures", () => {
  it("answers the user when loading the config fails", async () => {
    mockModules.push({
      id: "mod-a",
      registry: {
        commands: [{ data: { name: "hello" }, execute: vi.fn() }],
        interactionHandlers: [],
      },
    });
    getConfigForModuleIn.mockRejectedValue(new Error("db down"));

    const interaction = fakeCommand("hello", {
      locale: "en-US",
      isRepliable: () => true,
    });
    await listener.execute(interaction, undefined);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: "interaction.failed" })
    );
  });
});
