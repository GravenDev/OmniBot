import type { Client } from "discord.js";
import type { Module } from "#lib/module.js";

export let modules: Module[] = [];
export let client!: Client;

export function setRuntime(loadedModules: Module[], discordClient: Client) {
  modules = loadedModules;
  client = discordClient;
}
