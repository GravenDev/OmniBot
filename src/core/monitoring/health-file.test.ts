import {
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearHealthFile, healthFileReporter } from "./health-file.js";

describe("healthFileReporter", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "omnibot-health-"));
    file = path.join(dir, "health");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes the file when the bot is up", async () => {
    await healthFileReporter(file)({ up: true, msg: "OK" });
    expect(await readFile(file, "utf8")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("refreshes the file on each heartbeat", async () => {
    const report = healthFileReporter(file);
    await report({ up: true, msg: "OK" });
    const first = (await stat(file)).mtimeMs;
    await new Promise((resolve) => setTimeout(resolve, 20));
    await report({ up: true, msg: "OK" });
    expect((await stat(file)).mtimeMs).toBeGreaterThan(first);
  });

  it("removes the file when the bot is down", async () => {
    const report = healthFileReporter(file);
    await report({ up: true, msg: "OK" });
    await report({ up: false, msg: "Database unreachable" });
    await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("handles a file it cannot write instead of throwing", async () => {
    const report = healthFileReporter(path.join(dir, "missing", "health"));
    await expect(report({ up: true, msg: "OK" })).resolves.toBeUndefined();
    await expect(report({ up: true, msg: "OK" })).resolves.toBeUndefined();
  });

  it("creates the file readable by its owner only", async () => {
    await healthFileReporter(file)({ up: true, msg: "OK" });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("never writes through a symbolic link planted at its path", async () => {
    const target = path.join(dir, "target");
    await writeFile(target, "untouched");
    await symlink(target, file);
    await healthFileReporter(file)({ up: true, msg: "OK" });
    expect(await readFile(target, "utf8")).toBe("untouched");
  });

  it("does not fail when there is no file to remove", async () => {
    await expect(clearHealthFile(file)).resolves.toBeUndefined();
  });
});
