// The bot's own source files, as the reuse checks (copy-check, find-similar)
// see them: tracked or new `.ts` files under src/, without tests, previews and
// type declarations, whose code is not shared on purpose.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

export function isSourceFile(file: string): boolean {
  return (
    file.startsWith("src/") &&
    file.endsWith(".ts") &&
    !/\.(test|integration\.test|preview|d)\.ts$/.test(file)
  );
}

/** Repository-relative paths, tracked and untracked (ignored files excepted). */
export function sourceFiles(cwd: string): string[] {
  const out = execFileSync(
    "git",
    [
      // Accented paths as they are, not quoted and escaped.
      "-c",
      "core.quotePath=false",
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "src",
    ],
    { cwd, encoding: "utf8" }
  );
  return [...new Set(out.split("\n"))].filter(isSourceFile).sort(byCodePoint);
}

/**
 * The part of the bot a file belongs to: each module is one
 * (`src/modules/birthday`), and so is each other folder of src/ (`src/lib`).
 */
export function subsystemOf(file: string): string {
  const parts = file.split("/");
  if (parts[1] === "modules" && parts.length > 3)
    return parts.slice(0, 3).join("/");
  return parts.length > 2 ? parts.slice(0, 2).join("/") : file;
}

/**
 * Orders strings by their UTF-8 bytes, as git does: the same on every
 * machine, whatever the locale (localeCompare follows LANG), and beyond the
 * BMP too (`<` compares UTF-16 units, which differ there).
 */
export function byCodePoint(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}

/**
 * A file's content, or null when it is gone: a file listed a moment ago may
 * be deleted before it is read (an edit running beside), and reading at once
 * leaves no gap between a check and the read.
 */
export function readIfPresent(full: string): string | null {
  try {
    return fs.readFileSync(full, "utf8");
  } catch (err) {
    // Gone, or a directory on its path replaced by a file.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw err;
  }
}
