import winston from "winston";

export const loggerMaker = (name?: string) =>
  winston.createLogger({
    level: "debug",
    format: winston.format.combine(
      winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      winston.format.errors({ stack: true }),
      winston.format.colorize({ all: true }),
      winston.format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] ${name ? `[${name}] ` : ""}${level} : ${message}`;
      })
    ),
    transports: [new winston.transports.Console()],
  });

const logger = loggerMaker();

console.log = logger.info.bind(logger);
console.error = logger.error.bind(logger);
console.warn = logger.warn.bind(logger);
console.debug = logger.debug.bind(logger);
console.info = logger.info.bind(logger);

export default logger;
