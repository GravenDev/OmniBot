import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const { loadModule, findDuplicateDeclarations } =
  await import("./module-loader.js");

async function tempModuleDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "omnibot-mod-"));
}

describe("loadModule", () => {
  it("returns null when no entry point exists", async () => {
    await expect(loadModule(await tempModuleDir())).resolves.toBeNull();
  });

  it("skips a module whose import fails instead of throwing", async () => {
    const dir = await tempModuleDir();
    await writeFile(join(dir, "broken.module.js"), "this is not valid js {{{");

    await expect(loadModule(dir)).resolves.toBeNull();
  });
});

describe("findDuplicateDeclarations", () => {
  function fakeModule(id: string, commands: string[], customIds: string[]) {
    return {
      id,
      registry: {
        commands: commands.map((name) => ({ data: { name } })),
        interactionHandlers: customIds.map((customId) => ({ customId })),
      },
    } as never;
  }

  it("reports a command name or customId declared by two modules", () => {
    const duplicates = findDuplicateDeclarations([
      fakeModule("mod-a", ["ping"], ["btn"]),
      fakeModule("mod-b", ["ping"], ["btn"]),
    ]);

    expect(duplicates).toEqual([
      'command "ping" | modules = mod-a,mod-b',
      'customId "btn" | modules = mod-a,mod-b',
    ]);
  });

  it("reports nothing when every declaration is unique", () => {
    expect(
      findDuplicateDeclarations([
        fakeModule("mod-a", ["ping"], ["btn-a"]),
        fakeModule("mod-b", ["pong"], ["btn-b"]),
      ])
    ).toEqual([]);
  });
});
