import { configDefaults, defineConfig } from "vitest/config";

const integrationGlob = "src/**/*.integration.test.ts";

export default defineConfig({
  // Resolve `#*` subpath imports to ./src (mirrors tsconfig customConditions).
  resolve: {
    conditions: ["development"],
  },
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: [...configDefaults.exclude, integrationGlob],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: [integrationGlob],
        },
      },
    ],
  },
});
