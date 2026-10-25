import type { Client, GatewayIntentBits } from "discord.js";
import type { Module } from "#lib/module.js";

/** A module left out at startup because Discord did not grant an intent it needs. */
export interface UnavailableModule {
  module: Module;
  missingIntents: GatewayIntentBits[];
}

export let modules: Module[] = [];
export let unavailableModules: UnavailableModule[] = [];
export let client!: Client;

export function setRuntime(
  loadedModules: Module[],
  discordClient: Client,
  unavailable: UnavailableModule[] = []
) {
  modules = loadedModules;
  unavailableModules = unavailable;
  client = discordClient;
}
