import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { afterEach, describe, expect, it } from "vitest";
import { loadAsset } from "./imaging.js";

let directory: string | undefined;

afterEach(() => {
  if (directory) {
    rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  }
});

describe("loadAsset", () => {
  it("retries an asset whose previous load failed", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "omnibot-imaging-"));
    const file = path.join(directory, "pixel.png");
    const url = pathToFileURL(file);

    await expect(loadAsset(url)).rejects.toThrow();

    writeFileSync(file, await createCanvas(1, 1).encode("png"));

    const image = await loadAsset(url);
    expect(image.width).toBe(1);
  });
});
