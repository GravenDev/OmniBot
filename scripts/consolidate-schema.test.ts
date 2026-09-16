import { describe, expect, it } from "vitest";
import { findDuplicatePrismaModel } from "./consolidate-schema.js";

describe("findDuplicatePrismaModel", () => {
  it("returns null when every model name is unique", () => {
    expect(
      findDuplicatePrismaModel([
        { path: "a.prisma", content: "model Alpha {\n id String @id\n}" },
        { path: "b.prisma", content: "model Beta {\n id String @id\n}" },
      ])
    ).toBeNull();
  });

  it("names the model and both files on collision", () => {
    expect(
      findDuplicatePrismaModel([
        { path: "a.prisma", content: "model Alpha {\n id String @id\n}" },
        {
          path: "b.prisma",
          content: "// comment\nmodel Alpha {\n id String @id\n}",
        },
      ])
    ).toEqual({ model: "Alpha", first: "a.prisma", second: "b.prisma" });
  });

  it("ignores commented-out models", () => {
    expect(
      findDuplicatePrismaModel([
        { path: "a.prisma", content: "// model Alpha {\n// }" },
        { path: "b.prisma", content: "model Alpha {\n id String @id\n}" },
      ])
    ).toBeNull();
  });
});
