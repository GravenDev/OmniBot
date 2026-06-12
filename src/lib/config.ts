import { CategoryChannel, type Channel, Role, type User } from "discord.js";
import type { Module } from "./module.js";

export enum ConfigType {
  STRING = "STRING",
  NUMBER = "NUMBER",
  BOOLEAN = "BOOLEAN",
  USER = "USER",
  CATEGORY = "CATEGORY",
  CHANNEL = "CHANNEL",
  ROLE = "ROLE",
}

export const ConfigValidator: Record<ConfigType, (value: string) => boolean> = {
  STRING: () => true,
  NUMBER: (value: string) =>
    value.trim() !== "" && Number.isFinite(Number(value)),
  BOOLEAN: (value: string) =>
    value.toLowerCase() === "true" || value.toLowerCase() === "false",
  // Entity values may be provided as a mention or as a raw snowflake id,
  // since select menus return bare ids.
  USER: (value: string) => /^(?:<@!?\d+>|\d+)$/.test(value),
  ROLE: (value: string) => /^(?:<@&\d+>|\d+)$/.test(value),
  CHANNEL: (value: string) => /^(?:<#\d+>|\d+)$/.test(value),
  CATEGORY: (value: string) => /^(?:<#\d+>|\d+)$/.test(value),
};

export function getConfigTypeName(
  type: ConfigType | ListOf<ConfigType>
): string {
  if (Array.isArray(type)) {
    return `List of ${configTypeNames[type[0]]}`;
  }

  const name = configTypeNames[type];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export const configTypeNames: Record<ConfigType, string> = {
  STRING: "text",
  NUMBER: "number",
  BOOLEAN: "boolean",
  USER: "user",
  ROLE: "role",
  CHANNEL: "channel",
  CATEGORY: "category",
};

export type ListOf<T extends ConfigType> = [T];

export interface TypeMap {
  [ConfigType.STRING]: string;
  [ConfigType.NUMBER]: number;
  [ConfigType.BOOLEAN]: boolean;
  [ConfigType.USER]: User;
  [ConfigType.ROLE]: Role;
  [ConfigType.CHANNEL]: Channel;
  [ConfigType.CATEGORY]: CategoryChannel;
}

export type ResolveType<T extends ConfigType | ListOf<ConfigType>> =
  T extends ListOf<infer U>
    ? TypeMap[U][]
    : T extends ConfigType
      ? TypeMap[T]
      : never;

interface SimpleConfigEntry<T extends ConfigType> {
  name: string;
  description: string;
  type: T;
  defaultValue?: ResolveType<T>;
}

interface ListConfigEntry<T extends ConfigType> {
  name: string;
  description: string;
  type: ListOf<T>;
  defaultValue?: ResolveType<ListOf<T>>;
}

export type ConfigEntry<T extends ConfigType> =
  | SimpleConfigEntry<T>
  | ListConfigEntry<T>;

export type ConfigSchema = Record<string, ConfigEntry<ConfigType>>;

/**
 * Resolved type of a config entry's value.
 *
 * An entry declaring a `defaultValue` is always present, so its value is never
 * `undefined`. An entry without a default may be unset (`undefined`). `null` is
 * reserved for values cleared intentionally.
 */
export type ConfigEntryValue<E extends ConfigEntry<ConfigType>> = E extends {
  defaultValue: unknown;
}
  ? ResolveType<E["type"]>
  : ResolveType<E["type"]> | undefined;

export type ConfigData<TSchema extends ConfigSchema> = {
  [K in keyof TSchema]: ConfigEntryValue<TSchema[K]>;
};

export class ConfigProvider<TSchema extends ConfigSchema> {
  private module: Module<TSchema>;
  private readonly data: ConfigData<TSchema>;

  constructor(module: Module<TSchema>, data: ConfigData<TSchema>) {
    this.module = module;
    this.data = data;
  }

  get schema() {
    return this.module.config;
  }

  get<TKey extends keyof TSchema>(key: TKey): ConfigEntryValue<TSchema[TKey]> {
    return this.data[key];
  }
}
