import type { ConfigType } from "../../lib/config.js";
import { SelectConfigHandler } from "./select.config-handler.js";

/** Extracts entity ids from a (possibly list) deserialized config value. */
function currentEntityIds(value: unknown): string[] {
  const entities = Array.isArray(value) ? value : value ? [value] : [];
  return entities
    .map((entity) => (entity as { id?: string }).id)
    .filter((id): id is string => Boolean(id));
}

/**
 * Base handler for Discord entity config types (user, role, channel, category)
 * edited through a native select menu. Subclasses only provide `selectCustomId`,
 * the select menu builder, and the matching interaction type guard; the editor
 * lifecycle and persistence live in {@link SelectConfigHandler}.
 */
export abstract class EntitySelectConfigHandler<
  Type extends ConfigType,
> extends SelectConfigHandler<Type> {
  protected override currentValues(value: unknown): string[] {
    return currentEntityIds(value);
  }

  /** Entity ids are validated by the per-type regex in {@link ConfigValidator}. */
  protected override isValidValue(value: string): boolean {
    return this.validate(value);
  }
}
