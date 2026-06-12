import { ConfigType } from "../../lib/config.js";
import type { ConfigTypeHandler } from "./config-type-handler.js";
import NumberConfigHandler from "./number-config-handler.js";
import StringConfigHandler from "./string-config-handler.js";

const handlers: Record<ConfigType, ConfigTypeHandler<ConfigType> | null> = {
  [ConfigType.STRING]: new StringConfigHandler(),
  [ConfigType.NUMBER]: new NumberConfigHandler(),
  [ConfigType.BOOLEAN]: null,
  [ConfigType.USER]: null,
  [ConfigType.ROLE]: null,
  [ConfigType.CHANNEL]: null,
  [ConfigType.CATEGORY]: null,
};

export default handlers;
