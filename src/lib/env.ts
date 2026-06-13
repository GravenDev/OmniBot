/**
 * Whether the bot is running in development mode.
 *
 * Enabled when `NODE_ENV` is set to `development` (see the `dev` npm script).
 * Production runs (`start`) leave it unset, so dev-only features stay off.
 */
export function isDevMode(): boolean {
  return process.env["NODE_ENV"] === "development";
}

/**
 * In development, the guild where core commands are registered instantly
 * (instead of globally, which can take ~1h to propagate). Validated as required
 * at startup in dev mode (see bootstrap/validate-env-vars.mjs).
 */
export function devGuildId(): string | undefined {
  return process.env["DEV_GUILD_ID"];
}
