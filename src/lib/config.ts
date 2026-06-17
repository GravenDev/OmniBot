import { CategoryChannel, type Channel, Role, type User } from "discord.js";
import { createT, type TFunction } from "./i18n.js";
import type { Module } from "./module.js";

function ucfirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export enum ConfigType {
  STRING = "STRING",
  NUMBER = "NUMBER",
  BOOLEAN = "BOOLEAN",
  USER = "USER",
  CATEGORY = "CATEGORY",
  CHANNEL = "CHANNEL",
  ROLE = "ROLE",
  ENUM = "ENUM",
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
  // Membership against the field's declared `options` is enforced by the enum
  // handler (which has access to the entry); this generic predicate cannot.
  ENUM: () => true,
};

export function getConfigTypeName(
  type: ConfigType | ListOf<ConfigType>,
  t?: TFunction
): string {
  if (Array.isArray(type)) {
    const inner = configTypeNames[type[0]];
    return t
      ? t("type.listOf", {
          type: t("type." + inner, { defaultValue: ucfirst(inner) }),
        })
      : `List of ${inner}`;
  }

  const name = configTypeNames[type];
  return t ? t("type." + name, { defaultValue: ucfirst(name) }) : ucfirst(name);
}

export const configTypeNames: Record<ConfigType, string> = {
  STRING: "text",
  NUMBER: "number",
  BOOLEAN: "boolean",
  USER: "user",
  ROLE: "role",
  CHANNEL: "channel",
  CATEGORY: "category",
  ENUM: "choice",
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
  // Fallback when an enum entry declares no literal `options` (`as const`);
  // ConfigEntryValue narrows to the literal union when options are present.
  [ConfigType.ENUM]: string;
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

/**
 * Config entry whose value is one of a fixed set of string `options`, edited
 * through a single-choice select menu. Declare `options` `as const` to have
 * `config.get(...)` typed as the literal union of allowed values.
 */
export interface EnumConfigEntry<Values extends string = string> {
  name: string;
  description: string;
  type: ConfigType.ENUM;
  options: readonly Values[];
  defaultValue?: Values;
}

/** List variant of {@link EnumConfigEntry}: any subset of `options` (multi-select). */
export interface EnumListConfigEntry<Values extends string = string> {
  name: string;
  description: string;
  type: ListOf<ConfigType.ENUM>;
  options: readonly Values[];
  defaultValue?: Values[];
}

export type ConfigEntry<T extends ConfigType> =
  // ENUM is excluded from the scalar/entity variants so a `type: ConfigType.ENUM`
  // entry can only satisfy the enum shapes below — which require `options`.
  // Without this, `{ type: ENUM }` would match SimpleConfigEntry and compile
  // without options, then fail at runtime building an empty select menu.
  | SimpleConfigEntry<Exclude<T, ConfigType.ENUM>>
  | ListConfigEntry<Exclude<T, ConfigType.ENUM>>
  | EnumConfigEntry
  | EnumListConfigEntry;

export type ConfigSchema = Record<string, ConfigEntry<ConfigType>>;

/**
 * Whether a config entry is an enum (single or list) — i.e. one whose value is
 * drawn from a declared `options` set. Narrows to the option-carrying entry
 * shapes so callers can read `entry.options`.
 */
export function isEnumEntry(
  entry: ConfigEntry<ConfigType> | undefined
): entry is EnumConfigEntry | EnumListConfigEntry {
  if (!entry) return false;
  const base = Array.isArray(entry.type) ? entry.type[0] : entry.type;
  return base === ConfigType.ENUM;
}

/**
 * Resolved value type of an entry, before factoring in default presence. Enum
 * entries narrow to the literal union of their `options`; everything else maps
 * through {@link ResolveType}.
 */
type ResolvedEntryValue<E extends ConfigEntry<ConfigType>> = E extends {
  type: ConfigType.ENUM;
  options: readonly (infer V)[];
}
  ? V
  : E extends { type: ListOf<ConfigType.ENUM>; options: readonly (infer V)[] }
    ? V[]
    : ResolveType<E["type"]>;

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
  ? ResolvedEntryValue<E>
  : ResolvedEntryValue<E> | undefined;

export type ConfigData<TSchema extends ConfigSchema> = {
  [K in keyof TSchema]: ConfigEntryValue<TSchema[K]>;
};

export class ConfigProvider<TSchema extends ConfigSchema> {
  private module: Module<TSchema>;
  private readonly data: ConfigData<TSchema>;
  readonly t: TFunction;

  constructor(
    module: Module<TSchema>,
    data: ConfigData<TSchema>,
    locale: string
  ) {
    this.module = module;
    this.data = data;
    this.t = createT(locale, module.id);
  }

  get schema() {
    return this.module.config;
  }

  get<TKey extends keyof TSchema>(key: TKey): ConfigEntryValue<TSchema[TKey]> {
    return this.data[key];
  }
}
