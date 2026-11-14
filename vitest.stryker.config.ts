// The vitest configuration Stryker runs (stryker.config.js): the unit tests
// alone. Its vitest runner takes no --project, and the integration tests need
// PostgreSQL, which the mutation job does not start.
import { defineConfig } from "vitest/config";
import { resolve, unitProject } from "./vitest.config.ts";

export default defineConfig({ resolve, test: unitProject.test });
