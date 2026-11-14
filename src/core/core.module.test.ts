import type { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { Registry } from "#lib/registry.js";

vi.mock("#lib/database.js", () => ({ default: {}, Prisma: {} }));
vi.mock("#core/runtime.js", () => ({ modules: [], client: {} }));

const registerEditionInteractionHandlers = vi.hoisted(() =>
  vi.fn(async (_registry: unknown) => {})
);
vi.mock("#core/config/config-handler-registry.js", () => ({
  default: { string: { registerEditionInteractionHandlers } },
}));

const { default: coreModule } = await import("./core.module.js");

describe("coreModule.onLoad", () => {
  // Boot exits when the core fails to load: an editor that cannot register
  // must reach that check, not end up as an unhandled rejection.
  it("fails when a config editor fails to register", async () => {
    registerEditionInteractionHandlers.mockRejectedValueOnce(
      new Error("editor blew up")
    );
    const registry = { register: vi.fn() } as unknown as Registry;

    await expect(
      Promise.resolve(coreModule.onLoad?.({} as Client, registry))
    ).rejects.toThrow("editor blew up");
  });
});
