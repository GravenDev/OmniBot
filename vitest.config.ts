import {
  configDefaults,
  defineConfig,
  type TestProjectInlineConfiguration,
} from "vitest/config";

const integrationGlob = "src/**/*.integration.test.ts";

// Exported for vitest.stryker.config.ts: mutation testing runs these tests
// alone, the integration ones needing PostgreSQL.
export const unitProject = {
  test: {
    name: "unit",
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "lint/**/*.test.ts"],
    exclude: [...configDefaults.exclude, integrationGlob],
  },
} satisfies TestProjectInlineConfiguration;

// Shared with vitest.stryker.config.ts too.
export const resolve = {
  // Resolve `#*` subpath imports to ./src (mirrors tsconfig customConditions).
  conditions: ["development"],
};

export default defineConfig({
  resolve,
  test: {
    // Off unless asked (`pnpm test:coverage`): CI turns it on for SonarCloud,
    // which reads coverage/lcov.info.
    // Every file SonarCloud analyses must be measured here or listed in
    // sonar.coverage.exclusions (sonar-project.properties), or it reads 0 %.
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcovonly"],
      // Not lint/omnibot.js: its rules run inside oxlint, which Node's
      // coverage cannot follow. The commitlint rule is a plain module.
      include: [
        "src/**/*.ts",
        "scripts/**/*.ts",
        "bootstrap/**/*.ts",
        "lint/commit-subject.js",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.preview.ts",
        // Fakes for the tests, not code of the bot.
        "src/lib/testing.ts",
        "**/*.fakes.ts",
        "src/generated/**",
        "src/**/*.d.ts",
      ],
    },
    projects: [
      unitProject,
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
