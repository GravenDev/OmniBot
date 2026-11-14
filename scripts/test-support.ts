// Helpers for the tests of scripts/ that run a script's entry point
// in-process (so that coverage counts it).
import { vi } from "vitest";

/**
 * Drops GIT_DIR and the like for the current test: set when the tests run
 * under a git hook, they would point the fixtures' git commands at the real
 * repository. Undone by vi.unstubAllEnvs().
 */
export function dropGitEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("GIT_")) vi.stubEnv(key, undefined);
  }
}

/** The environment without GIT_DIR and the like, for a child process. */
export function envWithoutGit(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))
  );
}

/** Runs `run`, with what it writes to stdout and stderr captured. */
export function captureOutput(run: () => number | void): {
  status: number;
  stdout: string;
  stderr: string;
} {
  let stdout = "";
  let stderr = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  const err = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  try {
    return { status: run() ?? 0, stdout, stderr };
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
}
