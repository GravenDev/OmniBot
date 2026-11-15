import type { ConfigProvider } from "#lib/config.js";
import { declareService, type Service } from "#lib/service.js";
import type { BirthdayConfigSchema } from "#modules/birthday/birthday.config.js";
import { logFailure } from "#modules/birthday/failures.js";

class RoleService implements Service {
  /**
   * Takes the birthday role back from a member whose birthday is no longer
   * announced, without waiting for the next day.
   */
  async drop(
    config: ConfigProvider<BirthdayConfigSchema>,
    guildId: string,
    userId: string
  ): Promise<void> {
    const role = config.get("role");
    const member = role?.members.get(userId);
    if (!role || !member) {
      return;
    }
    await member.roles
      .remove(role)
      .catch((err: unknown) =>
        logFailure(
          err,
          `Failed to take back the birthday role | guildId = ${guildId}`
        )
      );
  }
}

export default declareService(new RoleService());
