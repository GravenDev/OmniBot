import { constants } from "node:fs";
import { open, rm } from "node:fs/promises";
import { loggerMaker } from "#lib/logger.js";
import type { Reporter } from "./heartbeat.js";

const logger = loggerMaker("monitoring");

/**
 * Read by the image's HEALTHCHECK. The container's /tmp is a tmpfs (the root
 * filesystem is read-only), so the file never outlives the container.
 */
export const HEALTH_FILE = "/tmp/omnibot-health";

/**
 * Touches the health file on each heartbeat that reports up, and removes it
 * on one that reports down. Docker's HEALTHCHECK only looks at how recent the
 * file is: a stuck process stops touching it, a down bot removes it.
 */
export function healthFileReporter(path = HEALTH_FILE): Reporter {
  // Logged on change only: a path that cannot be written (no /tmp, read-only
  // filesystem without a tmpfs) would otherwise repeat every 30 s.
  let failing = false;
  return async (health) => {
    try {
      if (health.up) {
        await touch(path);
      } else {
        await clearHealthFile(path);
      }
      if (failing) {
        logger.info("Health file updated again");
        failing = false;
      }
    } catch (err) {
      if (!failing) {
        logger.warn(
          { err },
          "Health file not written, the container healthcheck will fail"
        );
        failing = true;
      }
    }
  };
}

// A fixed path in a shared temp directory: created for the bot's user only,
// and never written through a symbolic link someone else planted there
// (O_NOFOLLOW makes the open fail instead). In the container, /tmp is a tmpfs
// of its own, but the bot can also run on a shared host.
const WRITE_FLAGS =
  constants.O_WRONLY |
  constants.O_CREAT |
  constants.O_TRUNC |
  (constants.O_NOFOLLOW ?? 0);

async function touch(path: string): Promise<void> {
  const file = await open(path, WRITE_FLAGS, 0o600);
  try {
    await file.writeFile(`${new Date().toISOString()}\n`);
  } finally {
    await file.close();
  }
}

export async function clearHealthFile(path = HEALTH_FILE): Promise<void> {
  await rm(path, { force: true });
}
