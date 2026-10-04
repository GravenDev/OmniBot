import type { Client } from "discord.js";
import type { Module } from "#lib/module.js";

export const modules: Module[] = [];

export let client: Client;

export function setClient(value: Client): void {
  client = value;
}
