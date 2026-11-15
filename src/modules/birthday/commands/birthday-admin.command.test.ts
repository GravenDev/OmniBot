import { describe, expect, it } from "vitest";
import command from "./birthday-admin.command.js";

describe("/birthday-admin access", () => {
  it("is checked by the command dispatcher, before anything runs", () => {
    expect(command.requiresAdmin).toBe(true);
  });
});
