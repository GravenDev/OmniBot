import { loggerMaker } from "#lib/logger.js";
import { declareService, type Service } from "#lib/service.js";
import {
  parseRollBadges,
  type RollBadges,
} from "#modules/rngdle/parsing/roll-badges.js";

const logger = loggerMaker("rngdle");

const BADGES_URL = "https://rng.cubityfir.st/api";
const USER_AGENT = "OmniBot (+https://github.com/GravenDev/OmniBot)";
const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_SIZE = 500;

async function requestRollBadges(number: number): Promise<RollBadges> {
  const response = await fetch(`${BADGES_URL}?n=${number}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const badges = parseRollBadges(number, await response.json());
  if (!badges) {
    throw new Error("Unexpected response");
  }
  return badges;
}

class RngdleBadges implements Service {
  private readonly cache = new Map<number, Promise<RollBadges>>();

  async fetchRollBadges(number: number): Promise<RollBadges | null> {
    let badges = this.cache.get(number);
    if (!badges) {
      badges = requestRollBadges(number);
      this.cache.set(number, badges);
      if (this.cache.size > CACHE_SIZE) {
        this.cache.delete(this.cache.keys().next().value!);
      }
    }
    try {
      return await badges;
    } catch (err) {
      if (this.cache.get(number) === badges) {
        this.cache.delete(number);
        logger.warn({ err }, `Could not fetch the badges | number = ${number}`);
      }
      return null;
    }
  }
}

export default declareService(new RngdleBadges());
