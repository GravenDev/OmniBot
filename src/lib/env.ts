/**
 * Whether the bot is running in development mode.
 *
 * Enabled when `NODE_ENV` is set to `development` (see the `dev` npm script).
 * Production runs (`start`) leave it unset, so dev-only features stay off.
 */
export function isDevMode(): boolean {
  return process.env["NODE_ENV"] === "development";
}
