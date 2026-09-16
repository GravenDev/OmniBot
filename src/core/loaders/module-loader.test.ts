import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const { loadModule } = await import("./module-loader.js");

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
