import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";

// Prisma 7 talks to Postgres through node-postgres, so the pool settings are
// pg's: up to 10 connections. pg waits forever for a connection by default;
// 5 s matches Prisma 6's connect_timeout, so a database that is down fails the
// startup probe instead of hanging it.
const adapter = new PrismaPg({
  connectionString: process.env["DATABASE_URL"],
  connectionTimeoutMillis: 5_000,
});

const prisma = new PrismaClient({ adapter });

export default prisma;
export { Prisma };
