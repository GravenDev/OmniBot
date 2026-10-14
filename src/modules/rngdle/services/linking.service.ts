import { loggerMaker } from "#lib/logger.js";
import { declareService, type Service } from "#lib/service.js";
import api, { RngdleUserNotFoundError } from "./api.service.js";
import store, { type RegisterResult } from "./store.service.js";
import sync from "./sync.service.js";

const logger = loggerMaker("rngdle");

export type LinkOutcome =
  | { kind: RegisterResult; count: number }
  | { kind: "notFound" }
  | { kind: "unreachable" }
  | { kind: "conflict"; userId: string };

export type SelfLinkOutcome =
  | LinkOutcome
  | { kind: "alreadyLinked"; username: string };

export class LinkingService implements Service {
  private async ownUsername(
    guildId: string,
    userId: string,
    username: string
  ): Promise<string | { kind: "alreadyLinked"; username: string }> {
    const current = await store.account(guildId, userId);
    if (!current) {
      return username;
    }
    return current.username.toLowerCase() === username.toLowerCase()
      ? current.username
      : { kind: "alreadyLinked", username: current.username };
  }

  linkAccount(
    guildId: string,
    userId: string,
    username: string
  ): Promise<LinkOutcome> {
    return this.link(guildId, userId, username, false) as Promise<LinkOutcome>;
  }

  linkOwnAccount(
    guildId: string,
    userId: string,
    username: string
  ): Promise<SelfLinkOutcome> {
    return this.link(guildId, userId, username, true);
  }

  private async link(
    guildId: string,
    userId: string,
    requested: string,
    keepExisting: boolean
  ): Promise<SelfLinkOutcome> {
    let username = requested;
    let since: Date | null = null;
    if (keepExisting) {
      const own = await this.ownUsername(guildId, userId, username);
      if (typeof own !== "string") {
        return own;
      }
      username = own;
      since = await store.latestRollDate(guildId, userId);
    }
    const taken = await store.accountByUsername(guildId, username);
    if (taken && taken.userId !== userId) {
      return { kind: "conflict", userId: taken.userId };
    }

    let rolls;
    try {
      rolls = await api.fetchUserRolls(username, since);
    } catch (err) {
      if (err instanceof RngdleUserNotFoundError) {
        return { kind: "notFound" };
      }
      logger.warn({ err }, `rngdle.com unreachable | username = ${username}`);
      return { kind: "unreachable" };
    }

    return sync.exclusive(guildId, async (): Promise<SelfLinkOutcome> => {
      let name = username;
      if (keepExisting) {
        const own = await this.ownUsername(guildId, userId, name);
        if (typeof own !== "string") {
          return own;
        }
        name = own;
      }
      const holder = await store.accountByUsername(guildId, name);
      if (holder && holder.userId !== userId) {
        return { kind: "conflict", userId: holder.userId };
      }
      const kind = await store.register(guildId, userId, name);
      const { inserted } = await store.saveRolls(
        { guildId, userId, username: name },
        rolls
      );
      return { kind, count: inserted };
    });
  }
}

export default declareService(new LinkingService());
