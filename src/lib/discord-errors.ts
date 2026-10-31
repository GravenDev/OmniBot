import { DiscordAPIError } from "discord.js";

export function isApiError(err: unknown, ...codes: number[]): boolean {
  return err instanceof DiscordAPIError && codes.includes(err.code as number);
}
