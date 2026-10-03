import pino from "pino";
import { isDevMode } from "./env.js";

function resolveLevel(): pino.LevelWithSilent {
  switch (process.env["LOG_LEVEL"]) {
    case "fatal":
    case "error":
    case "warn":
    case "info":
    case "debug":
    case "trace":
    case "silent":
      return process.env["LOG_LEVEL"];
    default:
      return isDevMode() ? "debug" : "info";
  }
}

const base = pino({
  level: resolveLevel(),
  ...(isDevMode() && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "yyyy-mm-dd HH:MM:ss",
        ignore: "pid,hostname",
        messageFormat: "{if name}[{name}] {end}{msg}",
      },
    },
  }),
});

export const loggerMaker = (name?: string) =>
  name ? base.child({ name }) : base;

const logger = loggerMaker();

console.log = logger.info.bind(logger);
console.error = logger.error.bind(logger);
console.warn = logger.warn.bind(logger);
console.debug = logger.debug.bind(logger);
console.info = logger.info.bind(logger);

export default logger;
