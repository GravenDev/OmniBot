import pino from "pino";

const base = pino({
  level: "debug",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "yyyy-mm-dd HH:MM:ss",
      ignore: "pid,hostname",
      messageFormat: "{if name}[{name}] {end}{msg}",
    },
  },
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
