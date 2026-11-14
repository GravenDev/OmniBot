import { configDefaults, defineConfig } from "vitest/config";

const integrationGlob = "src/**/*.integration.test.ts";

export default defineConfig({
  // Resolve `#*` subpath imports to ./src (mirrors tsconfig customConditions).
  resolve: {
    conditions: ["development"],
  },
  test: {
    // Off unless asked (`pnpm test:coverage`): CI turns it on for SonarCloud,
    // which reads coverage/lcov.info.
    // Every file SonarCloud analyses must be measured here or listed in
    // sonar.coverage.exclusions (sonar-project.properties), or it reads 0 %.
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcovonly"],
      // Not lint/: its rules run inside oxlint, which Node's coverage cannot
      // follow.
      include: ["src/**/*.ts", "scripts/**/*.ts", "bootstrap/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.preview.ts",
        // Fakes for the tests, not code of the bot.
        "src/lib/testing.ts",
        "src/generated/**",
        "src/**/*.d.ts",
      ],
    },
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: [
            "src/**/*.test.ts",
            "scripts/**/*.test.ts",
            "lint/**/*.test.ts",
          ],
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
