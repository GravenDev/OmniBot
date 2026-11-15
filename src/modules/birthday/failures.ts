import { isGuildSetupError } from "#lib/discord-errors.js";
import { loggerMaker } from "#lib/logger.js";

const logger = loggerMaker("birthday");

export function logFailure(err: unknown, message: string): void {
  if (isGuildSetupError(err)) {
    logger.warn({ err }, message);
  } else {
    logger.error({ err }, message);
  }
}
