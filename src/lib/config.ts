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
  NUMBER: (value: string) => !isNaN(Number(value)),
  BOOLEAN: (value: string) =>
    value.toLowerCase() === "true" || value.toLowerCase() === "false",
  USER: (value: string) => /^<@!?(\d+)>$/.test(value),
  ROLE: (value: string) => /^<@&(\d+)>$/.test(value),
  CHANNEL: (value: string) => /^<#(\d+)>$/.test(value),
  CATEGORY: (value: string) => /^<#(\d+)>$/.test(value),
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

export type ConfigData<TSchema extends ConfigSchema> = {
  [K in keyof TSchema]: ResolveType<TSchema[K]["type"]>;
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

  get<TKey extends keyof TSchema>(
    key: TKey
  ): ResolveType<TSchema[TKey]["type"]> {
    return this.data[key];
  }
}
