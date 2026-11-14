// Mutation testing (`pnpm mutation`, weekly in .github/workflows/mutation.yml):
// Stryker changes the code one operator at a time and checks that a unit test
// fails. A mutant that survives points at code the tests run but never check.
import { fileURLToPath } from "node:url";

// The report goes to the Stryker Dashboard only with an API key: without one
// the upload is refused (401) and only logged, so it is not even attempted.
const dashboard = process.env.STRYKER_DASHBOARD_API_KEY ? ["dashboard"] : [];

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  // pnpm's isolated node_modules hides the runner from Stryker's plugin
  // discovery, which looks next to @stryker-mutator/core: load it by path.
  plugins: [
    fileURLToPath(import.meta.resolve("@stryker-mutator/vitest-runner")),
  ],
  vitest: { configFile: "vitest.stryker.config.ts" },
  // The shared helpers, the commit subject rule and the pure dev scripts.
  // Out: what the unit tests cannot judge — drawing on a canvas, where most
  // mutants change a colour or a pixel offset; the logger and the Prisma
  // client, which read the environment when loaded; the lint rules, which run
  // inside oxlint; the scripts that run as a whole when loaded (new-module,
  // export-dj4h-rngdle) or draw images (render-preview).
  // The CLI entry points of copy-check and find-similar are tested by running
  // the script in a child process, which Stryker's vitest runner does not
  // tell the active mutant: their mutants show as not covered, not as gaps.
  mutate: [
    "src/lib/**/*.ts",
    "!src/lib/**/*.test.ts",
    "!src/lib/testing.ts",
    "!src/lib/celebration-card.ts",
    "!src/lib/confetti-3d.ts",
    "!src/lib/imaging.ts",
    "!src/lib/stat-card.ts",
    "!src/lib/table.ts",
    "!src/lib/logger.ts",
    "!src/lib/database.ts",
    "lint/commit-subject.js",
    "scripts/copy-check.ts",
    "scripts/find-similar.ts",
    "scripts/release-notes.ts",
    "scripts/source-files.ts",
  ],
  coverageAnalysis: "perTest",
  // A mutant in code run only when a file loads (a top-level constant) needs
  // every test file reloaded: most of the run's time for a few mutants.
  ignoreStatic: true,
  // Mutants whose code and tests have not changed keep their last result:
  // the CI restores this file from the previous run.
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
  reporters: ["clear-text", "progress", "html", "json", ...dashboard],
  // No version: Stryker reads the branch from GITHUB_REF on GitHub Actions, so
  // a key that reaches another branch's run files that branch's report, never
  // master's. Run outside CI, the report is not sent at all.
  dashboard: { project: "github.com/GravenDev/OmniBot" },
  // Stryker rewrites the `extends` and `references` of tsconfig.json for its
  // sandbox through TypeScript's JavaScript API, which TypeScript 7 (native)
  // no longer has. tsconfig.json uses neither: point Stryker at a file that
  // does not exist, and it skips the rewrite.
  tsconfigFile: "tsconfig.stryker-none.json",
};
