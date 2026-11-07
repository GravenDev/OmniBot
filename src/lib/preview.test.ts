import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { firstFrame, previewT } from "./preview.js";

describe("previewT", () => {
  it("translates from the bundle, with interpolation", async () => {
    const t = await previewT("sample", { title: "Fiche de {{name}}" });
    expect(t("title", { name: "Lolo" })).toBe("Fiche de Lolo");
  });

  it("serves several modules in one file", async () => {
    const a = await previewT("a", { key: "A" });
    const b = await previewT("b", { key: "B" });
    expect([a("key"), b("key")]).toEqual(["A", "B"]);
  });
});

describe("firstFrame", () => {
  const plain = (r: number) =>
    sharp({
      create: {
        width: 4,
        height: 3,
        channels: 3,
        background: { r, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

  it("draws the still frame Discord shows of an animation", async () => {
    const webp = await sharp([await plain(250), await plain(10)], {
      join: { animated: true },
    })
      .webp({ lossless: true })
      .toBuffer();
    const still = await firstFrame(webp);
    const meta = await sharp(still).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 4, 3]);
    const [red] = await sharp(still).raw().toBuffer();
    expect(red).toBe(250);
  });

  it("keeps a still image as it is", async () => {
    const png = await plain(120);
    const [red] = await sharp(await firstFrame(png))
      .raw()
      .toBuffer();
    expect(red).toBe(120);
  });
});
