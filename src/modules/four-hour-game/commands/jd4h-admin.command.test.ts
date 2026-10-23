import { describe, expect, it } from "vitest";
import command from "./jd4h-admin.command.js";

describe("/jd4h-admin access", () => {
  it("is checked by the command dispatcher, before anything runs", () => {
    expect(command.requiresAdmin).toBe(true);
  });
});

describe("/jd4h-admin set", () => {
  it("asks for a score of at least 1, unset being the way to remove it", () => {
    const set = command.data
      .toJSON()
      .options?.find((option) => option.name === "set") as
      | { options?: { name: string; min_value?: number }[] }
      | undefined;
    const score = set?.options?.find((option) => option.name === "score");
    expect(score?.min_value).toBe(1);
  });
});
