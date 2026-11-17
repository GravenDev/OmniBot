import { declareEventListener } from "#lib/listener.js";
import type { HoneypotConfigSchema } from "#modules/honeypot/honeypot.config.js";
import trap from "#modules/honeypot/services/trap.service.js";

export default declareEventListener<"messageCreate", HoneypotConfigSchema>({
  eventType: "messageCreate",

  async execute(message, config) {
    if (config) {
      await trap.springTrap(message, config);
    }
  },
});
