import { existsSync } from "fs";
import path from "path";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer reads .env by itself. CI and the images have none: they
// pass DATABASE_URL in the environment.
if (existsSync(".env")) process.loadEnvFile();

// `env("DATABASE_URL")` from prisma/config would throw when the variable is
// unset, and `prisma generate` runs without a database (CI, image build).
// Commands that do connect (migrate, studio) report the missing URL themselves.
const url = process.env["DATABASE_URL"];

export default defineConfig({
  schema: path.join("src", "prisma"),
  datasource: url === undefined ? {} : { url },
});
