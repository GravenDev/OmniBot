import { ConfigType } from "../../lib/config.js";
import CategoryConfigHandler from "./category.config-handler.js";
import ChannelConfigHandler from "./channel.config-handler.js";
import type { ConfigTypeHandler } from "./config-handler.js";
import EnumConfigHandler from "./enum.config-handler.js";
import NumberConfigHandler from "./number.config-handler.js";
import RoleConfigHandler from "./role.config-handler.js";
import StringConfigHandler from "./string.config-handler.js";
import UserConfigHandler from "./user.config-handler.js";

const handlers: Record<ConfigType, ConfigTypeHandler<ConfigType> | null> = {
  [ConfigType.STRING]: new StringConfigHandler(),
  [ConfigType.NUMBER]: new NumberConfigHandler(),
  // Booleans are edited via the toggle-option button, not a type handler.
  [ConfigType.BOOLEAN]: null,
  [ConfigType.USER]: new UserConfigHandler(),
  [ConfigType.ROLE]: new RoleConfigHandler(),
  [ConfigType.CHANNEL]: new ChannelConfigHandler(),
  [ConfigType.CATEGORY]: new CategoryConfigHandler(),
  [ConfigType.ENUM]: new EnumConfigHandler(),
};

export default handlers;
