import { declareEventListener } from "#lib/listener.js";
import type { HoneypotConfigSchema } from "#modules/honeypot/honeypot.config.js";
import { springTrap } from "#modules/honeypot/services/trap.js";

export default declareEventListener<"messageCreate", HoneypotConfigSchema>({
  eventType: "messageCreate",

  async execute(message, config) {
    if (config) {
      await springTrap(message, config);
    }
  },
});
