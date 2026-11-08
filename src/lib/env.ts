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
 * at startup in dev mode (see bootstrap/validate-env-vars.ts).
 */
export function devGuildId(): string | undefined {
  return process.env["DEV_GUILD_ID"];
}

/**
 * Optional push URL of an Uptime Kuma monitor, when it is a valid http(s) URL.
 * Unset, empty or invalid: the bot runs without monitoring (an invalid one is
 * reported at startup, see bootstrap/validate-env-vars.ts). Secret, since its
 * token is enough to report a status: never log it.
 */
export function uptimeKumaPushUrl(): URL | undefined {
  const raw = process.env["UPTIME_KUMA_PUSH_URL"];
  if (!raw) {
    return undefined;
  }
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}
