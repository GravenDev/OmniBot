import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#index.js", () => ({ modules: [], client: {} }));
vi.mock("#core/core.module.js", () => ({
  default: { id: "core", registry: { listeners: [] } },
}));

const { getModuleStateFromGuildIdIn, getConfigForModuleIn } = vi.hoisted(
  () => ({
    getModuleStateFromGuildIdIn: vi.fn(),
    getConfigForModuleIn: vi.fn(),
  })
);
vi.mock("#core/services/module.service.js", () => ({
  default: { getModuleStateFromGuildIdIn },
}));
vi.mock("#core/services/config.service.js", () => ({
  default: { getConfigForModuleIn },
}));

const { loadModuleEvents, extractGuildId } =
  await import("./listener-loader.js");

const fakeConfig = { tag: "config" };

function setup() {
  const handlers = new Map<string, (...args: any[]) => void>();
  const client = {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      handlers.set(event, handler);
    }),
  } as any;
  const execute = vi.fn(async () => ({}));
  const module = {
    id: "mod-a",
    registry: { listeners: [{ eventType: "messageCreate", execute }] },
  } as any;
  loadModuleEvents(client, module);
  const handler = handlers.get("messageCreate")!;
  return { handler, execute };
}

beforeEach(() => {
  vi.clearAllMocks();
  getModuleStateFromGuildIdIn.mockResolvedValue({ activated: true });
  getConfigForModuleIn.mockResolvedValue(fakeConfig);
});

describe("extractGuildId", () => {
  it("resolves through the guild, never the member user id", () => {
    expect(
      extractGuildId([{ roles: [], id: "user-1", guild: { id: "guild-9" } }])
    ).toBe("guild-9");
  });

  it("accepts a string guildId payload", () => {
    expect(extractGuildId([{ guildId: "guild-7" }])).toBe("guild-7");
  });

  it("ignores a non-string guildId instead of passing garbage down", () => {
    expect(extractGuildId([{ guildId: { id: "guild-7" } }])).toBeUndefined();
  });

  it("returns undefined for guild-less payloads", () => {
    expect(extractGuildId([{}])).toBeUndefined();
    expect(extractGuildId([])).toBeUndefined();
  });
});

describe("loadModuleEvents", () => {
  it("looks up state with the guild id, not the member id", async () => {
    const { handler, execute } = setup();

    handler({ roles: [], id: "user-1", guild: { id: "guild-9" } });
    await vi.waitFor(() => expect(execute).toHaveBeenCalled());

    expect(getModuleStateFromGuildIdIn).toHaveBeenCalledWith(
      "mod-a",
      "guild-9"
    );
    expect(execute.mock.calls[0]).toContain(fakeConfig);
  });

  it("runs without config and without state lookup for guild-less events", async () => {
    const { handler, execute } = setup();

    handler({});
    await vi.waitFor(() => expect(execute).toHaveBeenCalled());

    expect(getModuleStateFromGuildIdIn).not.toHaveBeenCalled();
    expect(execute.mock.calls[0]).toContain(undefined);
  });

  it("skips disabled modules silently", async () => {
    getModuleStateFromGuildIdIn.mockResolvedValue({ activated: false });
    const { handler, execute } = setup();

    handler({ guild: { id: "guild-9" } });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(execute).not.toHaveBeenCalled();
  });
});
