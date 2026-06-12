import { defineModule } from "../lib/module.js";
import configCommand from "./commands/config.command.js";
import moduleCommand from "./commands/module.command.js";
import configTypeHandlers from "./config/config-type-handlers.js";
import configureModuleButton from "./interactions/configure-module.button.js";
import disableModuleButton from "./interactions/disable-module.button.js";
import enableModuleButton from "./interactions/enable-module.button.js";
import toggleOptionButton from "./interactions/toggle-option.button.js";
import commandListener from "./listeners/interaction-create.listener.js";

export default defineModule({
  id: "core",
  name: "Core Module",
  description:
    "The core module of the application, managing core commands and events. It is always loaded.",
  version: "1.1.1",
  intents: [],
  onLoad(_, registry) {
    // Register the core module's commands and events in the provided registry
    registry.register(moduleCommand);
    registry.register(configCommand);

    registry.register(commandListener);

    registry.register(enableModuleButton);
    registry.register(disableModuleButton);

    registry.register(configureModuleButton);
    registry.register(toggleOptionButton);

    for (const [, handler] of Object.entries(configTypeHandlers)) {
      handler?.registerEditionInteractionHandlers(registry);
    }
  },
  onInstall() {
    throw new Error("Core module cannot be installed or uninstalled.");
  },
  onUninstall() {
    throw new Error("Core module cannot be installed or uninstalled.");
  },
});
