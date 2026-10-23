import { describe, expect, it } from "vitest";
import command from "./jd4h-admin.command.js";

describe("/jd4h-admin access", () => {
  it("is checked by the command dispatcher, before anything runs", () => {
    expect(command.requiresAdmin).toBe(true);
  });
});
