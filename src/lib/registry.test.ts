import type { ButtonInteraction } from "discord.js";
import { describe, expect, it } from "vitest";
import { declareInteractionHandler } from "./interaction.js";
import { Registry } from "./registry.js";

describe("Registry", () => {
  it("rejects duplicate interaction customIds", () => {
    const registry = new Registry();
    const make = () =>
      declareInteractionHandler<ButtonInteraction>({
        customId: "dup",
        check: (_interaction): _interaction is ButtonInteraction => true,
        execute: async () => {},
      });

    registry.register(make());
    expect(() => registry.register(make())).toThrow(
      "Duplicate interaction customId"
    );
  });

  it("accepts distinct customIds", () => {
    const registry = new Registry();
    const make = (customId: string) =>
      declareInteractionHandler<ButtonInteraction>({
        customId,
        check: (_interaction): _interaction is ButtonInteraction => true,
        execute: async () => {},
      });

    registry.register(make("one"));
    registry.register(make("two"));

    expect(registry.interactionHandlers).toHaveLength(2);
  });
});
