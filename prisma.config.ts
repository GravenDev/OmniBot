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

// Prisma's multi-file schema: every *.prisma under src/ is part of it, so each
// module keeps its models next to its code. The migrations stay in src/prisma,
// beside dbinfo.prisma (generator + datasource).
export default defineConfig({
  schema: "src",
  migrations: { path: path.join("src", "prisma", "migrations") },
  datasource: url === undefined ? {} : { url },
});
