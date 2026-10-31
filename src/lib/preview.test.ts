import { describe, expect, it } from "vitest";
import { previewT } from "./preview.js";

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
